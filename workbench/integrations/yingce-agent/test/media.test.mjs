import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { NativeMedia } from '../media.mjs';

const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function directory(t) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yingce-media-test-'));
    t.after(async () => {
        const resolved = path.resolve(root);
        assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
        assert.ok(path.basename(resolved).startsWith('yingce-media-test-'));
        await fs.rm(resolved, { recursive: true });
    });
    return root;
}
class NativeFixture {
    constructor(root) { this.media = { root, maxBytes: 1024 }; this.platformOrigin = 'https://platform.example'; }
    userId = 'owned-user'; calls = []; sessions = new Map(); resources = new Map(); keys = new Map(); sequence = 0;
    async request(method, route, body, options) {
        this.calls.push({ method, route, body, options });
        if (route === '/api/auth/session') return { user: { id: this.userId } };
        if (method === 'POST' && route === '/api/resources/uploads') {
            const id = 'upload-' + (++this.sequence);
            this.sessions.set(id, { ...body, chunks: [], userId: this.userId });
            return { uploadId: id, chunkSize: 4, chunkCount: Math.ceil(body.size / 4) };
        }
        if (method === 'DELETE') {
            if (!this.sessions.delete(route.split('/').at(-1))) throw Object.assign(new Error('missing'), { status: 404 });
            return { closed: true };
        }
        if (route.endsWith('/complete')) {
            const id = route.split('/').at(-2), session = this.sessions.get(id), key = session.userId + ':' + session.idempotencyKey;
            let resource = this.keys.get(key);
            if (!resource) {
                resource = { id: 'resource-' + this.resources.size, status: 'ready', userId: session.userId, size: session.size, kind: session.kind, mimeType: 'application/octet-stream' };
                this.resources.set(resource.id, { resource, bytes: Buffer.concat(session.chunks) }); this.keys.set(key, resource);
            }
            this.sessions.delete(id); return { resource };
        }
        const value = this.resources.get(route.split('/').at(-1));
        if (!value || value.resource.userId !== this.userId) throw Object.assign(new Error('missing'), { status: 404 });
        return { resource: value.resource };
    }
    async uploadChunk(id, index, bytes, options) {
        this.sessions.get(id).chunks[index] = Buffer.from(bytes);
        await this.onChunk?.(id, index, options);
    }
    async openResourceFile(id) { return Readable.from([this.resources.get(id).bytes]); }
}

test('native upload keeps source bytes and resumes the original ready resource across clients', async t => {
    const root = await directory(t), source = Buffer.from('actual-source-payload');
    await fs.writeFile(path.join(root, 'source.txt'), source);
    const client = new NativeFixture(root), first = await new NativeMedia(client).upload('source.txt', 'upload-one-stable-intent');
    assert.equal(first.sourceSHA256, digest(source));
    assert.deepEqual(client.resources.get(first.resource.id).bytes, source);
    const restored = await new NativeMedia(client).upload('source.txt', 'upload-one-stable-intent');
    assert.equal(restored.resource.id, first.resource.id); assert.equal(restored.reused, true); assert.equal(client.sequence, 1);
    await fs.writeFile(path.join(root, 'source.txt'), Buffer.from('other-source-payload'));
    await assert.rejects(new NativeMedia(client).upload('source.txt', 'upload-one-stable-intent'), /不同文件/);
    assert.equal(client.sequence, 1);
    assert.equal((await new NativeMedia(client).list()).files.length, 1);
});

test('changed source and interrupted chunk close only their native temporary session', async t => {
    const root = await directory(t), file = path.join(root, 'source.txt');
    await fs.writeFile(file, 'original-file');
    const client = new NativeFixture(root);
    client.onChunk = async (_id, index) => { if (index === 0) await fs.writeFile(file, 'changed--file'); };
    await assert.rejects(new NativeMedia(client).upload('source.txt', 'stable-source-change-intent'), /发生变化/);
    assert.equal(client.sessions.size, 0); assert.equal(client.resources.size, 0);
    assert.ok(client.calls.some(call => call.method === 'DELETE'));
    await fs.writeFile(file, 'original-file'); client.onChunk = undefined;
    const recovered = await new NativeMedia(client).upload('source.txt', 'stable-source-change-intent');
    assert.equal(recovered.resource.status, 'ready'); assert.equal(client.resources.size, 1);
    await fs.writeFile(path.join(root, 'abort.txt'), 'abort-file');
    const controller = new AbortController();
    client.onChunk = async () => { controller.abort(); throw new DOMException('stop', 'AbortError'); };
    await assert.rejects(new NativeMedia(client).upload('abort.txt', 'stable-abort-upload-intent', controller.signal));
    assert.equal(client.sessions.size, 0);
    assert.equal(client.calls.filter(call => call.method === 'DELETE').at(-1).options, undefined);
    assert.equal(client.resources.size, 1);
});

test('media root denies traversal, hidden configuration and junction escape before uploading', async t => {
    const root = await directory(t), outside = await directory(t);
    await fs.writeFile(path.join(outside, 'outside.txt'), 'outside');
    await fs.writeFile(path.join(root, '.credentials.json'), '{"secret":"private"}');
    const client = new NativeFixture(root), media = new NativeMedia(client);
    for (const value of ['../outside.txt', path.join(outside, 'outside.txt'), '.credentials.json']) await assert.rejects(media.upload(value, 'blocked-path-upload-intent'));
    await fs.symlink(outside, path.join(root, 'outside-link'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(media.upload('outside-link/outside.txt', 'blocked-link-upload-intent'), /允许的素材目录/);
    assert.equal(client.calls.length, 0);
    assert.equal((await media.list()).files.length, 0);
    assert.equal(await fs.readFile(path.join(outside, 'outside.txt'), 'utf8'), 'outside');
});

test('download saves exact original bytes, refuses overwrite and removes incomplete temporary files', async t => {
    const root = await directory(t), client = new NativeFixture(root), bytes = Buffer.from('download-original');
    client.resources.set('owned-resource', { resource: { id: 'owned-resource', userId: client.userId, status: 'ready', size: bytes.length }, bytes });
    const media = new NativeMedia(client), result = await media.download('owned-resource', 'result.txt');
    assert.equal(result.sha256, digest(bytes)); assert.deepEqual(await fs.readFile(result.localPath), bytes);
    await assert.rejects(media.download('owned-resource', 'result.txt'), /已存在/);
    for (const name of ['../escape.txt', 'NUL', '.credentials.json', 'folder/file.txt']) await assert.rejects(media.download('owned-resource', name), /文件名无效/);
    client.resources.get('owned-resource').resource.size++;
    await assert.rejects(media.download('owned-resource', 'incomplete.txt'), /不完整/);
    await assert.rejects(fs.stat(path.join(root, 'incomplete.txt')), error => error.code === 'ENOENT');
    assert.ok((await fs.readdir(root)).every(name => !name.startsWith('.yingce-download-')));
    assert.deepEqual(await fs.readFile(result.localPath), bytes);
});

test('local media browses subdirectories with pagination and rejects expired sessions', async t => {
    const root = await directory(t), client = new NativeFixture(root), media = new NativeMedia(client);
    await fs.mkdir(path.join(root, 'shots'));
    await fs.writeFile(path.join(root, 'shots', 'one.txt'), 'one');
    await fs.writeFile(path.join(root, 'shots', 'two.txt'), 'two');
    assert.deepEqual((await media.list()).directories, ['shots']);
    const first = await media.list('shots', 1, 1), second = await media.list('shots', 2, 1);
    assert.equal(first.hasMore, true); assert.equal(second.hasMore, false);
    assert.equal(first.files[0].path, path.join('shots', 'one.txt'));
    assert.equal(second.files[0].path, path.join('shots', 'two.txt'));
    client.userId = undefined;
    await assert.rejects(media.list(), /会话已失效/);
    await assert.rejects(media.upload('shots/one.txt', 'expired-session-upload-key'), /会话已失效/);
    assert.equal(client.sequence, 0);
});
