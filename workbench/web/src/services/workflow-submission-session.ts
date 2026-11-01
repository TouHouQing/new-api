import type { StateStorage } from "zustand/middleware";
import { getActiveUserScope } from "@/lib/user-scope";
import { ApiError } from "./api/request";
import { createGenerationTask, taskByClientOperation, type CreateTaskInput, type GenerationTask } from "./api/task-center";
import { generationRequestClone as clone, canonicalGenerationRequest as canonical, generationRequestSHA256 as sha, withGenerationRequestLock as locked } from "./generation-request-snapshot";

export type WorkflowSubmissionIdentity = { scope: string; projectId: string; unitId: string; shotId: string; stage: string };
type CredentialBinding = { field: string; sha256: string };
export type PendingWorkflowSubmission = { version: 1; identity: WorkflowSubmissionIdentity; operationId: string; createdAt: string; request: CreateTaskInput; requestSHA256: string; publicSHA256: string; credentials: CredentialBinding[] };
type Dependencies = { createTask: typeof createGenerationTask; findTask: typeof taskByClientOperation; createId: () => string; scope: () => string };
const defaults: Dependencies = { createTask: createGenerationTask, findTask: taskByClientOperation, createId: () => crypto.randomUUID(), scope: getActiveUserScope };
const credentialFields = ["apiKey", "secretKey", "runningHubUploadApiKey", "runningHubWalletApiKey", "headers"];
export const workflowSubmissionChanged = "yingce:workflow-submission-changed";
function configOf(request: CreateTaskInput): Record<string, unknown> {
    const config = request.input?.config;
    if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("原模型参数无法读取，请保留提交记录后检查");
    return config as Record<string, unknown>;
}
function changed() {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(workflowSubmissionChanged));
}

// The request and operation ID are frozen before the first POST. Provider
// secrets stay in the user's configured channel; only their digests are saved.
export function createWorkflowSubmissionSession(identity: WorkflowSubmissionIdentity, storage: StateStorage, api: Dependencies = defaults) {
    const key = `workflow-submission-v1:${identity.projectId}:${identity.unitId}:${identity.shotId}:${identity.stage}`,
        lock = `${identity.scope}:${key}`;
    const requireOwner = () => {
        if (!identity.scope || identity.scope === "guest" || api.scope() !== identity.scope) throw new Error("账号已切换，请回到原账号核对这次提交");
    };
    async function read(): Promise<PendingWorkflowSubmission | null> {
        requireOwner();
        const raw = await storage.getItem(key);
        requireOwner();
        if (!raw) return null;
        let record: PendingWorkflowSubmission;
        try {
            record = JSON.parse(raw);
        } catch {
            throw new Error("上次提交记录无法读取，请保留浏览器数据后检查");
        }
        if (
            raw.length > 2 * 1024 * 1024 ||
            record?.version !== 1 ||
            canonical(record.identity) !== canonical(identity) ||
            !/^workflow:[A-Za-z0-9-]{16,100}$/.test(record.operationId) ||
            !/^[a-f0-9]{64}$/.test(record.requestSHA256) ||
            !/^[a-f0-9]{64}$/.test(record.publicSHA256) ||
            !Array.isArray(record.credentials) ||
            record.credentials.some((item) => !credentialFields.includes(item.field) || !/^[a-f0-9]{64}$/.test(item.sha256)) ||
            new Set(record.credentials.map((item) => item.field)).size !== record.credentials.length ||
            record.request?.projectId !== identity.projectId ||
            (record.request.input?.metadata as Record<string, unknown> | undefined)?.clientOperationId !== record.operationId
        )
            throw new Error("上次提交记录与当前镜头不匹配，请保留原记录后检查");
        if ((await sha({ request: record.request, credentials: record.credentials })) !== record.publicSHA256) throw new Error("原提交参数已变化，请保留原记录，勿重复生成");
        requireOwner();
        return record;
    }
    async function clear(record: PendingWorkflowSubmission) {
        requireOwner();
        if ((await read())?.operationId === record.operationId) {
            await storage.removeItem(key);
            requireOwner();
            changed();
        }
    }
    async function accepted(record: PendingWorkflowSubmission, task: GenerationTask) {
        requireOwner();
        if (task.clientOperationId !== record.operationId || task.projectId !== identity.projectId) throw new Error("返回的任务与原提交不一致，请保留原编号后检查");
        await clear(record);
        return task;
    }
    async function find(record: PendingWorkflowSubmission) {
        requireOwner();
        try {
            return await accepted(record, await api.findTask(record.operationId));
        } catch (error) {
            if (error instanceof ApiError && error.status === 404) return null;
            throw error;
        }
    }
    async function send(record: PendingWorkflowSubmission, request: CreateTaskInput) {
        requireOwner();
        if ((await sha(request)) !== record.requestSHA256) throw new Error("重试参数与原提交不同，请恢复原模型配置后核对");
        requireOwner();
        try {
            return await accepted(record, await api.createTask(request));
        } catch (error) {
            const found = await find(record).catch(() => null);
            if (found) return found;
            if (error instanceof ApiError && error.status && error.status >= 400 && error.status < 500 && ![408, 409, 425, 429].includes(error.status)) {
                await clear(record);
                throw error;
            }
            throw new Error("这次提交结果尚未确认，原参数已保留。请查询原任务，或按原编号重试；不要重复创建新生成。");
        }
    }
    async function submit(input: CreateTaskInput) {
        return locked(lock, async () => {
            requireOwner();
            if (await read()) throw new Error("这个镜头还有待核对的提交，请先查询原任务或按原参数重试");
            const original = clone(input),
                metadata = original.input?.metadata as Record<string, unknown> | undefined;
            if (
                original.projectId !== identity.projectId ||
                !metadata ||
                metadata.shotId !== identity.shotId ||
                metadata.unitId !== identity.unitId ||
                metadata.domainProjectId !== identity.projectId ||
                typeof metadata.shotRevisionId !== "string" ||
                !metadata.shotRevisionId
            )
                throw new Error("生成请求与当前镜头版本不一致，尚未提交");
            const operationId = `workflow:${api.createId()}`;
            metadata.clientOperationId = operationId;
            const request = clone(original),
                config = configOf(request),
                credentials: CredentialBinding[] = [];
            for (const field of credentialFields)
                if (config[field] && (!Array.isArray(config[field]) || (config[field] as unknown[]).length)) {
                    credentials.push({ field, sha256: await sha(config[field]) });
                    delete config[field];
                }
            const record: PendingWorkflowSubmission = { version: 1, identity: clone(identity), operationId, createdAt: new Date().toISOString(), request, requestSHA256: await sha(original), publicSHA256: await sha({ request, credentials }), credentials };
            const serialized = JSON.stringify(record);
            if (serialized.length > 2 * 1024 * 1024) throw new Error("生成参数过大，尚未提交；请减少参考内容");
            requireOwner();
            await storage.setItem(key, serialized);
            requireOwner();
            if ((await read())?.operationId !== operationId) throw new Error("提交记录未能保存，请检查浏览器存储；尚未调用模型");
            changed();
            return send(record, original);
        });
    }
    async function recover(retry = false, currentConfig?: Record<string, unknown>) {
        return locked(lock, async () => {
            const record = await read();
            if (!record) return null;
            const found = await find(record);
            if (found || !retry) return found;
            const request = clone(record.request),
                config = configOf(request);
            for (const binding of record.credentials) {
                const value = currentConfig?.[binding.field];
                if ((await sha(value)) !== binding.sha256) throw new Error("原渠道凭据已变化，请恢复原配置后重试。仍可查询已提交的原任务");
                config[binding.field] = clone(value);
            }
            return send(record, request);
        });
    }
    return { read, submit, recover };
}
