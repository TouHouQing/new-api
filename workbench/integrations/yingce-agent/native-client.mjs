import fs from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import * as z from 'zod/v4';

const identifier = z.string().min(1).max(160).regex(/^[\p{L}\p{N}_:.-]+$/u);
const selection = z.union([
    z.object({ logicalModelId: identifier }).strict(),
    z.object({ channelId: identifier, channelModelKey: z.string().min(1).max(240) }).strict(),
]);
export const profileSchema = z.object({
    version: z.literal(1),
    baseURL: z.string().url(),
    session: z.string().min(20).max(4096).regex(/^[A-Za-z0-9._~-]+$/),
    apiPrefix: z.literal('/api/workbench-agent').optional(),
    caFile: z.string().min(1).optional(),
    workspace: z.literal(true).optional(),
    media: z.object({ root: z.string().min(1), maxBytes: z.number().int().min(1).max(1024 * 1024 * 1024).default(256 * 1024 * 1024) }).strict().optional(),
    agent: z.object({
        selection,
        maxCredits: z.number().positive().max(1000000),
        maxSteps: z.number().int().min(1).max(100).default(8),
        maxGenerationTasks: z.number().int().min(0).max(20).default(0),
        maxVideoSeconds: z.number().int().min(0).max(300).default(0),
    }).strict().optional(),
}).strict();

export function platformURL(value) {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
        !['https:', 'http:'].includes(url.protocol) || (url.protocol === 'http:' && !local)) {
        throw new Error('平台地址必须是 HTTPS 根地址；本机开发允许 HTTP localhost。');
    }
    return url;
}

async function readSmallFile(filename, maxBytes) {
    const file = await fs.open(filename, 'r');
    try {
        if ((await file.stat()).size > maxBytes) throw new Error('配置文件过大。');
        return await file.readFile();
    } finally { await file.close(); }
}

export async function loadProfile(filename) {
    if (!filename) throw new Error('请通过 YINGCE_PROFILE 指定 connect.mjs 保存的连接文件。');
    let profile;
    try { profile = profileSchema.parse(JSON.parse(await readSmallFile(filename, 16 * 1024))); }
    catch { throw new Error('连接文件不可读或格式无效，请重新连接影策。'); }
    platformURL(profile.baseURL);
    if (profile.media) profile.media.root = path.resolve(path.dirname(filename), profile.media.root);
    const ca = profile.caFile ? await readSmallFile(path.resolve(path.dirname(filename), profile.caFile), 256 * 1024) : undefined;
    return new YingceClient(profile, { ca });
}

// This client only carries the platform login session. It does not accept model
// keys, provider URLs, arbitrary remote routes or automatic mutation retries.
export class YingceClient {
    #origin;
    #session;
    #ca;
    #hosted;
    constructor(profile, { ca } = {}) {
        this.#origin = platformURL(profile.baseURL);
        this.#session = profile.session;
        this.#ca = ca;
        this.#hosted = profile.apiPrefix === '/api/workbench-agent';
        this.agent = profile.agent ? structuredClone(profile.agent) : undefined;
        this.media = profile.media ? structuredClone(profile.media) : undefined;
        this.workspace = profile.workspace === true;
    }
    get platformOrigin() { return this.#origin.origin; }
    canvasURL(id, runId) {
        const url = new URL((this.#hosted ? '/workbench/canvas/' : '/canvas/') + encodeURIComponent(id), this.#origin);
        url.searchParams.set('agent', '1');
        if (runId) url.searchParams.set('agentRun', runId);
        return url.href;
    }

    async request(method, route, body, { signal, login = false } = {}) {
        const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
        const largeNativeWrite = method === 'PUT' && (/^\/api\/projects\/[A-Za-z0-9_-]+\/media-analyses\/[A-Za-z0-9_-]+$/.test(route) || /^\/api\/projects\/[A-Za-z0-9_-]+\/units\/[A-Za-z0-9_-]+\/shots$/.test(route));
        const limit = largeNativeWrite ? 2 * 1024 * 1024 : 128 * 1024;
        if (payload?.length > limit) throw new Error('请求内容过大。');
        return this.#perform(method, route, payload, { signal, login, contentType: 'application/json' });
    }

    async uploadChunk(uploadId, index, bytes, { signal } = {}) {
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(uploadId) || !Number.isSafeInteger(index) || index < 0 || !Buffer.isBuffer(bytes) || bytes.length > 8 * 1024 * 1024) throw new Error('上传分片参数无效。');
        return this.#perform('PUT', `/api/resources/uploads/${encodeURIComponent(uploadId)}/chunks/${index}`, bytes, { signal, contentType: 'application/octet-stream' });
    }

    async openResourceFile(resourceId, { signal } = {}) {
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(resourceId)) throw new Error('资源编号无效。');
        return this.#perform('GET', `/api/resources/${encodeURIComponent(resourceId)}/file?download=1`, undefined, { signal, stream: true });
    }

    async #perform(method, route, payload, { signal, login = false, contentType, stream = false }) {
        if (!route.startsWith('/api/') || route.includes('#') || route.includes('\\') || route.startsWith('/api//')) throw new Error('无效的影策业务地址。');
        const url = new URL(route, this.#origin);
        if (url.origin !== this.#origin.origin || !url.pathname.startsWith('/api/')) throw new Error('无效的影策业务地址。');
        if (this.#hosted) url.pathname = '/api/workbench-agent/' + url.pathname.slice('/api/'.length);
        return new Promise((resolve, reject) => {
            const request = (url.protocol === 'https:' ? https : http).request(url, {
                method, ca: this.#ca, rejectUnauthorized: true, signal,
                headers: {
                    Accept: stream ? 'application/octet-stream' : 'application/json', Origin: this.#origin.origin,
                    ...(login ? {} : this.#hosted ? { Authorization: 'Bearer ' + this.#session } : { Cookie: 'open_ai_canvas_session=' + this.#session }),
                    ...(payload ? { 'Content-Type': contentType, 'Content-Length': payload.length } : {}),
                },
            }, response => {
                const status = response.statusCode;
                response.on('error', () => reject(new Error('影策响应中断；提交结果未知，请按原幂等编号查询，勿创建新操作。')));
                if (status < 200 || status >= 300 || (stream && status !== 200)) {
                    response.destroy();
                    const message = status === 401 || status === 403 ? '影策会话已失效或没有权限，请重新登录或检查项目权限。' : `影策请求失败（HTTP ${status}）；未自动重试。`;
                    reject(new YingceAPIError(status, message));
                    return;
                }
                if (stream) { resolve(response); return; }
                const chunks = [];
                let received = 0;
                const nativeTimeline = method === 'GET' && /^\/api\/projects\/[A-Za-z0-9_-]+\/timeline(?:\/|\?|$)/.test(route) || method === 'POST' && /^\/api\/projects\/[A-Za-z0-9_-]+\/timeline\/edits\/preview$/.test(route);
                const nativePlan = method === 'GET' && /^\/api\/projects\/[A-Za-z0-9_-]+\/(?:shot-plans\/[A-Za-z0-9_-]+(?:\?|$)|units\/[A-Za-z0-9_-]+\/shot-plan-source(?:\?|$))/.test(route);
                const responseLimit = nativeTimeline || nativePlan ? 16 * 1024 * 1024 : 4 * 1024 * 1024;
                response.on('data', chunk => {
                    received += chunk.length;
                    if (received > responseLimit) { response.destroy(new Error('影策响应过大，请缩小查询范围。')); return; }
                    chunks.push(chunk);
                });
                response.on('end', () => {
                    let value;
                    try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
                    catch { reject(new Error('影策返回了无效业务响应。')); return; }
                    if (value.code !== 0 || !Object.hasOwn(value, 'data')) { reject(new Error('影策未接受此操作，请检查参数与平台记录。')); return; }
                    resolve(login ? { data: value.data, cookies: response.headers['set-cookie'] ?? [] } : value.data);
                });
            });
            request.setTimeout(/^\/api\/projects\/[A-Za-z0-9_-]+\/delivery-(?:packages|result)(?:\?|$)/.test(route) ? 600000 : 30000, () => request.destroy());
            request.on('error', () => reject(new Error('无法连接影策或请求已中断；未自动重试，请核对原操作编号。')));
            request.end(payload);
        });
    }
}

export class YingceAPIError extends Error {
    constructor(status, message) { super(message); this.name = 'YingceAPIError'; this.status = status; }
}
