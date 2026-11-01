import type { TimelineProject } from "@/types/timeline";
import { timelineCaptionPlacements } from "./timeline-caption-layout";
import { timelineCaptionLineUnits } from "./timeline-output";

export function timelineExportPreflight(project: TimelineProject, outputWidth = 1920) {
    const visible = new Set(project.tracks.filter((track) => track.visible !== false).map((track) => track.id));
    const clips = project.clips.filter((clip) => visible.has(clip.trackId));
    const video = clips.filter((clip) => clip.kind === "video" || clip.kind === "image");
    const audio = clips.filter((clip) => clip.kind === "audio");
    const graphics = clips.filter((clip) => clip.graphic);
    const text = clips.filter((clip) => !clip.graphic && (clip.kind === "subtitle" || clip.kind === "text") && clip.text?.trim());
    const missing = project.clips.filter((clip) => ["video", "image", "audio"].includes(clip.kind) && !clip.directMedia?.storageKey?.startsWith("resource:"));
    const blockers: string[] = [];
    try {
        timelineCaptionPlacements(
            clips.filter((clip) => !clip.graphic && !clip.captionPresentation && !clip.subtitleStyle && !clip.captionOrigin?.subtitleStyle),
            timelineCaptionLineUnits(outputWidth),
        );
    } catch (error) {
        blockers.push(error instanceof Error ? error.message : "字幕布局无效");
    }
    if (!video.length && !graphics.length && !text.length) blockers.push("请先添加画面、标题或图形叠层");
    if (missing.length) blockers.push(`${missing.length} 个片段尚未上传或缺少固定素材，请从素材库重新添加`);
    if (clips.length > 128) blockers.push("单次导出最多 128 个片段，请分段导出");
    const ordered = [...video].sort((a, b) => a.startMs - b.startMs);
    let end = 0;
    let overlaps = false;
    for (const clip of ordered) {
        if (clip.startMs < end) overlaps = true;
        end = Math.max(end, clip.startMs + clip.durationMs);
    }
    const complex =
        !video.length ||
        graphics.length > 0 ||
        (project.output?.fit && project.output.fit !== "letterbox") ||
        audio.length > 0 ||
        text.length > 0 ||
        overlaps ||
        project.tracks.some((track) => track.muted || track.visible === false) ||
        clips.some((clip) => (clip.volume !== undefined && clip.volume !== 1) || clip.fadeInMs || clip.fadeOutMs);
    return {
        videoCount: video.length,
        audioCount: audio.length,
        textCount: text.length,
        graphicCount: graphics.length,
        durationMs: clips.reduce((duration, clip) => Math.max(duration, clip.startMs + clip.durationMs), 0),
        blockers,
        offlineReason: complex ? "当前剪辑包含声音、文字、画面适配、叠放或轨道设置，请使用上方的成片导出" : "",
    };
}
