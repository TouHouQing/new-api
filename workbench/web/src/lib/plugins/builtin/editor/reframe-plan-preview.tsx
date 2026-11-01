import { useEffect, useRef, useState } from "react";
import { Button, Checkbox, Slider, Space } from "antd";
import type { TimelineClip } from "@/types/timeline";
import { resourceFileUrl } from "@/services/api/resources";
import { reframePreviewStyle } from "@/lib/timeline/timeline-reframe";
import { clipPlaybackRate, clipSourceOffset } from "@/lib/timeline/timeline-speed";

export function ReframePlanPreview({ clip, onMedia }: { clip: TimelineClip; onMedia?: (video: HTMLVideoElement | null) => void }) {
    const media = useRef<HTMLVideoElement | null>(null);
    const start = clip.sourceStartMs ?? 0,
        end = start + clipSourceOffset(clip, clip.durationMs);
    const [timeMs, setTimeMs] = useState(start),
        [original, setOriginal] = useState(false),
        [playing, setPlaying] = useState(false),
        [error, setError] = useState("");
    useEffect(() => {
        let handle = 0;
        function tick() {
            const video = media.current;
            if (video && !video.paused) {
                setTimeMs(video.currentTime * 1000);
                if (video.currentTime * 1000 >= end) {
                    video.pause();
                    video.currentTime = start / 1000;
                    setTimeMs(start);
                }
            }
            handle = requestAnimationFrame(tick);
        }
        handle = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(handle);
            media.current?.pause();
        };
    }, [start, end]);
    if (!clip.reframe) return null;
    const style = original ? null : reframePreviewStyle(clip.reframe, timeMs);
    return (
        <div className="my-3" aria-label="构图对比预览">
            <div className="relative flex h-64 w-full items-center justify-center overflow-hidden bg-black" style={{ containerType: "size" }}>
                <div className={style ? "" : "contents"} style={style?.viewport}>
                    <video
                        ref={(node) => {
                            media.current = node;
                            onMedia?.(node);
                        }}
                        src={resourceFileUrl(clip.reframe.resourceId)}
                        className="max-h-full max-w-full object-contain"
                        style={style?.media}
                        playsInline
                        preload="metadata"
                        muted
                        aria-label={original ? "原始构图视频" : "跟随构图视频"}
                        onLoadedMetadata={() => {
                            if (media.current) {
                                media.current.currentTime = start / 1000;
                                media.current.playbackRate = clipPlaybackRate(clip);
                            }
                        }}
                        onSeeked={() => {
                            if (media.current) setTimeMs(media.current.currentTime * 1000);
                        }}
                        onPlay={() => setPlaying(true)}
                        onPause={() => setPlaying(false)}
                        onError={() => setError("构图预览无法播放，请检查原始素材")}
                    />
                </div>
            </div>
            <Slider
                aria-label="构图预览源时间"
                min={start}
                max={end - 1}
                step={1}
                value={Math.min(end - 1, Math.round(timeMs))}
                onChange={(value) => {
                    if (media.current) {
                        media.current.pause();
                        media.current.currentTime = value / 1000;
                        setTimeMs(value);
                    }
                }}
            />
            <Space wrap>
                <Button
                    onClick={() => {
                        const video = media.current;
                        if (!video) return;
                        if (video.paused) void video.play().catch(() => setError("请重试播放构图预览"));
                        else video.pause();
                    }}
                >
                    {playing ? "暂停构图预览" : "播放构图预览"}
                </Button>
                <Checkbox checked={original} onChange={(event) => setOriginal(event.target.checked)}>
                    对比原画面
                </Checkbox>
                <span className="text-xs">
                    源时间 {(timeMs / 1000).toFixed(2)} 秒 · {clipPlaybackRate(clip)} 倍速
                </span>
            </Space>
            {error && <p role="alert">{error}</p>}
        </div>
    );
}
