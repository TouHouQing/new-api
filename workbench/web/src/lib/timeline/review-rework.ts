import type { TimelineProject } from "@/types/timeline";
import type { ReviewClip } from "@/services/api/project-reviews";

/** A matching id alone is insufficient after replacement. Locate only this
 * exact occurrence and clock; moving it on program time can still be mapped. */
export function locateReviewRework(project: TimelineProject, location: { clip?: ReviewClip; programStartMs: number }) {
    const source = location.clip;
    if (!source?.resourceId) return null;
    const matches = project.clips.filter((clip) => clip.id === source.id);
    if (matches.length !== 1) return null;
    const clip = matches[0];
    if (clip.kind !== source.kind || clip.directMedia?.id !== source.resourceId || clip.durationMs !== source.durationMs || (clip.sourceStartMs || 0) !== (source.sourceStartMs || 0) || (clip.playbackRate || 1) !== (source.playbackRate || 1)) return null;
    for (const key of ["shotId", "artifactId", "assetVersionId"] as const) if (source[key] && clip.productionBinding?.[key] !== source[key]) return null;
    const offset = location.programStartMs - source.startMs;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset >= clip.durationMs) return null;
    return { clipId: clip.id, timeMs: clip.startMs + offset };
}
