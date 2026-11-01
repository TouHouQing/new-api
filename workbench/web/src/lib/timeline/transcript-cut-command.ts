import type { TimelineProject } from "@/types/timeline";
import type { EditorCommandRegistry } from "./editor-commands";
import { clipPlaybackRate, clipSourceOffset } from "./timeline-speed";

export const TRANSCRIPT_CUT_COMMAND = "transcript.applyCutPlan";
export type TranscriptCutCommandPayload = { before: TimelineProject; after: TimelineProject };

/** Ignore the optional display timestamp, preserving all actual editing fields. */
export function timelineContentSignature(project: TimelineProject): string {
    return JSON.stringify({ ...project, updatedAt: undefined }, (_key, value: unknown) => {
        if (value && typeof value === "object" && !Array.isArray(value)) {
            return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
        }
        return value;
    });
}

/** Trusted built-in plugin command: server plans enter native undo/save once. */
export function registerTranscriptCutCommand(registry: EditorCommandRegistry): void {
    registry.register(TRANSCRIPT_CUT_COMMAND, (state, payload) => {
        const input = payload as TranscriptCutCommandPayload;
        if (!input?.before || !input.after || timelineContentSignature(state) !== timelineContentSignature(input.before)) throw new Error("剪辑已变化，请重新检查文字剪切的影响");
        const next = input.after;
        if (next.version !== 2 || !Array.isArray(next.tracks) || !Array.isArray(next.clips) || next.tracks.length > 64 || next.clips.length > 5000) throw new Error("文字剪切结果无效");
        const tracks = new Set(next.tracks.map((track) => track.id));
        const kinds = new Set(["video", "audio", "image", "subtitle", "text"]);
        if (tracks.size !== next.tracks.length || next.tracks.some((track) => !track.id || track.id.length > 128 || !kinds.has(track.kind))) throw new Error("文字剪切包含无效的轨道");
        const ids = new Set<string>();
        for (const clip of next.clips) {
            if (
                !clip.id ||
                clip.id.length > 128 ||
                ids.has(clip.id) ||
                !tracks.has(clip.trackId) ||
                !kinds.has(clip.kind) ||
                !Number.isSafeInteger(clip.startMs) ||
                clip.startMs < 0 ||
                !Number.isSafeInteger(clip.durationMs) ||
                clip.durationMs <= 0 ||
                clip.startMs + clip.durationMs > 86400000 ||
                (clip.sourceStartMs !== undefined && (!Number.isSafeInteger(clip.sourceStartMs) || clip.sourceStartMs < 0))
            )
                throw new Error("文字剪切包含无效的片段或时间");
            ids.add(clip.id);
            const rate = clipPlaybackRate(clip);
            if (rate !== 1 && clip.kind !== "video" && clip.kind !== "audio") throw new Error("仅音视频片段支持变速");
            if (rate !== 1 && clip.sourceDurationMs && (clip.sourceStartMs ?? 0) + clipSourceOffset(clip, clip.durationMs) > clip.sourceDurationMs) throw new Error("变速片段超出源素材时长");
        }
        const durationMs = next.clips.reduce((end, clip) => Math.max(end, clip.startMs + clip.durationMs), 0);
        if (durationMs !== next.durationMs || durationMs <= 0) throw new Error("文字剪切后的总时长无效");
        return structuredClone(next);
    });
}
