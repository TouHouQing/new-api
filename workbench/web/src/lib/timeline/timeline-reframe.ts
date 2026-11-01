import type { CSSProperties } from "react";
import type { TimelineProject, TimelineReframe } from "@/types/timeline";
import { clipSourceOffset } from "./timeline-speed";

export function validateTimelineReframeRanges(timeline: TimelineProject) {
    for (const clip of timeline.clips) {
        const r = clip.reframe;
        if (!r) continue;
        const start = clip.sourceStartMs ?? 0,
            end = start + clipSourceOffset(clip, clip.durationMs);
        if (clip.kind !== "video" || start < r.startMs || end > r.endMs) throw new Error("构图未覆盖这个源区间，请先移除构图、缩短片段或重新分析");
    }
    return timeline;
}

/** Same source clock, linear interpolation and even-pixel crop as native FFmpeg. */
export function sampleTimelineReframe(r: TimelineReframe, sourceTimeMs: number) {
    let a = r.keys[0],
        b = r.keys[r.keys.length - 1];
    if (!a || !b) throw new Error("构图关键点缺失");
    for (let i = 1; i < r.keys.length; i++) {
        if (sourceTimeMs <= r.keys[i].timeMs) {
            a = r.keys[i - 1];
            b = r.keys[i];
            break;
        }
    }
    const f = Math.max(0, Math.min(1, (sourceTimeMs - a.timeMs) / (b.timeMs - a.timeMs || 1)));
    const width = 2 * Math.floor((r.width * r.sourceWidth) / 2),
        height = 2 * Math.floor((r.height * r.sourceHeight) / 2);
    return { x: 2 * Math.floor(((a.x + (b.x - a.x) * f) * r.sourceWidth) / 2), y: 2 * Math.floor(((a.y + (b.y - a.y) * f) * r.sourceHeight) / 2), width, height };
}

export function reframePreviewStyle(r: TimelineReframe, sourceTimeMs: number, fit?: "letterbox" | "crop" | "blur"): { viewport: CSSProperties; media: CSSProperties } {
    const crop = sampleTimelineReframe(r, sourceTimeMs),
        aspect = crop.width / crop.height;
    return {
        viewport: { width: `${fit === "crop" ? "max" : "min"}(100cqw, calc(100cqh * ${aspect}))`, height: `${fit === "crop" ? "max" : "min"}(100cqh, calc(100cqw / ${aspect}))`, position: "relative", overflow: "hidden", flexShrink: 0 },
        media: {
            position: "absolute",
            width: `${(r.sourceWidth / crop.width) * 100}%`,
            height: `${(r.sourceHeight / crop.height) * 100}%`,
            maxWidth: "none",
            maxHeight: "none",
            left: `${(-crop.x / crop.width) * 100}%`,
            top: `${(-crop.y / crop.height) * 100}%`,
            objectFit: "fill",
        },
    };
}

export function reframeFFmpegFilter(r: TimelineReframe | undefined, sourceStartMs: number) {
    if (!r) return "";
    const coordinate = (axis: "x" | "y") => {
        const time = `(t*1000+${sourceStartMs})`;
        const expression = (first: number, last: number): string => {
            if (last - first === 1) {
                const a = r.keys[first],
                    b = r.keys[last];
                return `(${a[axis].toFixed(10)}+(${(b[axis] - a[axis]).toFixed(10)})*clip((${time}-${a.timeMs})/${b.timeMs - a.timeMs},0,1))`;
            }
            const middle = Math.floor((first + last) / 2);
            return `if(lt(${time},${r.keys[middle].timeMs}),${expression(first, middle)},${expression(middle, last)})`;
        };
        return expression(0, r.keys.length - 1);
    };
    const crop = sampleTimelineReframe(r, sourceStartMs);
    return `setpts=PTS-STARTPTS,crop=${crop.width}:${crop.height}:'2*floor(iw*(${coordinate("x")})/2)':'2*floor(ih*(${coordinate("y")})/2)',`;
}
