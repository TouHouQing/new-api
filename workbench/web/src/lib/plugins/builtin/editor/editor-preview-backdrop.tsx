import { useEffect, useRef, type RefObject } from "react";
import type { TimelineReframe } from "@/types/timeline";
import { sampleTimelineReframe } from "@/lib/timeline/timeline-reframe";

// Sample the already-playing element so the blurred fill never runs a second
// media clock or audio track. No media copy is uploaded or saved.
export function EditorPreviewBackdrop({ media, width, opacity, reframe, sourceMs }: { media: RefObject<HTMLVideoElement | HTMLImageElement | null>; width: number; opacity: number; reframe?: TimelineReframe; sourceMs: number }) {
    const canvas = useRef<HTMLCanvasElement>(null),
        latest = useRef({ reframe, sourceMs });
    latest.current = { reframe, sourceMs };
    useEffect(() => {
        let frame = 0,
            disposed = false;
        const draw = () => {
            if (disposed) return;
            const target = canvas.current,
                element = media.current;
            if (target && element) {
                const w = element instanceof HTMLVideoElement ? element.videoWidth : element.naturalWidth;
                const h = element instanceof HTMLVideoElement ? element.videoHeight : element.naturalHeight;
                const ready = element instanceof HTMLVideoElement ? element.readyState >= 2 : element.complete;
                const cw = Math.max(1, Math.round(target.clientWidth)),
                    ch = Math.max(1, Math.round(target.clientHeight));
                if (target.width !== cw || target.height !== ch) {
                    target.width = cw;
                    target.height = ch;
                }
                const context = target.getContext("2d");
                if (context) {
                    context.clearRect(0, 0, cw, ch);
                    if (ready && w > 0 && h > 0) {
                        const current = latest.current,
                            crop = current.reframe ? sampleTimelineReframe(current.reframe, current.sourceMs) : { x: 0, y: 0, width: w, height: h };
                        const scale = Math.max(cw / crop.width, ch / crop.height);
                        context.drawImage(element, crop.x, crop.y, crop.width, crop.height, (cw - crop.width * scale) / 2, (ch - crop.height * scale) / 2, crop.width * scale, crop.height * scale);
                    }
                }
                target.style.filter = `blur(${(20 * cw) / width}px)`;
            }
            frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
        return () => {
            disposed = true;
            cancelAnimationFrame(frame);
        };
    }, [media, width]);
    return <canvas ref={canvas} aria-hidden="true" data-preview-blur-fill="true" className="pointer-events-none absolute inset-0 h-full w-full" style={{ opacity, transform: "scale(1.04)" }} />;
}
