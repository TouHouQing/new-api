import type { TimelineClip, TimelineProject } from "@/types/timeline";

export function timelineClipFade(clip: TimelineClip, programMs: number): number {
    const local = programMs - clip.startMs;
    if (local < 0 || local >= clip.durationMs) return 0;
    const fadeIn = clip.fadeInMs ? Math.min(1, local / clip.fadeInMs) : 1;
    const fadeOut = clip.fadeOutMs ? Math.min(1, (clip.durationMs - local) / clip.fadeOutMs) : 1;
    return Math.max(0, fadeIn * fadeOut);
}

export function activeTimelineLayers(project: TimelineProject, programMs: number) {
    const tracks = new Map(project.tracks.map((track) => [track.id, track]));
    const active = project.clips.filter((clip) => tracks.get(clip.trackId)?.visible !== false && clip.startMs <= programMs && programMs < clip.startMs + clip.durationMs);
    return {
        audio: active.filter((clip) => clip.kind === "audio" && !tracks.get(clip.trackId)?.muted),
        text: active.filter((clip) => (clip.kind === "subtitle" || clip.kind === "text") && clip.text?.trim()),
    };
}
