import { http } from "@/services/api/request";
import type { TimelineProject } from "@/types/timeline";

export type ProjectTimelineView = { revision: number; exists: boolean; timeline: TimelineProject; updatedAt?: string; deliveryBlockers?: string[] };

export function getProjectTimeline(projectId: string, signal?: AbortSignal) {
    return http.get<ProjectTimelineView>(`/projects/${encodeURIComponent(projectId)}/timeline`, { signal });
}
export function saveProjectTimeline(projectId: string, timeline: TimelineProject, expectedRevision: number) {
    return http.put<ProjectTimelineView>(`/projects/${encodeURIComponent(projectId)}/timeline`, { timeline, expectedRevision });
}

export type CutReviewRequest = { requestId: string; expectedRevision: number; discardFields: string[]; previewToken?: string };
export type CutReviewPreview = { cutId: string; backupCutId: string; sourceCutId: string; expectedRevision: number; before: { clips: number; tracks: number; durationMs: number; sha256: string }; discardFields: string[]; previewToken: string };
export type CutReviewResult = { kind: "legacy-settings-review"; plan: CutReviewPreview; appliedRevision: number; replayed: boolean };
export const previewProjectCutReview = (id: string, request: CutReviewRequest) => http.post<CutReviewPreview>(`/projects/${encodeURIComponent(id)}/timeline/legacy-settings/preview`, request);
export const applyProjectCutReview = (id: string, request: CutReviewRequest) => http.post<CutReviewResult>(`/projects/${encodeURIComponent(id)}/timeline/legacy-settings/apply`, request);
export const readProjectCutReview = (id: string, requestId: string) => http.get<CutReviewResult>(`/projects/${encodeURIComponent(id)}/timeline/legacy-settings/results`, { params: { requestId } });
