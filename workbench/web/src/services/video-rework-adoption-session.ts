import type { StateStorage } from "zustand/middleware";
import { ApiError } from "./api/request";
import { applyTimelineEdits, previewTimelineEdits, readTimelineEditResult, type TimelineEditCommand, type TimelineEditPreview, type TimelineEditRequest } from "./api/timeline-edits";
import { canonicalGenerationRequest, withGenerationRequestLock } from "./generation-request-snapshot";

type RepairCommand = Extract<TimelineEditCommand, { op: "applyVideoRepair" | "removeVideoRepair" }>;
type BeatCommand = Extract<TimelineEditCommand, { op: "arrangeToBeats" }>;
type AdoptionCommand = RepairCommand | BeatCommand;
type AdoptionAPI = { preview: typeof previewTimelineEdits; apply: typeof applyTimelineEdits; read: typeof readTimelineEditResult };
type Intent = { version: 1; projectId: string; clipId: string; phase: "previewed" | "submitted" | "rejected"; request: TimelineEditRequest; preview: TimelineEditPreview };
function createNativeEditAdoptionSession(projectId: string, clipId: string, storage: StateStorage, kind: "video-rework" | "beat-arrangement", validCommand: (command: TimelineEditCommand) => boolean, api: AdoptionAPI) {
    const key = `${kind}-adoption-v1:${projectId}:${clipId}`;
    const locked = <T>(run: () => Promise<T>) => withGenerationRequestLock(`yingce-${key}`, run);
    async function read(): Promise<Intent | null> {
        const raw = await storage.getItem(key);
        if (!raw) return null;
        let value: Intent;
        try {
            value = JSON.parse(raw);
        } catch {
            throw new Error("采用记录无法读取，请保留本地数据后检查");
        }
        const r = value?.request,
            c = r?.commands?.[0];
        if (
            value?.version !== 1 ||
            value.projectId !== projectId ||
            value.clipId !== clipId ||
            !["previewed", "submitted", "rejected"].includes(value.phase) ||
            !r ||
            typeof r.requestId !== "string" ||
            r.requestId.length < 16 ||
            r.requestId.length > 128 ||
            !Number.isSafeInteger(r.expectedRevision) ||
            r.expectedRevision < 0 ||
            typeof r.previewToken !== "string" ||
            r.previewToken.length !== 64 ||
            !Array.isArray(r.commands) ||
            r.commands.length !== 1 ||
            !c ||
            !validCommand(c) ||
            !value.preview ||
            value.preview.previewToken !== r.previewToken ||
            value.preview.expectedRevision !== r.expectedRevision
        )
            throw new Error("保存的采用记录与当前片段不匹配，请核对原记录");
        return value;
    }
    async function prepare(command: AdoptionCommand, expectedRevision: number) {
        if (!validCommand(command) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("请选择当前片段和已保存的剪辑版本");
        return locked(async () => {
            const old = await read();
            if (old) {
                if (canonicalGenerationRequest(old.request.commands) !== canonicalGenerationRequest([command]) || old.request.expectedRevision !== expectedRevision) throw new Error("请先核对上一份采用或撤销记录");
                return old;
            }
            const request: TimelineEditRequest = { requestId: crypto.randomUUID(), expectedRevision, commands: [structuredClone(command)] };
            const preview = await api.preview(projectId, request);
            const intent: Intent = { version: 1, projectId, clipId, phase: "previewed", request: { ...request, previewToken: preview.previewToken }, preview };
            await storage.setItem(key, JSON.stringify(intent));
            return intent;
        });
    }
    async function apply(expectedRequestId: string) {
        return locked(async () => {
            const intent = await read();
            if (!intent || intent.request.requestId !== expectedRequestId) throw new Error("采用记录已变化，请重新核对原编号");
            // Persist uncertainty before the write, including after a page is closed.
            await storage.setItem(key, JSON.stringify({ ...intent, phase: "submitted" }));
            try {
                return await api.apply(projectId, intent.request);
            } catch (cause) {
                try {
                    return await api.read(projectId, intent.request.requestId);
                } catch {
                    /* retain the original write for an unknown reply */
                }
                // Only an explicit native business rejection is known not to commit.
                if (cause instanceof ApiError && [400, 403, 404, 409, 422].includes(cause.code ?? 0)) await storage.setItem(key, JSON.stringify({ ...intent, phase: "rejected" }));
                throw cause;
            }
        });
    }
    async function verify() {
        const intent = await read();
        return intent ? api.read(projectId, intent.request.requestId) : null;
    }
    async function clear(expectedRequestId: string) {
        return locked(async () => {
            const intent = await read();
            if (!intent) return;
            if (intent.request.requestId !== expectedRequestId) throw new Error("采用记录已变化，请重新核对");
            if (intent.phase === "submitted") await api.read(projectId, intent.request.requestId);
            await storage.removeItem(key);
        });
    }
    return { read, prepare, apply, verify, clear };
}

export function createVideoReworkAdoptionSession(projectId: string, clipId: string, storage: StateStorage, api: AdoptionAPI = { preview: previewTimelineEdits, apply: applyTimelineEdits, read: readTimelineEditResult }) {
    return createNativeEditAdoptionSession(
        projectId,
        clipId,
        storage,
        "video-rework",
        (command) => ["applyVideoRepair", "removeVideoRepair"].includes(command.op) && "id" in command && command.id === clipId && "repairTaskId" in command && typeof command.repairTaskId === "string" && !!command.repairTaskId,
        api,
    );
}
export function createBeatArrangementSession(projectId: string, musicClipId: string, storage: StateStorage, api: AdoptionAPI = { preview: previewTimelineEdits, apply: applyTimelineEdits, read: readTimelineEditResult }) {
    return createNativeEditAdoptionSession(
        projectId,
        musicClipId,
        storage,
        "beat-arrangement",
        (command) =>
            command.op === "arrangeToBeats" &&
            command.sourceClipId === musicClipId &&
            typeof command.analysisId === "string" &&
            !!command.analysisId &&
            typeof command.analysisRevisionId === "string" &&
            !!command.analysisRevisionId &&
            Array.isArray(command.clipIds) &&
            command.clipIds.length >= 2 &&
            command.clipIds.length <= 128 &&
            new Set(command.clipIds).size === command.clipIds.length &&
            command.clipIds.every((id) => typeof id === "string" && !!id),
        api,
    );
}
