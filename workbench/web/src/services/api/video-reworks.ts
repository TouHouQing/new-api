import { http } from "./request";
import type { GenerationTask } from "./task-center";
import type { VideoReworkCreateRequest, VideoReworkSource, VideoReworkMediaView } from "@/types/video-rework";

const base = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/video-reworks`;
export const readVideoReworkSource = (projectId: string, clipId: string, signal?: AbortSignal) => http.get<VideoReworkSource>(`${base(projectId)}/source`, { params: { clipId }, signal });
export const readVideoReworkMedia = (projectId: string, resourceId: string, signal?: AbortSignal) => http.get<VideoReworkMediaView>(`${base(projectId)}/media`, { params: { resourceId }, signal });
export const createVideoRework = (projectId: string, request: VideoReworkCreateRequest, signal?: AbortSignal) => http.post<GenerationTask>(base(projectId), request, { signal });
export const readVideoRework = (projectId: string, requestId: string, signal?: AbortSignal) => http.get<GenerationTask>(`${base(projectId)}/by-request`, { params: { requestId }, signal });
export type VideoReworkHistory = {
    entries: { taskId: string; status: string; createdAt: string; sourceStartMs: number; sourceEndMs: number; audio: "original" | "candidate" | "mute"; region?: import("@/types/video-rework").VideoReworkRegion }[];
    nextCursor?: string;
};
export const readVideoReworkHistory = (projectId: string, clipId: string, cursor?: string, signal?: AbortSignal) => http.get<VideoReworkHistory>(`${base(projectId)}/history`, { params: { clipId, cursor, limit: 10 }, signal });
