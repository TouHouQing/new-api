import crypto from 'node:crypto';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');

export class NativeWorkspace {
    #client;
    constructor(client) {
        if (!client.workspace) throw new Error('连接未启用项目及画布创建。');
        this.#client = client;
    }
    async createProject(args, signal) {
        const result = await this.#client.request('POST', '/api/project-creations', args, { signal });
        if (!result.project?.id) throw new Error('项目创建未返回原生项目编号，请保留原请求编号核对。');
        return { ...result, projectURL: new URL('/projects/' + encodeURIComponent(result.project.id), this.#client.platformOrigin).href };
    }
    async placeResource({ canvasId, resourceId, title, x, y, idempotencyKey }, signal) {
        const result = await this.#client.request('POST', '/api/canvas-projects/' + encodeURIComponent(canvasId) + '/resource-adoptions', {
            resourceId, title, x, y, requestId: idempotencyKey,
        }, { signal });
        if (!result.adoption?.assetVersionId || !result.adoption.nodeId) throw new Error('采用素材未返回具体素材版本及节点，请保留原请求编号核对。');
        return { ...result, canvasURL: this.#client.canvasURL(canvasId) };
    }
    async history({ canvasId, snapshotId }, signal) {
        const route = '/api/canvas-projects/' + encodeURIComponent(canvasId) + '/history' + (snapshotId ? '/' + encodeURIComponent(snapshotId) : '');
        const result = await this.#client.request('GET', route, undefined, { signal });
        return { ...result, canvasURL: this.#client.canvasURL(canvasId) };
    }
    async restoreHistory({ canvasId, snapshotId, expectedRevision, confirmRestore }, signal) {
        if (confirmRestore !== true) throw new Error('恢复历史版本需要明确确认。');
        const result = await this.#client.request('POST', '/api/canvas-projects/' + encodeURIComponent(canvasId) + '/history/' + encodeURIComponent(snapshotId) + '/restore', { expectedRevision }, { signal });
        return { ...result, canvasURL: this.#client.canvasURL(canvasId) };
    }
    async createCanvas({ title, projectId, idempotencyKey }, signal) {
        const session = await this.#client.request('GET', '/api/auth/session', undefined, { signal });
        if (!session.user?.id) throw new Error('影策会话已失效，请重新连接。');
        if (projectId) {
            const result = await this.#client.request('GET', '/api/projects/' + encodeURIComponent(projectId) + '/core', undefined, { signal });
            if (result.project?.status !== 'active') throw new Error('项目尚未激活或已归档，不能新建画布。');
        }
        const intentId = hash(session.user.id + '\n' + idempotencyKey), canvasId = 'mcp_' + intentId.slice(0, 40);
        const result = await this.#client.request('PATCH', '/api/canvas-projects/' + canvasId + '/operations', {
            mutationId: 'mcp:create:' + intentId,
            baseRevision: 0,
            operations: [{ type: 'create_canvas', id: canvasId, patch: { title, ...(projectId ? { projectId } : {}) } }],
        }, { signal });
        const current = await this.#client.request('GET', '/api/canvas-projects/' + canvasId, undefined, { signal });
        if (!current.project?.id) throw new Error('原请求的画布已不可用，请保留原编号核对，勿重复创建。');
        return { canvasId, canvasURL: this.#client.canvasURL(canvasId), revision: result.project?.revision, mutationId: result.mutationId };
    }
}
