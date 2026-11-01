import { http } from "./request";
import type { TimelineProject } from "@/types/timeline";
import type { GenerationTask } from "./task-center";

export type ProjectCutKind = "master" | "teaser" | "aspect" | "locale" | "experiment" | "snapshot";
export type ProjectCut = {
    id: string;
    projectId: string;
    title: string;
    kind: ProjectCutKind;
    language?: string;
    region?: string;
    aspectRatio?: string;
    unitId?: string;
    sourceImportId?: string;
    sourceKey?: string;
    timelineRevision: number;
    timelineSha256: string;
    archived: boolean;
    createdAt: string;
};
export type ProjectCutView = { cut: ProjectCut; timeline: TimelineProject; metadata?: Record<string, unknown>; deliveryBlockers?: string[]; replayed: boolean };
export type CutApplyRequest = { requestId: string; expectedRevision: number; timelineSha256: string; previewToken?: string };
export type CutSummary = { clips: number; tracks: number; durationMs: number; sha256: string };
export type CutApplyPreview = { cutId: string; title: string; expectedRevision: number; before: CutSummary; after: CutSummary; backupCutId: string; previewToken: string };
export type CutApplyResult = { plan: CutApplyPreview; appliedRevision: number; replayed: boolean };
const route = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/timeline`;
export function listProjectCuts(projectId: string, options: { cursor?: string; archived?: boolean; includeAutomatic?: boolean; limit?: number } = {}, signal?: AbortSignal) {
    return http.get<{ cuts: ProjectCut[]; nextCursor?: string }>(`${route(projectId)}/cuts`, { params: options, signal });
}
export function getProjectCut(projectId: string, cutId: string, signal?: AbortSignal) {
    return http.get<ProjectCutView>(`${route(projectId)}/cuts/${encodeURIComponent(cutId)}`, { signal });
}
export function readProjectCutRequest(projectId: string, requestId: string) {
    return http.get<ProjectCutView>(`${route(projectId)}/cut-requests`, { params: { requestId } });
}
export function createProjectCut(
    projectId: string,
    input: { requestId: string; expectedRevision: number; title: string; kind: ProjectCutKind; purpose?: "export"; language?: string; region?: string; aspectRatio?: string; unitId?: string; timeline?: TimelineProject },
) {
    return http.post<ProjectCutView>(`${route(projectId)}/cuts`, input);
}
export function setProjectCutArchived(projectId: string, cut: ProjectCut, archived: boolean) {
    return http.patch<ProjectCutView>(`${route(projectId)}/cuts/${encodeURIComponent(cut.id)}`, { expectedArchived: cut.archived, archived });
}
export function previewProjectCutApply(projectId: string, cutId: string, input: CutApplyRequest) {
    return http.post<CutApplyPreview>(`${route(projectId)}/cuts/${encodeURIComponent(cutId)}/preview`, input);
}
export function applyProjectCut(projectId: string, cutId: string, input: CutApplyRequest) {
    return http.post<CutApplyResult>(`${route(projectId)}/cuts/${encodeURIComponent(cutId)}/apply`, input);
}
export function readProjectCutApply(projectId: string, requestId: string) {
    return http.get<CutApplyResult>(`${route(projectId)}/cut-applies`, { params: { requestId } });
}

export function createProjectCutRender(projectId: string, cutId: string, input: { requestId: string; timelineSha256: string }) {
    return http.post<GenerationTask>(`${route(projectId)}/cuts/${encodeURIComponent(cutId)}/renders`, input);
}

export function readProjectCutRender(projectId: string, cutId: string, requestId: string) {
    return http.get<GenerationTask>(`${route(projectId)}/cuts/${encodeURIComponent(cutId)}/render-request`, { params: { requestId } });
}

export function listProjectCutRenders(projectId: string, cutId: string, cursor?: string) {
    return http.get<{ tasks: GenerationTask[]; nextCursor?: string }>(`${route(projectId)}/cuts/${encodeURIComponent(cutId)}/renders`, { params: { limit: 10, ...(cursor ? { cursor } : {}) } });
}
