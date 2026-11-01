import type { VideoReworkRegion } from "@/types/video-rework";
export function updateVideoReworkRegion(region: VideoReworkRegion, field: keyof VideoReworkRegion, value: number, width: number, height: number): VideoReworkRegion {
    if (!Number.isFinite(value)) return region;
    const next = { ...region, [field]: Math.round(value) };
    next.x = Math.max(0, Math.min(width - 2, next.x));
    next.y = Math.max(0, Math.min(height - 2, next.y));
    next.width = Math.max(2, Math.min(width - next.x, next.width));
    next.height = Math.max(2, Math.min(height - next.y, next.height));
    return next;
}

export function draggedVideoReworkRegion(start: { x: number; y: number }, end: { x: number; y: number }, width: number, height: number): VideoReworkRegion {
    const region = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.max(2, Math.abs(start.x - end.x) + 1), height: Math.max(2, Math.abs(start.y - end.y) + 1) };
    return updateVideoReworkRegion(region, "x", region.x, width, height);
}
