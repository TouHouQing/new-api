import type { TimelineProject, TimelineProductionMarker } from "@/types/timeline";
import { clipPlaybackRate, clipSourceOffset } from "./timeline-speed";

/** Reconcile source anchors after every editor command, including gesture previews. */
export function reconcileTimelineMarkers(project: TimelineProject): TimelineProject {
    if (project.productionMarkers === undefined) return project;
    if (!Array.isArray(project.productionMarkers) || project.productionMarkers.length > 4000) throw new Error("时间线标记无效");
    const ids = new Set<string>();
    const markers: TimelineProductionMarker[] = [];
    for (const marker of project.productionMarkers) {
        if (
            !marker.id ||
            marker.id.length > 128 ||
            ids.has(marker.id) ||
            !["cut", "beat", "note"].includes(marker.kind) ||
            typeof marker.label !== "string" ||
            Array.from(marker.label).length > 160 ||
            !Number.isSafeInteger(marker.timeMs) ||
            marker.timeMs < 0 ||
            marker.timeMs > 86400000
        )
            throw new Error("时间线标记格式无效");
        ids.add(marker.id);
        const source = marker.source;
        if (!source) {
            if (marker.kind !== "note") throw new Error("分析标记缺少来源");
            markers.push(marker);
            continue;
        }
        if (
            ![source.analysisId, source.revisionId, source.itemId, source.clipId, source.occurrenceId, source.resourceId].every((id) => typeof id === "string" && id.length > 0 && id.length <= 128 && !/[\x00\r\n]/.test(id)) ||
            !Number.isSafeInteger(source.sourceTimeMs) ||
            source.sourceTimeMs < 0 ||
            source.sourceTimeMs > 86400000
        )
            throw new Error("分析标记来源无效");
        const candidates = project.clips.filter(
            (clip) =>
                (clip.analysisOccurrenceId ?? clip.id) === source.occurrenceId &&
                (clip.directMedia?.storageKey === `resource:${source.resourceId}` || (clip.videoReworkOrigin?.version === 2 && clip.videoReworkOrigin.sourceResourceIds?.includes(source.resourceId))) &&
                source.sourceTimeMs >= (clip.sourceStartMs ?? 0) &&
                source.sourceTimeMs < (clip.sourceStartMs ?? 0) + clipSourceOffset(clip, clip.durationMs),
        );
        if (candidates.length > 1) throw new Error("分析标记对应多个片段，请检查实例来源");
        const clip = candidates[0];
        if (!clip) continue;
        const timeMs = clip.startMs + Math.min(clip.durationMs - 1, Math.round((source.sourceTimeMs - (clip.sourceStartMs ?? 0)) / clipPlaybackRate(clip)));
        markers.push({ ...marker, timeMs, source: { ...source, clipId: clip.id } });
    }
    return { ...project, productionMarkers: markers };
}
