import { useEffect, useRef, useState } from "react";
import { Button } from "antd";
import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { Select } from "@/components/ui/base/select";
import type { ShotArtifact } from "@/services/api/projects";
import { resourceFileUrl } from "@/services/api/resources";
import { modelDisplayName, useEffectiveConfig } from "@/stores/use-config-store";

export function ArtifactCompareModal({ open, artifacts, onClose }: { open: boolean; artifacts: ShotArtifact[]; onClose: () => void }) {
    return (
        <AppModal title="对比候选版本" open={open} onCancel={onClose} width={1080} footer={<Button onClick={onClose}>返回制作</Button>}>
            {open ? <ArtifactComparison artifacts={artifacts.filter((item) => !!item.resourceId)} /> : null}
        </AppModal>
    );
}

function ArtifactComparison({ artifacts }: { artifacts: ShotArtifact[] }) {
    const [leftId, setLeftId] = useState<string | undefined>(() => (artifacts.find((item) => item.selected) || artifacts[0])?.id);
    const [rightId, setRightId] = useState<string | undefined>(() => artifacts.find((item) => item.id !== leftId)?.id);
    const media = useRef<Array<HTMLVideoElement | null>>([]);
    const playbackEpoch = useRef(0);
    const [playing, setPlaying] = useState(false);
    const [starting, setStarting] = useState(false);
    const [position, setPosition] = useState(0);
    const [duration, setDuration] = useState(0);
    const [error, setError] = useState("");
    const left = artifacts.find((item) => item.id === leftId) || artifacts[0];
    const right = artifacts.find((item) => item.id === rightId && item.id !== left?.id) || artifacts.find((item) => item.id !== left?.id);
    const videos = left?.type === "video" && right?.type === "video";
    function pause() {
        playbackEpoch.current++;
        media.current.forEach((video) => video?.pause());
        setPlaying(false);
    }
    function seek(time: number) {
        media.current.forEach((video) => {
            if (video && Number.isFinite(video.duration)) video.currentTime = Math.min(time, video.duration);
        });
        setPosition(time);
    }
    function metadataReady() {
        const durations = media.current.map((video) => video?.duration || 0);
        setDuration(durations.length === 2 && durations.every((value) => value > 0 && Number.isFinite(value)) ? Math.min(...durations) : 0);
    }
    useEffect(() => {
        const elements = media.current;
        return () => {
            playbackEpoch.current++;
            elements.forEach((video) => video?.pause());
        };
    }, []);
    useEffect(() => {
        if (!playing) return;
        const timer = window.setInterval(() => {
            const [first, second] = media.current;
            if (!first || !second) return;
            if (first.ended || second.ended || first.currentTime >= duration) {
                pause();
                setPosition(duration);
                return;
            }
            if (Math.abs(first.currentTime - second.currentTime) > 0.15) second.currentTime = Math.min(first.currentTime, second.duration);
            setPosition(first.currentTime);
        }, 100);
        return () => window.clearInterval(timer);
    }, [playing, duration]);
    async function togglePlay() {
        if (playing) {
            pause();
            return;
        }
        if (!duration) return;
        if (position >= duration - 0.03) seek(0);
        const epoch = ++playbackEpoch.current;
        setStarting(true);
        setError("");
        try {
            await Promise.all(media.current.map((video) => video?.play()));
            if (epoch === playbackEpoch.current) setPlaying(true);
        } catch {
            if (epoch === playbackEpoch.current) {
                pause();
                setError("视频暂时无法播放，请确认两版文件都已加载后重试");
            }
        } finally {
            setStarting(false);
        }
    }
    function choose(index: number, id: string) {
        pause();
        seek(0);
        setDuration(0);
        setError("");
        if (index === 0) {
            if (id === right?.id) setRightId(left?.id);
            setLeftId(id);
        } else {
            if (id === left?.id) setLeftId(right?.id);
            setRightId(id);
        }
    }
    if (!left || !right) return <p>至少需要两版有文件的候选才能对比。</p>;
    return (
        <div className="space-y-4">
            <p className="text-sm text-foreground/60">检查主体、构图、运动和瑕疵。对比不会改变选用版本或现有剪辑。</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[left, right].map((artifact, index) => (
                    <section className="min-w-0 space-y-3" key={index}>
                        <Select
                            className="w-full"
                            aria-label={`对比候选 ${index === 0 ? "A" : "B"}`}
                            value={artifact.id}
                            onChange={(id: string) => choose(index, id)}
                            options={artifacts.map((item) => ({ value: item.id, label: `v${item.version}${item.selected ? " · 已选用" : ""}${item.archived ? " · 已归档" : ""}${item.status === "stale" ? " · 旧脚本" : ""}` }))}
                        />
                        {artifact.type === "video" ? (
                            <video
                                key={artifact.resourceId}
                                ref={(video) => {
                                    media.current[index] = video;
                                }}
                                src={resourceFileUrl(artifact.resourceId!)}
                                className="h-80 w-full rounded-lg bg-surface object-contain"
                                muted
                                playsInline
                                preload="auto"
                                onLoadedMetadata={metadataReady}
                                onError={() => {
                                    pause();
                                    setError("一版候选文件无法读取，请返回制作检查原文件");
                                }}
                            />
                        ) : (
                            <img src={resourceFileUrl(artifact.resourceId!)} alt={`候选 v${artifact.version}`} className="h-80 w-full rounded-lg bg-surface object-contain" />
                        )}
                        <CandidateMetadata artifact={artifact} />
                    </section>
                ))}
            </div>
            {videos ? (
                <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={() => void togglePlay()} loading={starting} disabled={!duration}>
                        {playing ? "暂停对比" : "同步播放"}
                    </Button>
                    <input
                        className="min-w-36 flex-1"
                        type="range"
                        min={0}
                        max={duration || 0.01}
                        step={0.01}
                        value={Math.min(position, duration)}
                        disabled={!duration}
                        aria-label="对比播放位置"
                        onChange={(event) => {
                            pause();
                            seek(Number(event.target.value));
                        }}
                    />
                    <span className="text-xs tabular-nums text-foreground/60">
                        {position.toFixed(2)} / {duration.toFixed(2)} 秒
                    </span>
                    <p className="w-full text-xs text-foreground/50">两版静音同步播放，到较短一版结束。可拖动进度检查画面。</p>
                </div>
            ) : null}
            {error ? (
                <p role="alert" className="text-sm text-foreground">
                    {error}
                </p>
            ) : null}
        </div>
    );
}

function CandidateMetadata({ artifact }: { artifact: ShotArtifact }) {
    const config = useEffectiveConfig();
    let metadata: Record<string, unknown> = {};
    try {
        const value: unknown = JSON.parse(artifact.metadataJson || "{}");
        if (value && typeof value === "object" && !Array.isArray(value)) metadata = value as Record<string, unknown>;
    } catch {
        /* A legacy candidate may lack structured settings. */
    }
    const values = [
        ["模型", typeof metadata.modelLabel === "string" && metadata.modelLabel.trim() ? metadata.modelLabel : typeof metadata.model === "string" ? modelDisplayName(config, metadata.model) : undefined],
        ["画幅", metadata.aspectRatio],
        ["请求时长", artifact.type === "video" && typeof metadata.durationSeconds === "number" ? `${Number(metadata.durationSeconds.toFixed(2))} 秒` : undefined],
    ];
    return (
        <dl className="space-y-1 text-xs text-foreground/60">
            <div>
                <dt className="sr-only">版本</dt>
                <dd>
                    v{artifact.version} · {new Date(artifact.createdAt).toLocaleString("zh-CN")}
                    {artifact.archived ? " · 已归档" : ""}
                </dd>
            </div>
            {values
                .filter(([, value]) => typeof value === "string" && value)
                .map(([label, value]) => (
                    <div className="flex gap-2" key={String(label)}>
                        <dt>{String(label)}</dt>
                        <dd className="min-w-0 break-all">{String(value)}</dd>
                    </div>
                ))}
        </dl>
    );
}
