import type { ScopedStateStorage } from "@/lib/localforage-storage";
import { generationRequestClone as clone, generationRequestSHA256 as sha, withGenerationRequestLock as locked } from "./generation-request-snapshot";
import type { CanvasTaskDraft, CreateTaskInput, GenerationTask } from "./api/task-center";

export type CanvasAdmissionBatch = { tasks: CreateTaskInput[]; root?: CanvasTaskDraft; retiredNodeIds?: string[] };
export type CanvasAdmissionBody = CreateTaskInput | CanvasAdmissionBatch;
type CredentialBinding = { index: number; field: string; sha256: string };
export type CanvasAdmissionRecord = {
    version: 1;
    key: string;
    scope: string;
    kind: "single" | "batch";
    canvasId: string;
    createdAt: string;
    request: CanvasAdmissionBody;
    requestSHA256: string;
    publicSHA256: string;
    credentials: CredentialBinding[];
    operationIds: string[];
};
const prefix = "canvas-admission-v1:";
const credentialFields = ["apiKey", "secretKey", "headers", "runningHubUploadApiKey", "runningHubWalletApiKey"];
export const canvasAdmissionChanged = "yingce:canvas-admission-changed";
export const admissionTasks = (kind: CanvasAdmissionRecord["kind"], request: CanvasAdmissionBody) => (kind === "batch" ? (request as CanvasAdmissionBatch).tasks : [request as CreateTaskInput]);
function configOf(task: CreateTaskInput) {
    return task.input?.config as Record<string, unknown> | undefined;
}
function operationId(task: CreateTaskInput) {
    return (task.input?.metadata as Record<string, unknown> | undefined)?.clientOperationId;
}
function changed() {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(canvasAdmissionChanged));
}

export function createCanvasAdmissionJournal(storage: ScopedStateStorage, scope: string, currentScope: () => string) {
    const requireOwner = () => {
        if (!scope || scope === "guest" || currentScope() !== scope) throw new Error("账号已切换，请回到原账号核对这次提交");
    };
    async function read(key: string): Promise<CanvasAdmissionRecord | null> {
        requireOwner();
        const raw = await storage.getItem(key);
        requireOwner();
        if (!raw) return null;
        let record: CanvasAdmissionRecord;
        try {
            record = JSON.parse(raw);
        } catch {
            throw new Error("生成提交记录无法读取，请保留浏览器数据后检查");
        }
        if (
            raw.length > 4 * 1024 * 1024 ||
            record?.version !== 1 ||
            record.key !== key ||
            !key.startsWith(prefix) ||
            record.scope !== scope ||
            !["single", "batch"].includes(record.kind) ||
            !Array.isArray(record.operationIds) ||
            !Array.isArray(record.credentials) ||
            record.credentials.some((binding) => !Number.isSafeInteger(binding.index) || binding.index < 0 || ![...credentialFields, "baseUrl"].includes(binding.field) || !/^[a-f0-9]{64}$/.test(binding.sha256))
        )
            throw new Error("生成提交记录无效，请保留原记录后检查");
        const tasks = admissionTasks(record.kind, record.request);
        if (
            !Array.isArray(tasks) ||
            !tasks.length ||
            tasks.length > 15 ||
            tasks.some((task, index) => task.projectId !== record.canvasId || operationId(task) !== record.operationIds[index]) ||
            (await sha({ request: record.request, credentials: record.credentials })) !== record.publicSHA256
        )
            throw new Error("原生成参数已变化，请保留记录，勿重复生成");
        return record;
    }
    async function list() {
        requireOwner();
        const keys = await storage.keys();
        requireOwner();
        const records = await Promise.all(keys.filter((key) => key.startsWith(prefix)).map(read));
        return records.filter((record): record is CanvasAdmissionRecord => Boolean(record)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    async function prepare(kind: CanvasAdmissionRecord["kind"], original: CanvasAdmissionBody) {
        requireOwner();
        const source = clone(original),
            tasks = admissionTasks(kind, source),
            ids = tasks.map(operationId),
            canvasId = tasks[0]?.projectId;
        if (
            !canvasId ||
            tasks.length < 1 ||
            tasks.length > 15 ||
            ids.some((id) => typeof id !== "string" || !id || id.length > 240) ||
            new Set(ids).size !== ids.length ||
            tasks.some((task) => task.projectId !== canvasId || !(task.input?.metadata as Record<string, unknown> | undefined)?.canvasTaskDraft)
        )
            throw new Error("生成提交缺少可恢复的原编号或目标，尚未调用模型");
        const key = prefix + (await sha({ kind, canvasId, operationIds: ids }));
        return locked(scope + ":" + key, async () => {
            const requestSHA256 = await sha(source),
                existing = await read(key);
            if (existing) {
                if (existing.requestSHA256 !== requestSHA256) throw new Error("同一操作编号的参数已变化，请先核对原提交");
                return existing;
            }
            const request = clone(source),
                credentials: CredentialBinding[] = [];
            for (const [index, task] of admissionTasks(kind, request).entries()) {
                const config = configOf(task);
                if (!config) continue;
                const fields = [...credentialFields];
                if (typeof config.baseUrl === "string" && /[?@]/.test(config.baseUrl)) fields.push("baseUrl");
                for (const field of fields)
                    if (config[field] && (!Array.isArray(config[field]) || (config[field] as unknown[]).length)) {
                        credentials.push({ index, field, sha256: await sha(config[field]) });
                        delete config[field];
                    }
            }
            const record: CanvasAdmissionRecord = { version: 1, key, scope, kind, canvasId, operationIds: ids as string[], createdAt: new Date().toISOString(), request, requestSHA256, publicSHA256: await sha({ request, credentials }), credentials };
            const serialized = JSON.stringify(record);
            if (serialized.length > 4 * 1024 * 1024) throw new Error("生成提交信息过大，请减少参考内容或拆分批次");
            requireOwner();
            await storage.setItem(key, serialized);
            requireOwner();
            if ((await read(key))?.requestSHA256 !== requestSHA256) throw new Error("浏览器未能保存生成提交，尚未调用模型；请检查可用存储空间");
            changed();
            return record;
        });
    }
    async function clear(record: CanvasAdmissionRecord) {
        requireOwner();
        const current = await read(record.key);
        if (!current) return;
        if (current.requestSHA256 !== record.requestSHA256) throw new Error("生成提交记录已变化，请重新读取");
        await storage.removeItem(record.key);
        requireOwner();
        changed();
    }
    function verifyAccepted(record: CanvasAdmissionRecord, tasks: GenerationTask[]) {
        requireOwner();
        if (tasks.length !== record.operationIds.length || record.operationIds.some((id) => !tasks.some((task) => task.clientOperationId === id && task.projectId === record.canvasId)))
            throw new Error("任务回执与原生成提交不一致，请核对原任务，勿重新生成");
    }
    async function replay(record: CanvasAdmissionRecord, credentialsFor: (task: CreateTaskInput, index: number) => Record<string, unknown> | undefined) {
        const current = await read(record.key);
        if (!current || current.requestSHA256 !== record.requestSHA256) throw new Error("原提交记录已变化，请重新读取");
        const request = clone(current.request),
            tasks = admissionTasks(current.kind, request);
        for (const binding of current.credentials) {
            const live = credentialsFor(tasks[binding.index], binding.index)?.[binding.field];
            if ((await sha(live)) !== binding.sha256) throw new Error("原渠道凭据已变化，请恢复原配置后继续；仍可查询原任务");
            const config = configOf(tasks[binding.index]);
            if (!config) throw new Error("原模型配置无法恢复");
            config[binding.field] = clone(live);
        }
        if ((await sha(request)) !== current.requestSHA256) throw new Error("原提交参数无法完整恢复，尚未重新提交");
        requireOwner();
        return request;
    }
    return { prepare, read, list, clear, verifyAccepted, replay, requireOwner };
}
