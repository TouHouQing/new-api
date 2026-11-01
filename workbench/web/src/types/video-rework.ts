import type { TimelineClip } from "./timeline";

export type VideoReworkRegion = { x: number; y: number; width: number; height: number };
export type VideoReworkMedia = { resourceId: string; sha256: string; width: number; height: number; durationMs: number };
export type VideoReworkEdit = {
    clipId: string;
    clipSha256: string;
    sourceResourceId: string;
    sourceSha256: string;
    sourceStartMs: number;
    sourceEndMs: number;
    candidateResourceId: string;
    candidateSha256: string;
    candidateStartMs: number;
    audio: "original" | "candidate" | "mute";
    region?: VideoReworkRegion;
};
export type VideoReworkPlan = {
    version: 1 | 2;
    request: VideoReworkEdit;
    source: VideoReworkMedia;
    candidate: VideoReworkMedia;
    programStartMs: number;
    programEndMs: number;
    playbackRate: number;
    originalFade?: { offsetMs: number; durationMs: number; fadeInMs: number; fadeOutMs: number };
};
export type VideoReworkCreateRequest = { requestId: string; expectedRevision: number; edit: VideoReworkEdit };
export type VideoReworkSource = { revision: number; clip: TimelineClip; clipSha256: string; media: VideoReworkMedia; hasAudio: boolean };
export type VideoReworkMediaView = { media: VideoReworkMedia; hasAudio: boolean };
export type VideoReworkResult = {
    mode: "video";
    video: { resourceId: string; storageKey: string; assetId: string; assetVersionId: string; mimeType: string; width: number; height: number; durationMs: number };
    videoRework: { version: 1 | 2; taskId: string; plan: VideoReworkPlan; planSha256: string; outputSha256: string };
};
