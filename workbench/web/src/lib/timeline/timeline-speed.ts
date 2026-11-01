import type { TimelineClip } from "@/types/timeline";

export function clipPlaybackRate(clip: Pick<TimelineClip, "playbackRate">): number {
    const rate = clip.playbackRate ?? 1;
    if (!Number.isFinite(rate) || rate < 0.25 || rate > 4) throw new Error("片段速度需在 0.25 至 4 倍之间");
    return rate;
}

export function clipSourceOffset(clip: Pick<TimelineClip, "playbackRate">, programMs: number): number {
    return Math.round(programMs * clipPlaybackRate(clip));
}

export function clipSourceTime(clip: TimelineClip, programMs: number): number {
    return (clip.sourceStartMs ?? 0) + clipSourceOffset(clip, Math.max(0, Math.min(clip.durationMs, programMs - clip.startMs)));
}

export function clipProgramOffset(clip: Pick<TimelineClip, "playbackRate">, sourceMs: number): number {
    return Math.round(sourceMs / clipPlaybackRate(clip));
}
