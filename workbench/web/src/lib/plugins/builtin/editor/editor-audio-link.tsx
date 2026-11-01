import { useEffect, useState } from "react";
import { Button } from "antd";
import { useEditorStoreContext } from "@/components/editor/editor-context";
import { setTimelineAudioLink } from "@/lib/timeline/timeline-audio-links";
import { formatTimelineTime } from "@/lib/timeline/timeline-view";
import type { TimelineClip } from "@/types/timeline";

export function EditorAudioLink({ clip }: { clip: TimelineClip }) {
    const { project, dispatch, selectClip, seekTransportMs } = useEditorStoreContext();
    const [source, setSource] = useState(clip.audioLink?.sourceClipId ?? clip.legacyAudioAnchor?.sourceClipId ?? "");
    const [mode, setMode] = useState<"source" | "clip">(clip.audioLink?.mode ?? "source");
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        if (clip.audioLink) {
            setSource(clip.audioLink.sourceClipId);
            setMode(clip.audioLink.mode);
        }
        setError(null);
    }, [clip.id, clip.audioLink?.sourceClipId, clip.audioLink?.mode, clip.legacyAudioAnchor?.sourceClipId]);
    useEffect(() => {
        if (source && !project?.clips.some((item) => item.id === source && item.kind === "video")) setSource("");
    }, [project, source]);
    if (!project) return null;
    const locked = !!project.tracks.find((track) => track.id === clip.trackId)?.locked;
    const videos = project.clips.filter((item) => item.kind === "video");
    const apply = (detach = false) => {
        const payload = { id: clip.id, ...(!detach ? { sourceClipId: source, mode } : {}) };
        try {
            setTimelineAudioLink(project, payload);
            dispatch({ op: "setAudioLink", payload });
            setError(null);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "声音跟随设置失败，请保留剪辑并重试");
        }
    };
    const control = "mt-1 w-full rounded-md border border-[var(--previs-sequencer-border)] bg-[var(--previs-sequencer-surface-raised)] p-2";
    return (
        <section className="mt-4 space-y-2 text-xs text-[var(--previs-dock-fg)]" aria-label="声音随镜头">
            <h3 className="font-medium">声音随镜头</h3>
            {clip.audioLink ? <p>已启用。移动或拆分镜头时，这段声音一起调整。</p> : <p className="opacity-70">旁白或对白可以跟随指定镜头，配乐可保持独立。</p>}
            {clip.legacyAudioAnchor && !clip.audioLink && <p className="opacity-70">已找到旧工程关联的镜头，请选择跟随方式后启用。</p>}
            <label className="block">
                跟随镜头
                <select
                    aria-label="声音跟随镜头"
                    className={control}
                    value={source}
                    disabled={locked}
                    onChange={(event) => {
                        setSource(event.target.value);
                        setError(null);
                    }}
                >
                    <option value="">选择这次使用的镜头</option>
                    {videos.map((item, index) => (
                        <option key={item.id} value={item.id}>
                            {item.title || `镜头 ${index + 1}`} · {formatTimelineTime(item.startMs)}
                        </option>
                    ))}
                </select>
            </label>
            <label className="block">
                跟随方式
                <select
                    aria-label="声音跟随方式"
                    className={control}
                    value={mode}
                    disabled={locked}
                    onChange={(event) => {
                        setMode(event.target.value as "source" | "clip");
                        setError(null);
                    }}
                >
                    <option value="source">随画面一起变速</option>
                    <option value="clip">保持原语速，跟随镜头位置</option>
                </select>
            </label>
            <p className="text-[11px] leading-relaxed opacity-60">声音需位于镜头内。镜头变短时裁去越界部分；保留原素材，可撤销。</p>
            {locked && <p>声音轨已锁定，请先解锁。</p>}
            <div className="flex flex-wrap gap-2">
                <Button size="small" disabled={locked || !source} onClick={() => apply()}>
                    {clip.audioLink ? "更新声音跟随" : "启用声音跟随"}
                </Button>
                {clip.audioLink && (
                    <>
                        <Button size="small" disabled={locked} onClick={() => apply(true)}>
                            解除声音跟随
                        </Button>
                        <Button
                            size="small"
                            onClick={() => {
                                const parent = project.clips.find((item) => item.id === clip.audioLink!.sourceClipId);
                                if (parent) {
                                    selectClip(parent.id);
                                    seekTransportMs(parent.startMs);
                                }
                            }}
                        >
                            定位关联镜头
                        </Button>
                    </>
                )}
            </div>
            {error && (
                <p role="alert" className="text-[var(--status-error)]">
                    {error}
                </p>
            )}
        </section>
    );
}
