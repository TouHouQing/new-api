import { http } from "./request";
import type { GenerationTask } from "./task-center";
import type { TimelineProject, TimelineProductionMarker, TimelineReframe } from "@/types/timeline";

export type AnalysisKind = "reference_video" | "audio_structure" | "subject_track";
export type AnalysisRectangle = { x: number; y: number; width: number; height: number };
export type MediaAnalysisDocument = {
    version: 1;
    sections: { id: string; startMs: number; endMs: number; title: string; approved: boolean }[];
    beats: { id: string; timeMs: number; approved: boolean }[];
    tracking: { id: string; timeMs: number; roi: AnalysisRectangle; crop: AnalysisRectangle; reviewed: boolean; manual: boolean }[];
};
export type ProjectMediaAnalysis = {
    id: string;
    projectId: string;
    kind: AnalysisKind;
    sourceKind?: string;
    resourceId: string;
    sourceTaskId?: string;
    title: string;
    currentRevisionId: string;
    revision: number;
    archived: boolean;
    createdAt: string;
    updatedAt: string;
};
export type MediaAnalysisRevision = { id: string; analysisId: string; version: number; note: string; createdAt: string };
export type MediaAnalysisView = {
    analysis: ProjectMediaAnalysis;
    currentVersion: MediaAnalysisRevision;
    isCurrent: boolean;
    source: {
        resourceId: string;
        sha256: string;
        etag: string;
        bytes: number;
        durationMs: number;
        startMs: number;
        endMs: number;
        width?: number;
        height?: number;
        sourceClipId?: string;
        clipBindingSha256?: string;
        displayGeometryVersion?: number;
        windowed?: boolean;
    };
    evidence: { method: string; tempo_bpm?: number | null; points?: { time: number; confidence: number; review_required: boolean; reason?: string }[]; [key: string]: unknown };
    document: MediaAnalysisDocument;
};
export type MediaAnalysisWrite = { requestId: string; expectedRevision: number; title?: string; archived?: boolean; document?: MediaAnalysisDocument; restoreRevisionId?: string; note?: string };
export type MediaAnalysisMarkerRequest = { expectedTimelineRevision: number; analysisRevisionId: string; sourceClipId: string };
export type MediaAnalysisMarkerPreview = {
    timeline: TimelineProject;
    beforeTimeline: TimelineProject;
    added: TimelineProductionMarker[];
    removedIds: string[];
    sourceClipId: string;
    warnings: string[];
    analysisId: string;
    analysisRevisionId: string;
    timelineRevision: number;
    previewToken: string;
};
export type MediaAnalysisReframePreview = Omit<MediaAnalysisMarkerPreview, "added" | "removedIds"> & { reframe: TimelineReframe; replaced: boolean };
export type ManualFramingRequest = { requestId: string; resourceId: string; sourceClipId: string; expectedTimelineRevision: number; startMs?: number; endMs?: number; targetAspect?: number; title?: string };
export type ReferenceShotRequest = { requestId: string; analysisRevisionId: string; expectedProjectRevision: number; title?: string; sectionIds?: string[] };
export type ReferenceShotPreview = {
    adoptionId: string;
    projectRevision: number;
    analysisId: string;
    analysisRevisionId: string;
    resourceId: string;
    sourceSha256: string;
    unitId: string;
    title: string;
    position: number;
    shots: { sectionId: string; shotId: string; revisionId: string; title: string; startMs: number; endMs: number }[];
    warnings: string[];
    previewToken: string;
};
export type ReferenceShotResult = { plan: ReferenceShotPreview; replayed: boolean; missingShotIds: string[]; unitDeleted: boolean };
const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/media-analyses`;
const item = (projectId: string, id: string) => `${base(projectId)}/${encodeURIComponent(id)}`;
export const getMediaAnalysisCapabilities = (signal?: AbortSignal) =>
    http.get<{ available: boolean; actions: AnalysisKind[]; reason?: string; engineVersion: number; maxSourceBytes: number; maxIntervalMs: number; maxTrackingIntervalMs: number; maxReferenceIntervalMs?: number }>("/media-analyses/capabilities", {
        signal,
    });
export const createMediaAnalysisTask = (
    projectId: string,
    input: {
        requestId: string;
        resourceId: string;
        kind: AnalysisKind;
        sourceClipId?: string;
        title?: string;
        startMs?: number;
        endMs?: number;
        longReference?: boolean;
        options: { threshold?: number; roi?: AnalysisRectangle; anchorTimeMs?: number; targetAspect?: number };
    },
) => http.post<GenerationTask>(`${base(projectId)}/tasks`, input);
export const createManualFraming = (projectId: string, input: ManualFramingRequest) => http.post<{ view: MediaAnalysisView; replayed: boolean }>(`${base(projectId)}/manual-framing`, input);
export const listMediaAnalyses = (projectId: string, options: { resourceId?: string; kind?: AnalysisKind; archived?: boolean; cursor?: string } = {}, signal?: AbortSignal) =>
    http.get<{ analyses: ProjectMediaAnalysis[]; nextCursor?: string }>(base(projectId), { params: { ...options, limit: 20 }, signal });
export const getMediaAnalysis = (projectId: string, id: string, revisionId?: string, signal?: AbortSignal) => http.get<MediaAnalysisView>(item(projectId, id), { params: revisionId ? { revisionId } : {}, signal });
export const saveMediaAnalysis = (projectId: string, id: string, input: MediaAnalysisWrite) => http.put<{ view: MediaAnalysisView; appliedVersion: MediaAnalysisRevision; replayed: boolean }>(item(projectId, id), input);
export const listMediaAnalysisHistory = (projectId: string, id: string, beforeVersion?: number, signal?: AbortSignal) =>
    http.get<{ versions: MediaAnalysisRevision[]; nextBeforeVersion?: number }>(`${item(projectId, id)}/history`, { params: { limit: 20, ...(beforeVersion ? { beforeVersion } : {}) }, signal });
export const previewMediaAnalysisMarkers = (projectId: string, id: string, input: MediaAnalysisMarkerRequest, signal?: AbortSignal) => http.post<MediaAnalysisMarkerPreview>(`${item(projectId, id)}/markers/preview`, input, { signal });
export const previewMediaAnalysisReframe = (projectId: string, id: string, input: MediaAnalysisMarkerRequest, signal?: AbortSignal) => http.post<MediaAnalysisReframePreview>(`${item(projectId, id)}/reframe/preview`, input, { signal });
export const previewReferenceShots = (projectId: string, id: string, input: ReferenceShotRequest) => http.post<ReferenceShotPreview>(`${item(projectId, id)}/shots/preview`, input);
export const applyReferenceShots = (projectId: string, id: string, input: ReferenceShotRequest & { previewToken: string }) => http.post<ReferenceShotResult>(`${item(projectId, id)}/shots/apply`, input);
export const readReferenceAdoption = (projectId: string, requestId: string, signal?: AbortSignal) => http.get<ReferenceShotResult>(`/projects/${encodeURIComponent(projectId)}/reference-adoptions`, { params: { requestId }, signal });
