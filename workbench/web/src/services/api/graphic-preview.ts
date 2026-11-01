import { http } from "./request";
import type { TimelineClip, TimelineOutput, TimelineMotionGraphic } from "@/types/timeline";

export type GraphicPreviewClip = Pick<TimelineClip, "id" | "kind" | "text" | "startMs" | "durationMs" | "sourceStartMs" | "graphic">;
export type GraphicPreviewLayer = { clipId: string; image: string; width: number; height: number; startMs: number; durationMs: number; sourceStartMs: number; graphic: TimelineMotionGraphic };
export type GraphicPreview = { width: number; height: number; layers: GraphicPreviewLayer[] };
export function previewProjectGraphics(projectId: string, clips: GraphicPreviewClip[], output: TimelineOutput, signal?: AbortSignal) {
    return http.post<GraphicPreview>(`/projects/${encodeURIComponent(projectId)}/timeline/graphic-preview`, { clips, output }, { signal, timeout: 30_000 });
}
