import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const extensions = new Map([
    ...['.png', '.jpg', '.jpeg', '.webp', '.gif'].map(value => [value, 'image']),
    ...['.mp4', '.mov', '.webm'].map(value => [value, 'video']),
    ...['.wav', '.mp3', '.ogg', '.m4a', '.flac', '.opus'].map(value => [value, 'audio']),
    ...['.srt', '.vtt', '.txt', '.json', '.csv', '.glb', '.zip', '.pdf'].map(value => [value, 'file']),
]);
function inside(root, target) {
    const relative = path.relative(root, target);
    return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
function sourceName(value) {
    if (!value || value.length > 2048 || path.isAbsolute(value) || value.split(/[\\/]/).some(part => !part || part === '..' || part.startsWith('.')) || /[\x00-\x1f:]/.test(value)) throw new Error('请选择素材目录中的普通相对路径。');
    return value;
}
function outputName(value) {
    if (!value || value.length > 200 || value.startsWith('.') || /[\x00-\x1f<>:"/\\|?*]/.test(value) || /[. ]$/.test(value) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(value)) throw new Error('下载文件名无效，请使用普通文件名。');
    return value;
}
async function smallJSON(file) {
    if ((await fs.lstat(file)).isSymbolicLink()) throw new Error('上传记录不能是符号链接。');
    const handle = await fs.open(file, 'r');
    try {
        if (!(await handle.stat()).isFile() || (await handle.stat()).size > 16384) throw new Error('上传记录无效。');
        return JSON.parse(await handle.readFile('utf8'));
    } finally { await handle.close(); }
}

export class NativeMedia {
    #client;
    #policy;
    #active = 0;
    constructor(client) {
        if (!client.media) throw new Error('连接尚未配置素材目录。');
        this.#client = client;
        this.#policy = structuredClone(client.media);
    }
    async #root() {
        const root = await fs.realpath(path.resolve(this.#policy.root));
        if (!(await fs.stat(root)).isDirectory()) throw new Error('素材目录不存在。');
        return root;
    }
    async #transfer(operation) {
        if (this.#active >= 2) throw new Error('已有两项素材正在传输，请完成后再试。');
        this.#active++;
        try { return await operation(); } finally { this.#active--; }
    }
    async #user(signal) {
        const session = await this.#client.request('GET', '/api/auth/session', undefined, { signal });
        if (!session.user?.id) throw new Error('影策会话已失效，请重新连接。');
        return session.user.id;
    }
    async list(directory = '', page = 1, pageSize = 20, signal) {
        await this.#user(signal);
        if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) throw new Error('素材分页参数无效。');
        const root = await this.#root(), target = directory ? await fs.realpath(path.join(root, sourceName(directory))) : root;
        if (!inside(root, target) || !(await fs.stat(target)).isDirectory()) throw new Error('目录不在允许的素材范围内。');
        const entries = (await fs.readdir(target, { withFileTypes: true })).filter(item => !item.name.startsWith('.') && (item.isDirectory() || (item.isFile() && extensions.has(path.extname(item.name).toLowerCase())))).sort((a, b) => a.name.localeCompare(b.name));
        const files = [], directories = [];
        for (const item of entries.slice((page - 1) * pageSize, page * pageSize)) {
            const relative = path.relative(root, path.join(target, item.name));
            if (item.isDirectory()) { directories.push(relative); continue; }
            const info = await fs.stat(path.join(target, item.name));
            files.push({ path: relative, bytes: info.size, kind: extensions.get(path.extname(item.name).toLowerCase()), withinLimit: info.size > 0 && info.size <= this.#policy.maxBytes });
        }
        return { files, directories, page, pageSize, hasMore: page * pageSize < entries.length, maxBytes: this.#policy.maxBytes };
    }
    async #intent(root, userId, key, digest, size) {
        const directory = path.join(root, '.yingce-upload-intents-' + hash(this.#client.platformOrigin + '\n' + userId));
        await fs.mkdir(directory, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
        if (await fs.realpath(directory) !== directory) throw new Error('上传记录目录不能是符号链接。');
        const file = path.join(directory, hash(key) + '.json');
        let value;
        try {
            const handle = await fs.open(file, 'wx', 0o600);
            value = { version: 1, sha256: digest, size, nativeKey: 'mcp-upload:' + hash(key + '\n' + digest) };
            try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
            try { value = await smallJSON(file); } catch { throw new Error('原上传记录暂不可读，请稍后按原编号查询。'); }
            if (value.version !== 1 || value.sha256 !== digest || value.size !== size || value.nativeKey !== 'mcp-upload:' + hash(key + '\n' + digest)) throw new Error('同一上传编号已用于不同文件，请使用新的编号。');
        }
        return { file, value };
    }
    async #saveIntent(intent, value) {
        const temporary = intent.file + '.pending-' + crypto.randomUUID();
        try {
            await fs.writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
            await fs.rename(temporary, intent.file);
            intent.value = value;
        } finally { await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    }
    async upload(relativePath, idempotencyKey, signal) {
        return this.#transfer(async () => {
            const root = await this.#root(), requested = sourceName(relativePath), source = await fs.realpath(path.join(root, requested));
            if (!inside(root, source)) throw new Error('文件不在允许的素材目录内。');
            const kind = extensions.get(path.extname(source).toLowerCase());
            if (!kind) throw new Error('该文件类型不属于可上传素材。');
            const file = await fs.open(source, 'r');
            let uploadId;
            try {
                const before = await file.stat();
                if (!before.isFile() || before.size <= 0 || before.size > this.#policy.maxBytes) throw new Error('文件为空或超过本连接的传输上限。');
                const userId = await this.#user(signal);
                const original = crypto.createHash('sha256');
                for await (const chunk of file.createReadStream({ start: 0, autoClose: false, signal })) original.update(chunk);
                const digest = original.digest('hex');
                const intent = await this.#intent(root, userId, idempotencyKey, digest, before.size);
                if (intent.value.uploadId) {
                    if (!/^[A-Za-z0-9_-]{1,80}$/.test(intent.value.uploadId)) throw new Error('原上传会话记录无效。');
                    await this.#client.request('DELETE', '/api/resources/uploads/' + encodeURIComponent(intent.value.uploadId), undefined, { signal }).catch(error => { if (error.status !== 404) throw error; });
                    await this.#saveIntent(intent, { ...intent.value, uploadId: undefined });
                }
                if (intent.value.resourceId) {
                    const { resource } = await this.#client.request('GET', '/api/resources/' + encodeURIComponent(intent.value.resourceId), undefined, { signal });
                    if (resource.userId !== userId || resource.status !== 'ready' || resource.size !== before.size) throw new Error('原上传资源不可用，请核对平台记录。');
                    return this.#uploadResult(resource, digest, true);
                }
                const pending = await this.#client.request('POST', '/api/resources/uploads', { fileName: path.basename(source), kind, size: before.size, idempotencyKey: intent.value.nativeKey }, { signal });
                if (!/^[A-Za-z0-9_-]{1,80}$/.test(pending.uploadId) || !Number.isSafeInteger(pending.chunkSize) || pending.chunkSize < 1 || pending.chunkSize > 8 * 1024 * 1024 || pending.chunkCount !== Math.ceil(before.size / pending.chunkSize)) throw new Error('平台上传会话参数无效。');
                uploadId = pending.uploadId;
                await this.#saveIntent(intent, { ...intent.value, uploadId });
                const sent = crypto.createHash('sha256');
                for (let index = 0; index < pending.chunkCount; index++) {
                    const position = index * pending.chunkSize, length = Math.min(pending.chunkSize, before.size - position), buffer = Buffer.alloc(length);
                    let read = 0;
                    while (read < length) {
                        const result = await file.read(buffer, read, length - read, position + read);
                        if (!result.bytesRead) throw new Error('源文件在上传时发生变化。');
                        read += result.bytesRead;
                    }
                    sent.update(buffer);
                    await this.#client.uploadChunk(uploadId, index, buffer, { signal });
                }
                const after = await file.stat();
                if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || sent.digest('hex') !== digest) throw new Error('源文件在上传时发生变化，已停止合并。');
                const { resource } = await this.#client.request('POST', `/api/resources/uploads/${uploadId}/complete`, undefined, { signal });
                if (resource.userId !== userId || resource.status !== 'ready' || resource.size !== before.size) throw new Error('平台尚未保存完整资源，请按原编号核对。');
                uploadId = undefined;
                await this.#saveIntent(intent, { ...intent.value, uploadId: undefined, resourceId: resource.id });
                return this.#uploadResult(resource, digest, false);
            } finally {
                await file.close();
                if (uploadId) await this.#client.request('DELETE', '/api/resources/uploads/' + uploadId, undefined).catch(() => {});
            }
        });
    }
    #uploadResult(resource, digest, reused) {
        return { resource: Object.fromEntries(['id', 'kind', 'status', 'size', 'mimeType', 'width', 'height', 'durationMs'].map(key => [key, resource[key]])), sourceSHA256: digest, reused, storageKey: 'resource:' + resource.id };
    }
    async download(resourceId, name, signal) {
        return this.#transfer(async () => {
            const root = await this.#root(), destination = path.join(root, outputName(name));
            try { await fs.lstat(destination); throw new Error('目标文件已存在，请选择新的文件名。'); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
            const { resource } = await this.#client.request('GET', '/api/resources/' + encodeURIComponent(resourceId), undefined, { signal });
            if (resource.status !== 'ready' || !Number.isSafeInteger(resource.size) || resource.size <= 0 || resource.size > this.#policy.maxBytes) throw new Error('资源未就绪或超过本连接的下载上限。');
            const temporary = path.join(root, '.yingce-download-' + crypto.randomUUID() + '.partial');
            const file = await fs.open(temporary, 'wx', 0o600);
            let stream, bytes = 0, digest = crypto.createHash('sha256');
            try {
                stream = await this.#client.openResourceFile(resourceId, { signal });
                for await (const chunk of stream) {
                    bytes += chunk.length;
                    if (bytes > resource.size || bytes > this.#policy.maxBytes) throw new Error('下载内容超过声明的大小。');
                    digest.update(chunk);
                    let written = 0;
                    while (written < chunk.length) {
                        const result = await file.write(chunk, written);
                        if (!result.bytesWritten) throw new Error('下载文件写入中断。');
                        written += result.bytesWritten;
                    }
                }
                if (bytes !== resource.size) throw new Error('下载文件不完整，请按原资源编号重试。');
                await file.sync();
                await file.close();
                try { await fs.link(temporary, destination); }
                catch (error) {
                    if (!['EXDEV', 'EPERM', 'EOPNOTSUPP', 'ENOTSUP'].includes(error.code)) throw error;
                    await fs.copyFile(temporary, destination, constants.COPYFILE_EXCL);
                }
                return { resourceId, localPath: destination, bytes, sha256: digest.digest('hex') };
            } catch (error) {
                if (error.code === 'EEXIST') throw new Error('目标文件已存在，请选择新的文件名。');
                throw error;
            } finally {
                stream?.destroy();
                await file.close().catch(() => {});
                await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
            }
        });
    }
}
