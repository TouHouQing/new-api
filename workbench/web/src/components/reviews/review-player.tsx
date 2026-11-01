import { forwardRef, useEffect, useState } from "react";

export const ReviewPlayer = forwardRef<HTMLMediaElement, { src: string; kind: string; title: string; onTime?: (time: number) => void }>(function ReviewPlayer({ src, kind, title, onTime }, ref) {
    const [error, setError] = useState("");
    useEffect(() => {
        setError("");
    }, [src]);
    const fail = () => setError("原片暂时无法播放，请刷新核对链接和文件权限；意见输入会保留。");
    const props = { src, controls: true, preload: "metadata", onError: fail, onTimeUpdate: (event: React.SyntheticEvent<HTMLMediaElement>) => onTime?.(event.currentTarget.currentTime) };
    return (
        <div className="space-y-2">
            {kind === "image" ? (
                <img src={src} alt={title} className="max-h-[55vh] w-full bg-surface object-contain" onError={fail} />
            ) : kind === "audio" ? (
                <audio {...props} ref={ref as React.Ref<HTMLAudioElement>} className="w-full" aria-label="固定原片播放" />
            ) : (
                <video {...props} ref={ref as React.Ref<HTMLVideoElement>} playsInline className="max-h-[55vh] w-full bg-surface object-contain" aria-label="固定原片播放" />
            )}
            {error && <p role="alert">{error}</p>}
        </div>
    );
});
export function reviewTime(ms: number) {
    const seconds = ms / 1000;
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}
