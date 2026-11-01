import { http } from "@/services/api/request";
import type { ProjectCut, ProjectCutView } from "./project-cuts";

export type LegacyProjectInspection = {
    sourceProjectId: string;
    title: string;
    sourceFingerprint: string;
    nodeCount: number;
    takeCount: number;
    resources: { path: string; mimeType: string; size: number; sha256: string }[];
    missingMediaIds: string[];
    readyForMigration: boolean;
    projection?: LegacyProjectImportResult["report"];
};

export type LegacyProjectImportResult = {
    receipt: { id: string; projectId: string; canvasId: string; sourceFingerprint: string };
    report: {
        nodes: number;
        takes: number;
        shots: number;
        assets: number;
        resources: number;
        transcripts?: number;
        transcriptVersions?: number;
        mediaAnalyses?: number;
        analysisVersions?: number;
        timelineClips?: number;
        planningRecordId?: string;
        recoveredUnitId?: string;
        planningShots?: number;
        planningReused?: boolean;
        audioLinks?: number;
        previs?: { canvasId: string; sceneId: string; nodeId: string; objects: number; keyframes: number; reused?: boolean; canvasRevision: number; beforeSha256: string; payloadSha256: string };
        nativeFields?: string[];
        preservedOnly: string[];
        warnings: string[];
    };
    reused: boolean;
};

export function inspectLegacyProject(file: File, signal: AbortSignal) {
    const form = new FormData();
    form.append("file", file);
    return http.post<LegacyProjectInspection>("/projects/legacy/inspect", form, { signal, timeout: 0 });
}

export function importLegacyProject(file: File, fingerprint: string, name: string) {
    const form = new FormData();
    form.append("file", file);
    form.append("fingerprint", fingerprint);
    form.append("name", name);
    return http.post<LegacyProjectImportResult>("/projects/legacy/import", form, { timeout: 0 });
}

export type LegacyNativeStatus = { available: boolean; converterVersion: number; originalContractVersion?: number; cut?: ProjectCut };
export type LegacyNativeRequest = { expectedProjectRevision: number; expectedTimelineRevision: number; previewToken?: string };
export type LegacyNativePreview = { importId: string; converterVersion: number; projectRevision: number; timelineRevision: number; cutId: string; timelineSha256: string; report: LegacyProjectImportResult["report"]; previewToken: string };
export function getLegacyNativeStatus(projectId: string) {
    return http.get<LegacyNativeStatus>(`/projects/${encodeURIComponent(projectId)}/legacy-native`);
}
export function previewLegacyNative(projectId: string, input: LegacyNativeRequest) {
    return http.post<LegacyNativePreview>(`/projects/${encodeURIComponent(projectId)}/legacy-native/preview`, input, { timeout: 0 });
}
export function applyLegacyNative(projectId: string, input: LegacyNativeRequest) {
    return http.post<ProjectCutView>(`/projects/${encodeURIComponent(projectId)}/legacy-native/apply`, input, { timeout: 0 });
}

export type LegacyVersionSource = {
    id: string;
    title: string;
    episodeId: string;
    episode: string;
    language: string;
    region: string;
    occurrences: number;
    width: number;
    height: number;
    fps: number;
    fit: string;
    hasMotionGraphics?: boolean;
    hasReframes?: boolean;
    hasAttachedAudio?: boolean;
};
export type LegacyVersionEntry = LegacyVersionSource & { cut?: ProjectCut; requiresUpgrade?: boolean };
export type LegacyVersionPage = { converterVersion: number; sourceSha256: string; versions: LegacyVersionEntry[]; nextCursor?: number };
export type LegacyVersionRequest = LegacyNativeRequest & { sourceId: string; sourceSha256: string; acceptPreservedFields?: string[] };
export type LegacyVersionPreview = {
    source: LegacyVersionSource;
    cutId: string;
    summary: { clips: number; tracks: number; durationMs: number; sha256: string };
    preservedOnly: string[];
    warnings: string[];
    previewToken: string;
    output: { width: number; height: number; fps: number; fit?: string };
};
export function readLegacyVersions(projectId: string, cursor = 0, sourceSha256?: string) {
    return http.get<LegacyVersionPage>(`/projects/${encodeURIComponent(projectId)}/legacy-versions`, { params: { cursor, limit: 20, ...(sourceSha256 ? { sourceSha256 } : {}) } });
}
export function previewLegacyVersion(projectId: string, input: LegacyVersionRequest) {
    return http.post<LegacyVersionPreview>(`/projects/${encodeURIComponent(projectId)}/legacy-versions/preview`, input);
}
export function applyLegacyVersion(projectId: string, input: LegacyVersionRequest) {
    return http.post<ProjectCutView>(`/projects/${encodeURIComponent(projectId)}/legacy-versions/apply`, input);
}
