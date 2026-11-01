import { useEffect, useRef, useState } from "react";
import { Button, InputNumber, Radio, Slider, Space } from "antd";
import { resourceFileUrl } from "@/services/api/resources";
import type { VideoReworkMedia, VideoReworkRegion, VideoReworkResult } from "@/types/video-rework";
import { draggedVideoReworkRegion, updateVideoReworkRegion } from "@/lib/timeline/video-rework-region";

export function VideoReworkRegionPicker({ media, timeMs, region, disabled, onChange }: { media: VideoReworkMedia; timeMs: number; region?: VideoReworkRegion; disabled: boolean; onChange: (value: VideoReworkRegion) => void }) {
    const video = useRef<HTMLVideoElement>(null),
        start = useRef<{ x: number; y: number } | null>(null);
    const [draft, setDraft] = useState<VideoReworkRegion>(),
        [error, setError] = useState("");
    const selected = draft ?? region;
    const seek = () => {
        if (video.current?.readyState) video.current.currentTime = Math.max(0, timeMs / 1000);
    };
    useEffect(seek, [timeMs, media.resourceId]);
    useEffect(() => {
        setDraft(undefined);
        start.current = null;
    }, [region, disabled]);
    const point = (event: React.PointerEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return { x: Math.max(0, Math.min(media.width - 1, Math.floor(((event.clientX - rect.left) / rect.width) * media.width))), y: Math.max(0, Math.min(media.height - 1, Math.floor(((event.clientY - rect.top) / rect.height) * media.height))) };
    };
    const drag = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!start.current || disabled || !region) return;
        return draggedVideoReworkRegion(start.current, point(event), media.width, media.height);
    };
    return (
        <div className="space-y-2">
            <div
                className="relative mx-auto max-w-lg overflow-hidden rounded-md bg-black"
                style={{ aspectRatio: `${media.width}/${media.height}`, touchAction: region ? "none" : "auto", cursor: region && !disabled ? "crosshair" : "default" }}
                aria-label="原视频区域选择"
                onPointerDown={(event) => {
                    if (!region || disabled || event.button !== 0) return;
                    start.current = point(event);
                    event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                    const value = drag(event);
                    if (value) setDraft(value);
                }}
                onPointerUp={(event) => {
                    const value = drag(event);
                    start.current = null;
                    setDraft(undefined);
                    if (value) onChange(value);
                }}
                onPointerCancel={() => {
                    start.current = null;
                    setDraft(undefined);
                }}
            >
                <video
                    ref={video}
                    src={resourceFileUrl(media.resourceId)}
                    muted
                    playsInline
                    preload="metadata"
                    className="pointer-events-none h-full w-full"
                    aria-label="所选原视频画面"
                    onLoadedMetadata={seek}
                    onError={() => setError("原视频暂时无法播放，请检查素材后重试")}
                />
                {selected && (
                    <div
                        className="pointer-events-none absolute border-2 border-white bg-white/15"
                        style={{ left: `${(selected.x / media.width) * 100}%`, top: `${(selected.y / media.height) * 100}%`, width: `${(selected.width / media.width) * 100}%`, height: `${(selected.height / media.height) * 100}%` }}
                    />
                )}
            </div>
            {region && (
                <>
                    <p className="text-xs text-muted-foreground">拖动框选要替换的区域，或调整下面的像素范围。</p>
                    <Space wrap>
                        {(["x", "y", "width", "height"] as const).map((key) => (
                            <label key={key}>
                                {{ x: "左边距", y: "上边距", width: "宽", height: "高" }[key]}
                                <InputNumber
                                    aria-label={`修复区域${key}`}
                                    size="small"
                                    precision={0}
                                    min={key === "width" || key === "height" ? 2 : 0}
                                    max={key === "x" ? media.width - 2 : key === "y" ? media.height - 2 : key === "width" ? media.width - region.x : media.height - region.y}
                                    value={region[key]}
                                    disabled={disabled}
                                    onChange={(v) => {
                                        if (v != null) onChange(updateVideoReworkRegion(region, key, Number(v), media.width, media.height));
                                    }}
                                />
                            </label>
                        ))}
                    </Space>
                </>
            )}
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
        </div>
    );
}

export function VideoReworkComparison({ result }: { result: VideoReworkResult }) {
    const original = useRef<HTMLVideoElement>(null),
        repaired = useRef<HTMLVideoElement>(null);
    const [listening, setListening] = useState<"original" | "repaired">("repaired"),
        [error, setError] = useState("");
    const [cursor, setCursor] = useState(0),
        [originalFade, setOriginalFade] = useState(1);
    const plan = result.videoRework.plan,
        length = (plan.request.sourceEndMs - plan.request.sourceStartMs) / 1000;
    const repairedStart = plan.version === 2 ? plan.request.sourceStartMs / 1000 : 0;
    const pause = () => {
        original.current?.pause();
        repaired.current?.pause();
    };
    useEffect(() => pause, [result.video.resourceId]);
    const sync = () => {
        const a = original.current,
            b = repaired.current;
        if (!a || !b) return;
        const elapsed = a.currentTime - plan.request.sourceStartMs / 1000;
        setCursor(Math.max(0, Math.min(length, elapsed)));
        const fade = plan.originalFade;
        if (fade) {
            const local = fade.offsetMs + (Math.max(0, elapsed) * 1000) / plan.playbackRate;
            const gain = Math.max(0, (fade.fadeInMs ? Math.min(1, local / fade.fadeInMs) : 1) * (fade.fadeOutMs ? Math.min(1, (fade.durationMs - local) / fade.fadeOutMs) : 1));
            a.volume = gain;
            if (plan.version === 2) b.volume = gain;
            setOriginalFade(gain);
        }
        if (elapsed >= length - 0.015 || elapsed < -0.1) {
            pause();
            return;
        }
        if (!a.paused && Math.abs(b.currentTime - repairedStart - elapsed) > 0.12) b.currentTime = repairedStart + Math.max(0, elapsed);
    };
    async function play() {
        const a = original.current,
            b = repaired.current;
        if (!a || !b) return;
        setError("");
        pause();
        a.currentTime = plan.request.sourceStartMs / 1000;
        b.currentTime = repairedStart;
        a.playbackRate = b.playbackRate = plan.playbackRate;
        try {
            await Promise.all([a.play(), b.play()]);
        } catch {
            pause();
            setError("播放未成功，请等待视频载入后再次点击播放");
        }
    }
    return (
        <div className="space-y-2" data-video-rework-comparison>
            <div className="grid gap-3 sm:grid-cols-2">
                <figure>
                    <figcaption className="mb-1 text-sm">原片段</figcaption>
                    <div className="rounded bg-black">
                        <video
                            ref={original}
                            src={resourceFileUrl(plan.source.resourceId)}
                            muted={listening !== "original"}
                            playsInline
                            preload="auto"
                            className="w-full rounded"
                            style={{ opacity: originalFade }}
                            aria-label="修复前视频"
                            onLoadedMetadata={() => {
                                if (original.current) original.current.currentTime = plan.request.sourceStartMs / 1000;
                            }}
                            onTimeUpdate={sync}
                            onEnded={pause}
                            onError={() => setError("原片段暂时无法播放")}
                        />
                    </div>
                </figure>
                <figure>
                    <figcaption className="mb-1 text-sm">修复候选</figcaption>
                    <div className="rounded bg-black">
                        <video
                            ref={repaired}
                            src={resourceFileUrl(result.video.resourceId)}
                            muted={listening !== "repaired"}
                            playsInline
                            preload="auto"
                            className="w-full rounded"
                            style={{ opacity: plan.version === 2 ? originalFade : 1 }}
                            aria-label="修复后视频"
                            onLoadedMetadata={() => {
                                if (repaired.current) repaired.current.currentTime = repairedStart;
                            }}
                            onEnded={pause}
                            onError={() => setError("修复候选暂时无法播放，请核对原任务")}
                        />
                    </div>
                </figure>
            </div>
            <Slider
                aria-label="对比播放位置"
                min={0}
                max={length}
                step={0.01}
                value={cursor}
                tooltip={{ formatter: (v) => `${v?.toFixed(2)} 秒` }}
                onChange={(value) => {
                    pause();
                    setCursor(value);
                    if (original.current) original.current.currentTime = plan.request.sourceStartMs / 1000 + value;
                    if (repaired.current) repaired.current.currentTime = repairedStart + value;
                }}
            />
            <Space wrap>
                <Button onClick={() => void play()}>播放所选范围对比</Button>
                <Button onClick={pause}>暂停对比</Button>
                <Radio.Group aria-label="对比试听" value={listening} onChange={(e) => setListening(e.target.value)}>
                    <Radio value="original">听原声</Radio>
                    <Radio value="repaired">听修复候选</Radio>
                </Radio.Group>
            </Space>
            <p className="text-xs text-muted-foreground">对比为素材原尺寸；采用后的构图、配音和字幕可在剪辑器中预览。</p>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
        </div>
    );
}
