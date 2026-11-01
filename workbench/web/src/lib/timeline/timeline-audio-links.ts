// SPDX-License-Identifier: AGPL-3.0-or-later
// Audio clock contracts: Copyright (C) 2023-2026 QuantumNous.
import type { TimelineClip, TimelineProject } from "@/types/timeline";
import { clipPlaybackRate, clipSourceOffset } from "./timeline-speed";

type Link = NonNullable<TimelineClip["audioLink"]>;
const fail = (message: string): never => {
    throw new Error(message);
};
const end = (clip: TimelineClip) => clip.startMs + clip.durationMs;
const sourceEnd = (clip: TimelineClip) => (clip.sourceStartMs ?? 0) + clipSourceOffset(clip, clip.durationMs);
const timing = (clip: TimelineClip) => JSON.stringify([clip.startMs, clip.durationMs, clip.sourceStartMs ?? 0, clipPlaybackRate(clip)]);

// A bounded, deterministic fragment identity. Collisions are checked against
// the complete timeline; this hash is never used for authorization or receipts.
export function linkedAudioFragmentId(audioId: string, videoId: string): string {
    const encoder = new TextEncoder();
    const input = `${encoder.encode(audioId).length}:${audioId}${encoder.encode(videoId).length}:${videoId}`;
    let first = 0x811c9dc5,
        second = 0x9e3779b9;
    for (const value of encoder.encode(input)) {
        first = Math.imul(first ^ value, 0x01000193) >>> 0;
        second = Math.imul(second ^ value, 0x01000193) >>> 0;
    }
    return `linked-${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}

export function validateTimelineAudioLinks(project: TimelineProject): TimelineProject {
    if (!project.clips.some((clip) => clip.audioLink)) return project;
    const clips = new Map(project.clips.map((clip) => [clip.id, clip]));
    for (const audio of project.clips) {
        const link = audio.audioLink;
        if (!link) continue;
        const video = clips.get(link.sourceClipId);
        if (audio.kind !== "audio" || !video || video.kind !== "video" || !["source", "clip"].includes(link.mode) || !Number.isFinite(link.anchorMs) || link.anchorMs < 0 || link.anchorMs > 86400000) fail("声音跟随关系无效，请保留剪辑并重新选择镜头");
        const anchor = link.mode === "source" ? video!.startMs + (link.anchorMs - (video!.sourceStartMs ?? 0)) / clipPlaybackRate(video!) : video!.startMs + link.anchorMs;
        if (Math.abs(audio.startMs - anchor) > 1 || audio.startMs < video!.startMs || end(audio) > end(video!) || (link.mode === "source" && (link.anchorMs < (video!.sourceStartMs ?? 0) || link.anchorMs >= sourceEnd(video!))))
            fail("跟随声音超出镜头范围，请先裁剪声音或解除跟随");
    }
    return project;
}

export function setTimelineAudioLink(project: TimelineProject, payload: unknown): TimelineProject {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) fail("请选择声音片段与跟随镜头");
    const request = payload as { id?: string; sourceClipId?: string; mode?: Link["mode"] };
    const audio = project.clips.find((clip) => clip.id === request.id);
    if (!audio || audio.kind !== "audio") fail("请选择声音片段");
    if (project.tracks.find((track) => track.id === audio!.trackId)?.locked) fail("声音轨已锁定，请先解锁");
    const changed = { ...audio! };
    if (!request.sourceClipId) delete changed.audioLink;
    else {
        const video = project.clips.find((clip) => clip.id === request.sourceClipId && clip.kind === "video");
        if (!video || !["source", "clip"].includes(request.mode ?? "")) fail("请选择具体镜头与跟随方式");
        if (audio!.startMs < video!.startMs || end(audio!) > end(video!)) fail("跟随声音超出镜头范围，请先裁剪声音或解除跟随");
        changed.audioLink = { sourceClipId: video!.id, mode: request.mode!, anchorMs: request.mode === "source" ? (video!.sourceStartMs ?? 0) + (audio!.startMs - video!.startMs) * clipPlaybackRate(video!) : audio!.startMs - video!.startMs };
    }
    return validateTimelineAudioLinks({ ...project, clips: project.clips.map((clip) => (clip.id === changed.id ? changed : clip)) });
}

function linkedFragment(audio: TimelineClip, oldVideo: TimelineClip, video: TimelineClip): TimelineClip | null {
    const link = audio.audioLink!;
    const oldVideoRate = clipPlaybackRate(oldVideo),
        newVideoRate = clipPlaybackRate(video),
        oldRate = clipPlaybackRate(audio);
    let start: number, length: number, sourceDelta: number, anchor: number, rate: number;
    if (link.mode === "source") {
        const a = Math.max(link.anchorMs, video.sourceStartMs ?? 0);
        const b = Math.min(link.anchorMs + audio.durationMs * oldVideoRate, sourceEnd(video));
        if (b <= a) return null;
        sourceDelta = ((a - link.anchorMs) / oldVideoRate) * oldRate;
        start = video.startMs + (a - (video.sourceStartMs ?? 0)) / newVideoRate;
        length = (b - a) / newVideoRate;
        rate = (oldRate * newVideoRate) / oldVideoRate;
        anchor = a;
    } else {
        const local = link.anchorMs - ((video.sourceStartMs ?? 0) - (oldVideo.sourceStartMs ?? 0)) / oldVideoRate;
        const from = Math.max(0, local),
            to = Math.min(video.durationMs, local + audio.durationMs);
        if (to <= from) return null;
        sourceDelta = Math.max(0, -local) * oldRate;
        start = video.startMs + from;
        length = to - from;
        anchor = from;
        rate = oldRate;
    }
    if (rate < 0.25 || rate > 4 || Math.round(length) < 1) fail("此编辑需要超出支持范围的声音速度或过短片段，请调整剪切或先解除声音跟随");
    const startMs = Math.round(start),
        durationMs = Math.min(Math.round(length), end(video) - startMs),
        sourceStartMs = Math.round((audio.sourceStartMs ?? 0) + sourceDelta);
    if (durationMs < 1) fail("跟随声音过短，请调整剪切或先解除声音跟随");
    const oldCropStart = sourceDelta / oldRate,
        oldCropEnd = oldCropStart + (durationMs * rate) / oldRate;
    const result: TimelineClip = {
        ...audio,
        startMs,
        durationMs,
        sourceStartMs,
        playbackRate: rate,
        audioLink: { sourceClipId: video.id, mode: link.mode, anchorMs: anchor },
        ...(audio.fadeInMs !== undefined ? { fadeInMs: Math.min(durationMs, Math.max(0, Math.round(((audio.fadeInMs - oldCropStart) * oldRate) / rate))) } : {}),
        ...(audio.fadeOutMs !== undefined ? { fadeOutMs: Math.min(durationMs, Math.max(0, Math.round(((audio.fadeOutMs - (audio.durationMs - oldCropEnd)) * oldRate) / rate))) } : {}),
    };
    if (
        timing(audio) === timing(result) &&
        audio.audioLink!.sourceClipId === result.audioLink!.sourceClipId &&
        audio.audioLink!.mode === result.audioLink!.mode &&
        audio.audioLink!.anchorMs === result.audioLink!.anchorMs &&
        (audio.fadeInMs ?? 0) === (result.fadeInMs ?? 0) &&
        (audio.fadeOutMs ?? 0) === (result.fadeOutMs ?? 0)
    )
        return audio;
    return result;
}

/** Replacement IDs must come from the edit itself, never resource equality. */
export function reconcileTimelineAudioLinks(before: TimelineProject, after: TimelineProject, replacements: Record<string, string[]> = {}): TimelineProject {
    if (!before.clips.some((clip) => clip.audioLink)) return validateTimelineAudioLinks(after);
    validateTimelineAudioLinks(before);
    const oldClips = new Map(before.clips.map((clip) => [clip.id, clip]));
    const currentClips = new Map(after.clips.map((clip) => [clip.id, clip]));
    const result: TimelineClip[] = [];
    const ids = new Set<string>();
    const add = (clip: TimelineClip) => {
        if (ids.has(clip.id)) fail("声音片段编号冲突，请保留原剪辑并调整拆分位置");
        ids.add(clip.id);
        result.push(clip);
    };
    for (const current of after.clips) {
        const old = oldClips.get(current.id),
            link = old?.audioLink;
        if (!old || !link) {
            if (!old && current.audioLink) {
                const audioLink = current.audioLink;
                const changed = { ...current };
                const video = currentClips.get(audioLink.sourceClipId);
                if (!video || video.kind !== "video") fail("声音跟随的具体镜头不存在");
                changed.audioLink = { ...audioLink, anchorMs: audioLink.mode === "source" ? (video!.sourceStartMs ?? 0) + (changed.startMs - video!.startMs) * clipPlaybackRate(video!) : changed.startMs - video!.startMs };
                add(changed);
            } else add(current);
            continue;
        }
        const oldVideo = oldClips.get(link.sourceClipId)!;
        const targets = (replacements[oldVideo.id] ?? [oldVideo.id]).map((id) => currentClips.get(id)).filter((clip): clip is TimelineClip => !!clip && clip.kind === "video");
        if (targets.length === 1 && targets[0].id === oldVideo.id && timing(targets[0]) === timing(oldVideo)) {
            // A direct audio trim/move changes its anchor within the same
            // occurrence. Removing a link is an explicit editor command.
            const changed = { ...current };
            if (changed.audioLink && timing(changed) !== timing(old))
                changed.audioLink = { ...changed.audioLink, anchorMs: link.mode === "source" ? (oldVideo.sourceStartMs ?? 0) + (changed.startMs - oldVideo.startMs) * clipPlaybackRate(oldVideo) : changed.startMs - oldVideo.startMs };
            add(changed);
            continue;
        }
        const pieces = targets.map((video) => linkedFragment(old, oldVideo, video)).filter((clip): clip is TimelineClip => clip !== null);
        if (before.tracks.find((track) => track.id === old.trackId)?.locked && (pieces.length !== 1 || JSON.stringify(pieces[0]) !== JSON.stringify(old))) fail("关联声音轨已锁定，请先解锁或解除跟随后再编辑镜头");
        pieces.forEach((clip, index) => {
            const next = { ...clip, id: index === 0 ? old.id : linkedAudioFragmentId(old.id, clip.audioLink!.sourceClipId) };
            if (pieces.length > 1 && !next.analysisOccurrenceId && before.productionMarkers?.some((marker) => marker.source?.clipId === old.id)) next.analysisOccurrenceId = old.id;
            if (index > 0 && currentClips.has(next.id)) fail("声音片段编号冲突，请保留原剪辑并调整拆分位置");
            add(next);
        });
    }
    return validateTimelineAudioLinks({ ...after, clips: result, durationMs: result.reduce((value, clip) => Math.max(value, end(clip)), 0) });
}
