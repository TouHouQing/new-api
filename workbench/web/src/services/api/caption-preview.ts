import type { TimelineClip, TimelineOutput } from "@/types/timeline";
import { http } from "./request";

export type CaptionPreviewLayer = { clipId: string; image: string; x: number; y: number; width: number; height: number; startMs: number; endMs: number; animation: "" | "none" | "pop" | "wipe" };
export type CaptionPreview = { width: number; height: number; layers: CaptionPreviewLayer[] };
export type CaptionPreviewClip = Pick<TimelineClip, "id" | "kind" | "text" | "startMs" | "durationMs" | "captionPresentation" | "subtitleEntryIndex" | "subtitleStyle" | "subtitleHighlights"> & {
    captionOrigin?: Pick<NonNullable<TimelineClip["captionOrigin"]>, "entryIndex" | "subtitleStyle" | "subtitleHighlights">;
};
export function previewProjectCaptions(projectId: string, clips: CaptionPreviewClip[], aspectRatio = "16:9", signal?: AbortSignal, output?: TimelineOutput) {
    return http.post<CaptionPreview>(`/projects/${encodeURIComponent(projectId)}/timeline/caption-preview`, { aspectRatio, clips, output }, { signal, timeout: 20_000 });
}
