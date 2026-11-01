import type { TimelineClip, TimelineProject } from "@/types/timeline";
import { clipPlaybackRate, clipSourceOffset } from "./timeline-speed";

export const captionSourceId = (clip?: TimelineClip) => clip?.captionLink?.sourceClipId ?? clip?.productionBinding?.sourceClipId;
const end = (clip: TimelineClip) => clip.startMs + clip.durationMs;
export function validateTimelineCaptionLinks(project: TimelineProject): TimelineProject {
    const byId = new Map(project.clips.map((clip) => [clip.id, clip]));
    for (const clip of project.clips) {
        const link = clip.captionLink;
        if (link === undefined) continue;
        if (!link || Object.keys(link).length !== 3 || !Object.keys(link).every((key) => ["sourceClipId", "sourceStartMs", "sourceEndMs"].includes(key)) || clip.kind !== "subtitle" || clip.productionBinding?.sourceClipId)
            throw new Error("字幕跟随来源无效，请保留文字稿来源并重新选择");
        const parent = byId.get(link.sourceClipId);
        if (!parent || !["video", "audio"].includes(parent.kind) || !Number.isFinite(link.sourceStartMs) || !Number.isFinite(link.sourceEndMs) || link.sourceStartMs < 0 || link.sourceEndMs <= link.sourceStartMs || link.sourceEndMs > 86400000)
            throw new Error("请选择具体视频或声音片段，并保留有效字幕范围");
        const rate = clipPlaybackRate(parent),
            source = parent.sourceStartMs ?? 0;
        const from = parent.startMs + (link.sourceStartMs - source) / rate,
            to = parent.startMs + (link.sourceEndMs - source) / rate;
        if (link.sourceStartMs < source || link.sourceEndMs > source + clipSourceOffset(parent, parent.durationMs) || clip.startMs < parent.startMs || end(clip) > end(parent) || Math.abs(clip.startMs - from) > 1 || Math.abs(end(clip) - to) > 1)
            throw new Error("字幕跟随超出片段范围，请先调整字幕或解除跟随");
    }
    return project;
}

export function setTimelineCaptionLink(project: TimelineProject, payload: unknown): TimelineProject {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("请选择字幕片段");
    const input = payload as { id?: string; sourceClipId?: string };
    if (Object.keys(input).some((key) => !["id", "sourceClipId"].includes(key))) throw new Error("字幕跟随包含不支持的参数");
    const clip = project.clips.find((item) => item.id === input.id);
    if (!clip || clip.kind !== "subtitle" || clip.productionBinding?.sourceClipId) throw new Error("文字稿字幕保留其具体版本来源；请选择普通字幕设置跟随");
    if (project.tracks.find((track) => track.id === clip.trackId)?.locked) throw new Error("字幕轨已锁定，请先解锁");
    const changed = { ...clip };
    if (input.sourceClipId === undefined) delete changed.captionLink;
    else {
        const parent = project.clips.find((item) => item.id === input.sourceClipId);
        if (!parent || !["video", "audio"].includes(parent.kind) || clip.startMs < parent.startMs || end(clip) > end(parent)) throw new Error("字幕必须位于选中的视频或声音片段内");
        if (clip.captionLink?.sourceClipId !== parent.id) {
            const sourceStartMs = (parent.sourceStartMs ?? 0) + (clip.startMs - parent.startMs) * clipPlaybackRate(parent);
            changed.captionLink = { sourceClipId: parent.id, sourceStartMs, sourceEndMs: sourceStartMs + clip.durationMs * clipPlaybackRate(parent) };
        }
    }
    return validateTimelineCaptionLinks({ ...project, clips: project.clips.map((item) => (item.id === clip.id ? changed : item)) });
}
