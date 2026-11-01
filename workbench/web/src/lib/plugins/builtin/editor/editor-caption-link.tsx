import { useEffect, useState } from "react";
import { Button } from "antd";
import { useEditorStoreContext } from "@/components/editor/editor-context";
import { setTimelineCaptionLink } from "@/lib/timeline/timeline-caption-links";
import { formatTimelineTime } from "@/lib/timeline/timeline-view";
import type { TimelineClip } from "@/types/timeline";

export function EditorCaptionLink({ clip }: { clip: TimelineClip }) {
    const { project, dispatch, selectClip, seekTransportMs } = useEditorStoreContext();
    const [source, setSource] = useState(clip.captionLink?.sourceClipId ?? "");
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        if (clip.captionLink) setSource(clip.captionLink.sourceClipId);
        setError(null);
    }, [clip.id, clip.captionLink?.sourceClipId]);
    useEffect(() => {
        if (source && !project?.clips.some((item) => item.id === source && ["video", "audio"].includes(item.kind))) setSource("");
    }, [project, source]);
    if (!project) return null;
    const locked = !!project.tracks.find((track) => track.id === clip.trackId)?.locked;
    const apply = (detach = false) => {
        const payload = { id: clip.id, ...(!detach ? { sourceClipId: source } : {}) };
        try {
            setTimelineCaptionLink(project, payload);
            dispatch({ op: "setCaptionLink", payload });
            setError(null);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "字幕跟随设置失败，请重新检查");
        }
    };
    return (
        <section className="mt-4 space-y-2 text-xs text-[var(--previs-dock-fg)]" aria-label="字幕跟随来源">
            <h3 className="font-medium">字幕跟随来源</h3>
            <p className="opacity-70">{clip.captionLink ? "移动、裁剪、拆分或变速来源片段时，字幕一起调整。" : "选择这条字幕对应的镜头或声音，调整素材时自动对齐。"}</p>
            <label className="block">
                来源片段
                <select
                    aria-label="字幕来源片段"
                    className="mt-1 w-full rounded-md border border-[var(--previs-sequencer-border)] bg-[var(--previs-sequencer-surface-raised)] p-2"
                    value={source}
                    disabled={locked}
                    onChange={(event) => {
                        setSource(event.target.value);
                        setError(null);
                    }}
                >
                    <option value="">选择具体镜头或声音</option>
                    {project.clips
                        .filter((item) => ["video", "audio"].includes(item.kind))
                        .map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.title || "未命名素材"} · {formatTimelineTime(item.startMs)} · {item.kind === "video" ? "画面" : "声音"}
                            </option>
                        ))}
                </select>
            </label>
            <p className="text-[11px] leading-relaxed opacity-60">字幕须位于来源片段内。裁剪和拆分保留文字，请核对句意；可撤销。</p>
            {locked && <p>字幕轨已锁定，请先解锁。</p>}
            <div className="flex flex-wrap gap-2">
                <Button size="small" disabled={locked || !source} onClick={() => apply()}>
                    {clip.captionLink ? "更新字幕跟随" : "启用字幕跟随"}
                </Button>
                {clip.captionLink && (
                    <>
                        <Button size="small" disabled={locked} onClick={() => apply(true)}>
                            解除字幕跟随
                        </Button>
                        <Button
                            size="small"
                            onClick={() => {
                                const parent = project.clips.find((item) => item.id === clip.captionLink!.sourceClipId);
                                if (parent) {
                                    selectClip(parent.id);
                                    seekTransportMs(parent.startMs);
                                }
                            }}
                        >
                            定位字幕来源
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
