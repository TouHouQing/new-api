import type { SrtEntry, TimelineClip } from "@/types/timeline";
import type { TimelineTranscriptionSegment } from "@/services/api/timeline-tasks";
import { clipProgramOffset, clipSourceOffset } from "./timeline-speed";

/** Map the source transcript to this occurrence only. Duplicate uses of the
 * same file keep separate identities and source trims. Moving the clip before
 * adoption changes the program offset without changing the recognized text. */
export function transcriptionForClip(segments: TimelineTranscriptionSegment[], clip: TimelineClip): SrtEntry[] {
    const sourceStart = clip.sourceStartMs ?? 0;
    const sourceEnd = sourceStart + clipSourceOffset(clip, clip.durationMs);
    return segments
        .flatMap((segment) => {
            if (!Number.isSafeInteger(segment.startMs) || !Number.isSafeInteger(segment.endMs) || segment.startMs < 0 || segment.endMs <= segment.startMs || !segment.text?.trim()) throw new Error("识别结果包含无效的字幕时间或文本");
            const start = Math.max(sourceStart, segment.startMs);
            const end = Math.min(sourceEnd, segment.endMs);
            const programStart = clipProgramOffset(clip, start - sourceStart);
            const programEnd = Math.min(clip.durationMs, clipProgramOffset(clip, end - sourceStart));
            return end > start && programEnd > programStart ? [{ index: 0, startMs: clip.startMs + programStart, endMs: clip.startMs + programEnd, text: segment.text.trim() }] : [];
        })
        .map((entry, index) => ({ ...entry, index: index + 1 }));
}
