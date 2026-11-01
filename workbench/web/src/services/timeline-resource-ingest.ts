import type { StateStorage } from "zustand/middleware";
import { ApiError } from "./api/request";
import { getProjectTimeline } from "./api/project-timeline";
import { getProjectCut } from "./api/project-cuts";
import { applyTimelineEdits, previewTimelineEdits, readTimelineEditResult, readCanvasTimelineSource, type TimelineEditCommand, type TimelineEditPreview, type TimelineEditRequest, type TimelineEditResult } from "./api/timeline-edits";
import type { TimelineProject } from "@/types/timeline";

type IngestAPI = { load: typeof getProjectTimeline; preview: typeof previewTimelineEdits; apply: typeof applyTimelineEdits; receipt: typeof readTimelineEditResult; cut: typeof getProjectCut; source?: typeof readCanvasTimelineSource };
type CaptionSummary = { title: string; captionCount: number; previewCues: string[] };
export type PreparedResourceIngest = ({ state: "ready"; input: TimelineEditRequest; plan: TimelineEditPreview } | { state: "complete"; result: TimelineEditResult; clipId: string }) & { captions?: CaptionSummary };
const opaqueId = /^[\p{L}\p{N}_:.-]{1,128}$/u;

/** A scoped, durable append intent. Reloading a URL recovers its receipt;
 * neither a missing response nor a storage error creates another request ID. */
export function createTimelineResourceIngest(
    projectId: string,
    resourceId: string,
    requestId: string,
    storage: StateStorage,
    api: IngestAPI = { load: getProjectTimeline, preview: previewTimelineEdits, apply: applyTimelineEdits, receipt: readTimelineEditResult, cut: getProjectCut, source: readCanvasTimelineSource },
    source?: { canvasId: string; nodeId: string },
) {
    const key = `timeline-resource-ingest:${projectId}:${requestId}`;
    let preparing: Promise<PreparedResourceIngest> | null = null;
    let applying: Promise<Extract<PreparedResourceIngest, { state: "complete" }>> | null = null;
    const validate = () => {
        if (!opaqueId.test(projectId) || !opaqueId.test(resourceId) || !/^[!-~]{16,128}$/.test(requestId) || (source && (!opaqueId.test(source.canvasId) || !opaqueId.test(source.nodeId)))) throw new Error("素材加入链接无效，请从画布或素材库重新选择");
    };
    const validCommand = (command: TimelineEditCommand) =>
        command &&
        "resourceId" in command &&
        command.resourceId === resourceId &&
        (source
            ? command.op === "addCanvasNode" &&
              command.canvasId === source.canvasId &&
              command.nodeId === source.nodeId &&
              Number.isSafeInteger(command.canvasRevision) &&
              command.canvasRevision >= 1 &&
              /^[a-f0-9]{64}$/.test(command.nodeSha256) &&
              Object.keys(command).every((name) => ["op", "resourceId", "canvasId", "nodeId", "canvasRevision", "nodeSha256"].includes(name))
            : command.op === "addResource" && Object.keys(command).every((name) => ["op", "resourceId"].includes(name)));
    const validInput = (input: TimelineEditRequest) =>
        input &&
        input.requestId === requestId &&
        Number.isSafeInteger(input.expectedRevision) &&
        input.expectedRevision >= 0 &&
        /^[a-f0-9]{64}$/.test(input.previewToken ?? "") &&
        Array.isArray(input.commands) &&
        input.commands.length === 1 &&
        validCommand(input.commands[0]) &&
        Object.keys(input).every((name) => ["requestId", "expectedRevision", "commands", "previewToken"].includes(name));
    const captionSummary = (timeline: TimelineProject | undefined, addedIds: string[]): CaptionSummary | undefined => {
        if (!source || !timeline) return undefined;
        const parent = timeline.clips.find((clip) => addedIds.includes(clip.id) && clip.directMedia?.storageKey === `resource:${resourceId}` && clip.canvasOrigin?.canvasId === source.canvasId && clip.canvasOrigin?.nodeId === source.nodeId);
        if (!parent) throw new Error("字幕来源无法核对，请保留操作编号并检查剪辑版本");
        const cues = timeline.clips.filter((clip) => clip.kind === "subtitle" && clip.captionLink?.sourceClipId === parent?.id);
        return { title: parent?.title ?? "画布素材", captionCount: cues.length, previewCues: cues.slice(0, 3).map((clip) => clip.text ?? "") };
    };
    async function completed(result: TimelineEditResult): Promise<Extract<PreparedResourceIngest, { state: "complete" }>> {
        const view = await api.cut(projectId, result.plan.cutId);
        const metadata = view.metadata as { kind?: string; requestId?: string; commands?: TimelineEditCommand[] } | undefined;
        const command = metadata?.commands?.[0];
        if (result.kind !== "timeline-edit" || view.cut.sourceKey !== "timeline-edit-v1" || metadata?.kind !== "timeline-edit" || metadata.requestId !== requestId || metadata.commands?.length !== 1 || !command || !validCommand(command))
            throw new Error("这个操作编号属于另一项编辑，未重复添加；请检查原操作记录");
        const added = result.plan.changes.filter((change) => change.action === "add").find((change) => view.timeline.clips.some((clip) => clip.id === change.clipId && clip.directMedia?.storageKey === `resource:${resourceId}`));
        if (!added) throw new Error("已保存的加入结果无法核对，请保留操作编号并检查剪辑版本");
        await Promise.resolve(storage.removeItem(key)).catch(() => {});
        return { state: "complete", result, clipId: added.clipId, captions: captionSummary(view.timeline, [added.clipId]) };
    }
    async function receipt() {
        let result: TimelineEditResult;
        try {
            result = await api.receipt(projectId, requestId);
        } catch (error) {
            if (error instanceof ApiError && error.status === 404) return null;
            throw error;
        }
        return completed(result);
    }
    return {
        prepare(refresh = false): Promise<PreparedResourceIngest> {
            if (preparing) return preparing;
            preparing = (async (): Promise<PreparedResourceIngest> => {
                validate();
                const done = await receipt();
                if (done) return done;
                let input: TimelineEditRequest | null = null;
                const raw = await storage.getItem(key);
                if (raw && !refresh) {
                    try {
                        const stored = JSON.parse(raw);
                        if (stored.version !== 1 || stored.projectId !== projectId || stored.resourceId !== resourceId || !validInput(stored.input)) throw new Error();
                        input = stored.input;
                    } catch {
                        throw new Error("加入操作的恢复记录无效，已保留记录；请点击重新检查核对服务端结果");
                    }
                }
                if (!input) {
                    const current = await api.load(projectId);
                    const raced = await receipt();
                    if (raced) return raced;
                    let command: TimelineEditCommand = { op: "addResource", resourceId };
                    if (source) {
                        const snapshot = await (api.source ?? readCanvasTimelineSource)(projectId, { ...source, resourceId });
                        command = { op: "addCanvasNode", resourceId, canvasId: source.canvasId, nodeId: source.nodeId, canvasRevision: snapshot.canvasRevision, nodeSha256: snapshot.nodeSha256 };
                    }
                    input = { requestId, expectedRevision: current.revision, commands: [command] };
                }
                let plan: TimelineEditPreview;
                try {
                    plan = await api.preview(projectId, input);
                } catch (error) {
                    const raced = await receipt();
                    if (raced) return raced;
                    throw error;
                }
                input = { ...input, previewToken: plan.previewToken };
                if (!validInput(input)) throw new Error("加入预览无法核对，请保留当前剪辑并重新检查");
                const encoded = JSON.stringify({ version: 1, projectId, resourceId, input });
                await storage.setItem(key, encoded);
                if ((await storage.getItem(key)) !== encoded) throw new Error("浏览器未能保存操作记录，请检查存储空间后重试");
                return {
                    state: "ready",
                    input,
                    plan,
                    captions: captionSummary(
                        plan.timeline,
                        plan.changes.filter((change) => change.action === "add").map((change) => change.clipId),
                    ),
                };
            })().finally(() => {
                preparing = null;
            });
            return preparing;
        },
        apply(input: TimelineEditRequest) {
            if (applying) return applying;
            applying = (async () => {
                validate();
                if (!validInput(input)) throw new Error("加入操作参数已变化，请重新检查");
                const raw = await storage.getItem(key);
                if (!raw || JSON.stringify(JSON.parse(raw).input) !== JSON.stringify(input)) throw new Error("加入操作尚未可靠保存，请先重新检查");
                let result: TimelineEditResult;
                try {
                    result = await api.apply(projectId, input);
                } catch (error) {
                    const done = await receipt();
                    if (done) return done;
                    throw error;
                }
                return completed(result);
            })().finally(() => {
                applying = null;
            });
            return applying;
        },
    };
}
