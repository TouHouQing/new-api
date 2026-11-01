import { http } from "./request";
import type { CutSummary, ProjectCutView } from "./project-cuts";
import type { TimelineClipKind } from "@/types/timeline";

export type CanvasCutClip = {
    id: string;
    nodeId?: string;
    title: string;
    kind: TimelineClipKind;
    startMs: number;
    durationMs: number;
    sourceStartMs: number;
    playbackRate: number;
    pinnedResourceId?: string;
    pinnedAvailable: boolean;
    needsResource: boolean;
    text?: string;
    needsText?: boolean;
    sourceWarning?: string;
};
export type CanvasCutSourcePage = {
    canvasId: string;
    canvasRevision: number;
    title: string;
    sourceSha256: string;
    clipCount: number;
    needsResourceCount: number;
    needsTextCount: number;
    clips: CanvasCutClip[];
    nextCursor?: number;
};
export type CanvasCutConvertRequest = {
    requestId: string;
    expectedProjectRevision: number;
    expectedTimelineRevision: number;
    canvasId: string;
    canvasRevision: number;
    sourceSha256: string;
    title: string;
    mappings: { clipId: string; resourceId: string }[];
    texts: { clipId: string; text: string }[];
    previewToken?: string;
};
export type CanvasCutConvertPreview = {
    cutId: string;
    title: string;
    canvasId: string;
    sourceSha256: string;
    expectedProjectRevision: number;
    expectedTimelineRevision: number;
    summary: CutSummary;
    pinnedMedia: number;
    explicitMedia: number;
    supplementedTexts: number;
    warnings: string[];
    previewToken: string;
};
const route = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/timeline`;
export function readCanvasCutSource(projectId: string, canvasId: string, options: { cursor?: number; limit?: number; sourceSha256?: string } = {}, signal?: AbortSignal) {
    return http.get<CanvasCutSourcePage>(`${route(projectId)}/canvas-cut-source`, { params: { canvasId, ...options }, signal });
}
export function previewCanvasCut(projectId: string, input: CanvasCutConvertRequest, signal?: AbortSignal) {
    return http.post<CanvasCutConvertPreview>(`${route(projectId)}/canvas-cut/preview`, input, { signal, timeout: 120_000 });
}
export function applyCanvasCut(projectId: string, input: CanvasCutConvertRequest, signal?: AbortSignal) {
    return http.post<ProjectCutView>(`${route(projectId)}/canvas-cut/apply`, input, { signal, timeout: 120_000 });
}
