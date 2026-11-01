import { useEffect, useMemo, useRef, useState } from "react";
import { useEditorHostContext, useEditorStoreContext } from "@/components/editor/editor-context";
import { getActiveUserScope } from "@/lib/user-scope";
import { previewProjectCaptions, type CaptionPreview, type CaptionPreviewClip } from "@/services/api/caption-preview";
import type { TimelineClip, TimelineOutput } from "@/types/timeline";
import { timelineOverlayRanks } from "@/lib/timeline/timeline-overlay-order";

export function EditorNativeCaptions({ clips, playbackMs }: { clips: TimelineClip[]; playbackMs: number }) {
    const { project } = useEditorStoreContext();
    const host = useEditorHostContext(),
        scope = getActiveUserScope(),
        owner = `${scope}:${host.projectId}`;
    const serialized = useMemo(
        () =>
            JSON.stringify({
                output: project?.output,
                aspectRatio: host.aspectRatio ?? "16:9",
                clips: clips
                    .filter((clip) => (clip.kind === "subtitle" || clip.kind === "text") && clip.text?.trim())
                    .map((clip) => ({
                        id: clip.id,
                        kind: clip.kind,
                        text: clip.text,
                        startMs: clip.startMs,
                        durationMs: clip.durationMs,
                        captionPresentation: clip.captionPresentation,
                        subtitleEntryIndex: clip.subtitleEntryIndex,
                        subtitleStyle: clip.subtitleStyle,
                        subtitleHighlights: clip.subtitleHighlights,
                        captionOrigin: clip.captionOrigin ? { entryIndex: clip.captionOrigin.entryIndex, subtitleStyle: clip.captionOrigin.subtitleStyle, subtitleHighlights: clip.captionOrigin.subtitleHighlights } : undefined,
                    })),
            }),
        [host.aspectRatio, clips, project?.output],
    );
    const input = useMemo(() => JSON.parse(serialized) as { aspectRatio: string; clips: CaptionPreviewClip[]; output?: TimelineOutput }, [serialized]);
    const [record, setRecord] = useState<{ owner: string; key: string; preview?: CaptionPreview; error?: string }>();
    const [retry, setRetry] = useState(0),
        activeOwner = useRef(owner);
    activeOwner.current = owner;
    useEffect(() => {
        const controller = new AbortController();
        if (!input.clips.length) return () => controller.abort();
        const timer = setTimeout(() => {
            void previewProjectCaptions(host.projectId, input.clips, input.aspectRatio, controller.signal, input.output)
                .then((preview) => {
                    if (!controller.signal.aborted && activeOwner.current === owner && getActiveUserScope() === scope) setRecord({ owner, key: serialized, preview });
                })
                .catch((cause) => {
                    if (!controller.signal.aborted && activeOwner.current === owner && getActiveUserScope() === scope) setRecord({ owner, key: serialized, error: cause instanceof Error ? cause.message : "字幕预览未完成" });
                });
        }, 300);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [host.projectId, scope, owner, serialized, input, retry]);
    if (!input.clips.length) return null;
    const current = record?.owner === owner && record.key === serialized ? record : undefined;
    const preview = current?.preview;
    const ranks = timelineOverlayRanks(project);
    const visible = preview?.layers.filter((layer) => playbackMs >= layer.startMs && playbackMs < layer.endMs) ?? [];
    return (
        <div className="pointer-events-none absolute inset-0" aria-label="原生字幕预览">
            {!preview && (
                <div role="status" className="absolute left-2 top-2 max-w-[calc(100%-1rem)] rounded-md bg-[var(--previs-sequencer-surface)] px-2 py-1 text-xs text-[var(--previs-dock-fg)]">
                    {current?.error ? (
                        <>
                            {current.error}{" "}
                            <button
                                type="button"
                                className="pointer-events-auto underline"
                                aria-label="重试字幕预览"
                                onClick={() => {
                                    setRecord(undefined);
                                    setRetry((value) => value + 1);
                                }}
                            >
                                重试
                            </button>
                        </>
                    ) : (
                        "更新字幕预览…"
                    )}
                </div>
            )}
            {preview &&
                visible.map((layer, index) => {
                    const progress = Math.min(1, Math.max(0, (playbackMs - layer.startMs) / 180));
                    return (
                        <img
                            key={`${owner}:${index}`}
                            src={layer.image}
                            alt=""
                            draggable={false}
                            data-caption-preview-layer="true"
                            style={{
                                position: "absolute",
                                zIndex: ranks.get(layer.clipId),
                                left: `${(layer.x / preview.width) * 100}%`,
                                top: `${(layer.y / preview.height) * 100}%`,
                                width: `${(layer.width / preview.width) * 100}%`,
                                height: `${(layer.height / preview.height) * 100}%`,
                                maxWidth: "none",
                                transform: layer.animation === "pop" ? `scale(${0.8 + 0.2 * progress})` : undefined,
                                transformOrigin: "center",
                                clipPath: layer.animation === "wipe" ? `inset(0 ${(1 - progress) * 100}% 0 0)` : undefined,
                            }}
                        />
                    );
                })}
            <span className="sr-only">
                {input.clips
                    .filter((clip) => playbackMs >= clip.startMs && playbackMs < clip.startMs + clip.durationMs)
                    .map((clip) => clip.text)
                    .join("；")}
            </span>
        </div>
    );
}
