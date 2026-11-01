import type { StateStorage } from "zustand/middleware";
import { createVideoRework, readVideoRework } from "./api/video-reworks";
import type { VideoReworkCreateRequest, VideoReworkEdit } from "@/types/video-rework";
import { canonicalGenerationRequest, withGenerationRequestLock } from "./generation-request-snapshot";
import { ApiError } from "./api/request";
import type { GenerationTask } from "./api/task-center";

type Intent = { version: 1; projectId: string; clipId: string; phase: "prepared" | "submitted" | "rejected"; request: VideoReworkCreateRequest };
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const identity = (value: unknown, maximum = 128): value is string => typeof value === "string" && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);

export function validVideoReworkEdit(value: unknown): value is VideoReworkEdit {
    if (!value || typeof value !== "object") return false;
    const r = value as VideoReworkEdit;
    if (
        !identity(r.clipId) ||
        !identity(r.sourceResourceId, 80) ||
        !identity(r.candidateResourceId, 80) ||
        r.sourceResourceId === r.candidateResourceId ||
        !hash(r.clipSha256) ||
        !hash(r.sourceSha256) ||
        !hash(r.candidateSha256) ||
        !["original", "candidate", "mute"].includes(r.audio)
    )
        return false;
    if (![r.sourceStartMs, r.sourceEndMs, r.candidateStartMs].every((v) => Number.isSafeInteger(v) && v >= 0 && v <= 86_400_000) || r.sourceEndMs - r.sourceStartMs < 100 || r.sourceEndMs - r.sourceStartMs > 30_000) return false;
    if (r.region && (!Object.values(r.region).every(Number.isSafeInteger) || r.region.x < 0 || r.region.y < 0 || r.region.width < 2 || r.region.height < 2 || r.region.x + r.region.width > 4096 || r.region.y + r.region.height > 4096)) return false;
    const keys = new Set(["clipId", "clipSha256", "sourceResourceId", "sourceSha256", "sourceStartMs", "sourceEndMs", "candidateResourceId", "candidateSha256", "candidateStartMs", "audio", "region"]);
    return Object.keys(r).every((k) => keys.has(k)) && (!r.region || Object.keys(r.region).sort().join(",") === "height,width,x,y");
}

/** The original native body is recorded before any request. An unknown reply
 * keeps the same intent across pages, and cannot be replaced by changed UI inputs. */
export function createVideoReworkSession(projectId: string, clipId: string, storage: StateStorage, api = { create: createVideoRework, read: readVideoRework }) {
    const key = `video-rework-v1:${projectId}:${clipId}`;
    async function read(): Promise<Intent | null> {
        const raw = await storage.getItem(key);
        if (!raw) return null;
        let value: Intent;
        try {
            value = JSON.parse(raw);
        } catch {
            throw new Error("修复记录无法读取，请保留本地数据后检查");
        }
        const r = value?.request;
        if (
            value?.version !== 1 ||
            value.projectId !== projectId ||
            value.clipId !== clipId ||
            !["prepared", "submitted", "rejected"].includes(value.phase) ||
            !r ||
            !identity(r.requestId) ||
            r.requestId.length < 16 ||
            !Number.isSafeInteger(r.expectedRevision) ||
            r.expectedRevision < 0 ||
            !validVideoReworkEdit(r.edit) ||
            r.edit.clipId !== clipId ||
            Object.keys(r).sort().join(",") !== "edit,expectedRevision,requestId"
        )
            throw new Error("保存的修复意图与当前片段不匹配，请核对原记录");
        return value;
    }
    async function prepare(edit: VideoReworkEdit, expectedRevision: number) {
        if (!validVideoReworkEdit(edit) || edit.clipId !== clipId || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("修复范围或素材无效，请重新核对");
        return withGenerationRequestLock(`yingce-${key}`, async () => {
            const old = await read();
            if (old) {
                if (canonicalGenerationRequest(old.request.edit) !== canonicalGenerationRequest(edit) || old.request.expectedRevision !== expectedRevision) throw new Error("请先核对上一份修复；确认完成或取消后，再开始另一份");
                return old;
            }
            const intent: Intent = { version: 1, projectId, clipId, phase: "prepared", request: { requestId: crypto.randomUUID(), expectedRevision, edit: structuredClone(edit) } };
            await storage.setItem(key, JSON.stringify(intent));
            return intent;
        });
    }
    async function submit(expectedRequestId: string, signal?: AbortSignal) {
        return withGenerationRequestLock(`yingce-${key}`, async () => {
            const intent = await read();
            if (!intent) throw new Error("请先保存本次修复选择，再提交处理");
            if (intent.request.requestId !== expectedRequestId) throw new Error("另一个窗口更新了修复记录，请重新核对原编号");
            await storage.setItem(key, JSON.stringify({ ...intent, phase: "submitted" }));
            try {
                return await api.create(projectId, intent.request, signal);
            } catch (cause) {
                if (cause instanceof ApiError && [400, 403, 404, 409, 422].includes(cause.code ?? 0)) await storage.setItem(key, JSON.stringify({ ...intent, phase: "rejected" }));
                throw cause;
            }
        });
    }
    async function verify(signal?: AbortSignal) {
        const intent = await read();
        if (!intent) return null;
        return api.read(projectId, intent.request.requestId, signal);
    }
    async function prepareAnother(expectedRequestId: string) {
        return withGenerationRequestLock(`yingce-${key}`, async () => {
            const intent = await read();
            if (!intent) return;
            if (intent.request.requestId !== expectedRequestId) throw new Error("另一个窗口更新了修复记录，请重新核对原编号");
            if (intent.phase === "submitted") {
                const task = await api.read(projectId, intent.request.requestId);
                if (!["succeeded", "failed", "cancelled"].includes(task.status)) throw new Error("上一份修复仍在处理，请等待完成或先停止原任务");
            }
            if ((await read())?.request.requestId !== intent.request.requestId) throw new Error("另一个窗口更新了修复记录，请重新核对");
            await storage.removeItem(key);
        });
    }
    async function recover(task: GenerationTask) {
        let input: { version: number; projectId: string; request: VideoReworkCreateRequest; plan: { request: VideoReworkEdit } };
        try {
            input = JSON.parse(task.inputJson || "");
        } catch {
            throw new Error("原任务缺少可恢复的固定输入，请保留任务和素材后核对");
        }
        const request = input?.request;
        if (
            !input ||
            task.type !== "video_rework" ||
            task.projectId !== projectId ||
            input.projectId !== projectId ||
            ![1, 2].includes(input.version) ||
            !request ||
            !identity(task.id) ||
            !identity(request.requestId) ||
            request.requestId.length < 16 ||
            !Number.isSafeInteger(request.expectedRevision) ||
            request.expectedRevision < 0 ||
            !validVideoReworkEdit(request.edit) ||
            request.edit.clipId !== clipId ||
            canonicalGenerationRequest(input.plan?.request) !== canonicalGenerationRequest(request.edit) ||
            Object.keys(request).sort().join(",") !== "edit,expectedRevision,requestId"
        )
            throw new Error("原修复任务不属于当前项目或片段，未导入其他记录");
        return withGenerationRequestLock(`yingce-${key}`, async () => {
            const old = await read();
            if (old && canonicalGenerationRequest(old.request) !== canonicalGenerationRequest(request)) throw new Error("请先核对当前修复，再打开另一份历史候选");
            const intent: Intent = { version: 1, projectId, clipId, phase: "submitted", request: structuredClone(request) };
            await storage.setItem(key, JSON.stringify(intent));
            return intent;
        });
    }
    return { read, prepare, submit, verify, prepareAnother, recover };
}
