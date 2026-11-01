import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { Writable } from 'node:stream';
import { createInterface } from 'node:readline/promises';
import * as z from 'zod/v4';
import { YingceClient, platformURL, profileSchema } from './native-client.mjs';

async function jsonFile(filename) {
    const file = await fs.open(filename, 'r');
    try {
        if ((await file.stat()).size > 16384) throw new Error('配置文件过大。');
        return JSON.parse(await file.readFile('utf8'));
    } catch { throw new Error('本机配置文件不可读或格式无效。'); }
    finally { await file.close(); }
}

async function credentials() {
    if (!process.stdin.isTTY) throw new Error('请在交互终端登录，或使用本机已有的 --credentials-file；勿在命令参数中传密码。');
    let muted = false;
    const output = new Writable({ write(chunk, encoding, callback) { if (!muted) process.stderr.write(chunk); callback(); } });
    const terminal = createInterface({ input: process.stdin, output, terminal: true });
    try {
        const username = await terminal.question('THQ Video账号：');
        process.stderr.write('密码（输入隐藏）：');
        muted = true;
        const password = await terminal.question('');
        process.stderr.write('\n');
        return { username, password };
    } finally { muted = false; terminal.close(); }
}

export async function connect(options) {
    if (options['max-file-mb'] && !options['media-root']) throw new Error('--max-file-mb 需要同时指定 --media-root。');
    const filename = path.resolve(options.profile);
    try { await fs.lstat(filename); throw new Error('连接文件已存在，请先用 disconnect.mjs 注销，或指定新的文件名。'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const baseURL = platformURL(options['base-url']).origin;
    const caFile = options['ca-file'] ? path.resolve(options['ca-file']) : undefined;
    const ca = caFile ? await fs.readFile(caFile) : undefined;
    const agent = options['agent-config'] ? await jsonFile(options['agent-config']) : undefined;
    const media = options['media-root'] ? { root: await fs.realpath(path.resolve(options['media-root'])), maxBytes: Number(options['max-file-mb'] ?? 256) * 1024 * 1024 } : undefined;
    const workspace = options.workspace === true ? { workspace: true } : {};
    if (media && !(await fs.stat(media.root)).isDirectory()) throw new Error('素材路径必须是已存在的目录。');
    // Validate policy before creating a session. No configured policy means
    // reads only; caller-supplied tool arguments cannot enable write tools.
    profileSchema.parse({ version: 1, baseURL, session: 'validation-placeholder-session', ...workspace, ...(agent ? { agent } : {}), ...(media ? { media } : {}) });
    const account = z.object({ username: z.string().trim().min(1).max(256), password: z.string().min(1).max(1024) }).parse(
        options['credentials-file'] ? await jsonFile(options['credentials-file']) : await credentials());
    const client = new YingceClient({ baseURL }, { ca });
    const result = await client.request('POST', '/api/auth/login', account, { login: true });
    const header = result.cookies.find(cookie => cookie.startsWith('open_ai_canvas_session='));
    if (!header || !result.data.user?.id) throw new Error('登录未返回有效会话。');
    const session = header.split(';', 1)[0].slice('open_ai_canvas_session='.length);
    const profile = profileSchema.parse({ version: 1, baseURL, session, ...workspace, ...(caFile ? { caFile } : {}), ...(agent ? { agent } : {}), ...(media ? { media } : {}) });
    try {
        await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
        const file = await fs.open(filename, 'wx', 0o600);
        try { await file.writeFile(JSON.stringify(profile, null, 2) + '\n'); await file.sync(); }
        finally { await file.close(); }
    } catch {
        // Failure to retain the session is not a reason to leave it active.
        await new YingceClient(profile, { ca }).request('POST', '/api/auth/logout', {}).catch(() => {});
        throw new Error('连接文件未保存；本次会话已尝试注销，请检查目标路径。');
    }
    return { connected: true, baseURL, agentRunsEnabled: Boolean(agent), mediaEnabled: Boolean(media), workspaceEnabled: Boolean(workspace.workspace), profile: filename };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
    try {
        const { values } = parseArgs({ options: {
            profile: { type: 'string' }, 'base-url': { type: 'string' }, 'ca-file': { type: 'string' },
            'credentials-file': { type: 'string' }, 'agent-config': { type: 'string' },
            'media-root': { type: 'string' }, 'max-file-mb': { type: 'string' },
            workspace: { type: 'boolean' },
        } });
        if (!values.profile || !values['base-url']) throw new Error('需要 --profile 和 --base-url。');
        process.stdout.write(JSON.stringify(await connect(values)) + '\n');
    } catch (error) {
        // Zod errors may contain input values; never print credential parsing.
        process.stderr.write(error instanceof z.ZodError ? '账号或连接配置格式无效。\n' : error.message + '\n');
        process.exitCode = 1;
    }
}
