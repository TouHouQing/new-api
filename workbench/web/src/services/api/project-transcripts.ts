import { http } from "@/services/api/request";
import type { TimelineProject } from "@/types/timeline";

export type TranscriptSpan = {
    id: string;
    startMs: number;
    endMs: number;
    text: string;
    speaker?: string;
    confidence?: number;
    corrected?: boolean;
};
export type TranscriptDocument = {
    version: 1 | 2;
    language?: string;
    precision: "segment" | "word";
    segments: TranscriptSpan[];
    words?: TranscriptSpan[];
    wordTextNeedsReview?: boolean;
    wordTimingIncomplete?: boolean;
    lyrics?: {
        version: 1;
        text: string;
        sourceRevisionId: string;
        sourceDocumentSha256: string;
        lyricsSha256: string;
        requestId: string;
        requestSha256: string;
        lines: { line: number; segmentId: string; method: "source_words" | "source_segment" | "manual"; sourceSpanIds?: string[] }[];
    };
};
export type ProjectTranscript = {
    id: string;
    projectId: string;
    resourceId: string;
    title: string;
    sourceKind: string;
    sourceKey: string;
    sourceTaskId?: string;
    sourceETag?: string;
    sourceBytes: number;
    sourceDurationMs: number;
    currentRevisionId: string;
    revision: number;
    archived: boolean;
    createdAt: string;
    updatedAt: string;
};
export type TranscriptVersion = { id: string; transcriptId: string; version: number; note: string; createdAt: string };
export type TranscriptView = { transcript: ProjectTranscript; currentVersion: TranscriptVersion; document: TranscriptDocument };
export type TranscriptChange = { id: string; text?: string; speaker?: string };
export type TranscriptWrite = {
    expectedRevision: number;
    title?: string;
    changes?: TranscriptChange[];
    action?: "archive" | "restore" | "restore_version";
    restoreRevisionId?: string;
    note?: string;
};
const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/transcripts`;
export const createProjectTranscript = (projectId: string, taskId: string, title?: string) => http.post<TranscriptView>(base(projectId), { taskId, ...(title ? { title } : {}) });
export const getProjectTranscript = (projectId: string, id: string, signal?: AbortSignal) => http.get<TranscriptView>(`${base(projectId)}/${encodeURIComponent(id)}`, { signal });
export const getProjectTranscriptForTask = (projectId: string, taskId: string, signal?: AbortSignal) => http.get<TranscriptView>(`${base(projectId)}/by-task/${encodeURIComponent(taskId)}`, { signal });
export const listProjectTranscripts = (projectId: string, options: { resourceId?: string; archived?: boolean; cursor?: string } = {}, signal?: AbortSignal) =>
    http.get<{ transcripts: ProjectTranscript[]; nextCursor?: string }>(base(projectId), { params: { ...options, pageSize: 30 }, signal });
export const updateProjectTranscript = (projectId: string, id: string, input: TranscriptWrite) => http.patch<TranscriptView>(`${base(projectId)}/${encodeURIComponent(id)}`, input);
export const listTranscriptVersions = (projectId: string, id: string, beforeVersion?: number, signal?: AbortSignal) =>
    http.get<{ versions: TranscriptVersion[]; nextBeforeVersion?: number }>(`${base(projectId)}/${encodeURIComponent(id)}/versions`, { params: { pageSize: 30, ...(beforeVersion ? { beforeVersion } : {}) }, signal });
export const getTranscriptVersion = (projectId: string, id: string, revisionId: string, signal?: AbortSignal) => http.get<TranscriptView>(`${base(projectId)}/${encodeURIComponent(id)}/versions/${encodeURIComponent(revisionId)}`, { signal });

export type LyricsAnchor = { line: number; startSpanId?: string; endSpanId?: string; startMs?: number; endMs?: number; reviewed: boolean };
export type LyricsCandidate = { startMs: number; endMs: number; method: "source_words" | "source_segment" | "manual"; sourceSpanIds?: string[]; sourceText?: string };
export type LyricsRequest = { requestId: string; expectedRevision: number; sourceRevisionId: string; lyrics: string; anchors: LyricsAnchor[]; previewToken?: string };
export type LyricsPreview = {
    transcriptId: string;
    sourceRevisionId: string;
    expectedRevision: number;
    previewToken: string;
    canApply: boolean;
    precision: "segment" | "word";
    warnings: string[];
    document?: TranscriptDocument;
    lines: { index: number; text: string; kind: "lyric" | "section"; candidates: LyricsCandidate[]; selected?: LyricsCandidate; reviewed: boolean; issue?: string }[];
};
export type LyricsResult = { view: TranscriptView; requestId: string; current: boolean; replayed: boolean };
export const previewProjectLyrics = (projectId: string, id: string, input: LyricsRequest, signal?: AbortSignal) => http.post<LyricsPreview>(`${base(projectId)}/${encodeURIComponent(id)}/lyrics-preview`, input, { signal });
export const applyProjectLyrics = (projectId: string, id: string, input: LyricsRequest) => http.post<LyricsResult>(`${base(projectId)}/${encodeURIComponent(id)}/lyrics-apply`, input);
export const getProjectLyricsResult = (projectId: string, id: string, requestId: string) => http.get<LyricsResult>(`${base(projectId)}/${encodeURIComponent(id)}/lyrics-results/${encodeURIComponent(requestId)}`);

export type TranscriptCutRequest = {
    expectedTimelineRevision: number;
    transcriptRevisionId: string;
    sourceClipId: string;
    mode: "ripple" | "clip_only";
    keepSegmentIds?: string[];
    keepWordIds?: string[];
    unit?: "segment" | "word";
    preservePauses?: boolean;
};
export type TranscriptCutPreview = {
    mode: "ripple" | "clip_only";
    sourceClipId: string;
    removedMs: number;
    beforeDurationMs: number;
    afterDurationMs: number;
    timelineRevision: number;
    transcriptId: string;
    transcriptRevisionId: string;
    previewToken: string;
    beforeTimeline: TimelineProject;
    timeline: TimelineProject;
    warnings: string[];
    keptRanges: { sourceStartMs: number; sourceEndMs: number; programStartMs: number; programEndMs: number; clipId: string }[];
    changes: { clipId: string; title: string; kind: string; action: "trim" | "remove" | "split" | "move"; resultClipIds: string[] }[];
};
export const previewTranscriptCut = (projectId: string, id: string, input: TranscriptCutRequest, signal?: AbortSignal) => http.post<TranscriptCutPreview>(`${base(projectId)}/${encodeURIComponent(id)}/cut-preview`, input, { signal });
export const applyTranscriptCut = (projectId: string, id: string, input: TranscriptCutRequest & { previewToken: string }) =>
    http.post<{ revision: number; timeline: TimelineProject; exists: boolean }>(`${base(projectId)}/${encodeURIComponent(id)}/cut-apply`, input);

export type TranscriptSuggestion = { id: string; kind: "pause" | "repeat"; segmentId: string; previousSegmentId: string; startMs: number; endMs: number };
export const getTranscriptSuggestions = (projectId: string, id: string, revisionId: string, signal?: AbortSignal) =>
    http.get<{ transcriptId: string; revisionId: string; method: "review_rules"; suggestions: TranscriptSuggestion[] }>(`${base(projectId)}/${encodeURIComponent(id)}/suggestions`, { params: { revisionId }, signal });
