import type { TimelineProject } from "@/types/timeline";

/** Top tracks paint last; equal orders retain the document's occurrence order. */
export function timelineOverlayRanks(project: TimelineProject | null) {
    const orders = new Map(project?.tracks.map((track) => [track.id, track.order]));
    return new Map([...(project?.clips ?? [])].sort((a, b) => (orders.get(b.trackId) ?? 0) - (orders.get(a.trackId) ?? 0)).map((clip, index) => [clip.id, index + 1]));
}
