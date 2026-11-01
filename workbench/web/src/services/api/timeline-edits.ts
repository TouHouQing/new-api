import { http } from "./request";
import type { CutSummary } from "./project-cuts";
import type { CaptionPresentation, TimelineProject, TimelineOutput, TimelineMotionGraphic } from "@/types/timeline";

export type TimelineEditCommand =
    | { op: "arrangeToBeats"; analysisId: string; analysisRevisionId: string; sourceClipId: string; clipIds: string[] }
    | { op: "applyVideoRepair"; id: string; repairTaskId: string }
    | { op: "removeVideoRepair"; id: string; repairTaskId: string; expectedClipSha256: string }
    | { op: "setOutput"; output: TimelineOutput }
    | { op: "addGraphic"; id: string; startMs: number; durationMs: number; text: string; trackId?: string; graphic: TimelineMotionGraphic }
    | { op: "setGraphic"; id: string; graphic: TimelineMotionGraphic; restart?: boolean }
    | { op: "addResource"; resourceId: string; startMs?: number; durationMs?: number; trackId?: string }
    | { op: "addCanvasNode"; resourceId: string; canvasId: string; nodeId: string; canvasRevision: number; nodeSha256: string; startMs?: number; durationMs?: number; trackId?: string }
    | { op: "moveClip"; id: string; startMs: number; trackId?: string }
    | { op: "trimClip"; id: string; startMs?: number; durationMs?: number; sourceStartMs?: number }
    | { op: "splitClip"; id: string; splitAtMs: number }
    | { op: "setClipPlaybackRate"; id: string; playbackRate: number }
    | { op: "removeClip"; id: string }
    | { op: "setAudioLink"; id: string; sourceClipId?: string; mode?: "source" | "clip" }
    | { op: "setCaptionLink"; id: string; sourceClipId?: string }
    | { op: "setCaptionPresentation"; id: string; captionPresentation: CaptionPresentation }
    | { op: "setCaptionText"; id: string; text: string };
export type TimelineEditRequest = { requestId: string; expectedRevision: number; commands: TimelineEditCommand[]; previewToken?: string };
export type TimelineEditChange = { clipId: string; title: string; kind: string; action: "change" | "add" | "remove"; resultClipIds: string[] };
export type TimelineEditPreview = { cutId: string; backupCutId: string; expectedRevision: number; before: CutSummary; after: CutSummary; changes: TimelineEditChange[]; timeline?: TimelineProject; previewToken: string };
export type TimelineEditResult = { kind: "timeline-edit"; plan: TimelineEditPreview; appliedRevision: number; replayed: boolean };
const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/timeline`;
export type CanvasTimelineSource = { canvasId: string; nodeId: string; canvasRevision: number; nodeSha256: string; resourceId: string; title: string; captionCount: number; previewCues: { index: number; startMs: number; endMs: number; text: string }[] };
export const readCanvasTimelineSource = (projectId: string, source: { canvasId: string; nodeId: string; resourceId: string }, signal?: AbortSignal) => http.get<CanvasTimelineSource>(`${base(projectId)}/canvas-source`, { params: source, signal });
export const previewTimelineEdits = (projectId: string, input: TimelineEditRequest, signal?: AbortSignal) => http.post<TimelineEditPreview>(`${base(projectId)}/edits/preview`, input, { signal });
export const applyTimelineEdits = (projectId: string, input: TimelineEditRequest, signal?: AbortSignal) => http.post<TimelineEditResult>(`${base(projectId)}/edits/apply`, input, { signal });
export const readTimelineEditResult = (projectId: string, requestId: string, signal?: AbortSignal) => http.get<TimelineEditResult>(`${base(projectId)}/edit-results`, { params: { requestId }, signal });
