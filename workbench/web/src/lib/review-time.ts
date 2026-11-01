export function reviewCaptureSeconds(seconds: number, durationMs: number) {
    const point = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds * 1000)) : 0;
    return Math.min(point, Math.max(0, durationMs - 1)) / 1000;
}
