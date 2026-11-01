import { useEffect, useMemo, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { useEditorHostContext, useEditorStoreContext, useEditorStoreApi } from "@/components/editor/editor-context";
import { getActiveUserScope } from "@/lib/user-scope";
import { timelineOutputFormat } from "@/lib/timeline/timeline-output";
import { sampleTimelineGraphic } from "@/lib/timeline/timeline-graphics";
import { timelineOverlayRanks } from "@/lib/timeline/timeline-overlay-order";
import { previewProjectGraphics, type GraphicPreview, type GraphicPreviewClip } from "@/services/api/graphic-preview";
import type { TimelineClip, TimelineMotionGraphic } from "@/types/timeline";

function GraphicLayer({ clip, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { clip: TimelineClip }) {
    const store = useEditorStoreApi();
    const drag = useRef<{ pointerId: number; target: HTMLButtonElement; left: number; top: number; width: number; height: number; graphic: TimelineMotionGraphic; moved: boolean } | undefined>(undefined);
    const available = () => {
        const state = store.getState();
        return !state.editingBlocked && !state.hasPendingPanelEdits && !state.project?.tracks.find((track) => track.id === clip.trackId)?.locked;
    };
    useEffect(() => {
        const cancel = (event: globalThis.KeyboardEvent) => {
            if (event.key !== "Escape" || !drag.current) return;
            const value = drag.current;
            drag.current = undefined;
            if (value.moved) store.getState().cancelGesture();
            if (value.target.hasPointerCapture(value.pointerId)) value.target.releasePointerCapture(value.pointerId);
            event.preventDefault();
            event.stopPropagation();
        };
        window.addEventListener("keydown", cancel, true);
        return () => {
            window.removeEventListener("keydown", cancel, true);
            if (drag.current?.moved) store.getState().cancelGesture();
        };
    }, [store]);
    const down = (event: PointerEvent<HTMLButtonElement>) => {
        store.getState().selectClip(clip.id);
        if (event.button !== 0 || !available() || store.getState().inPreview || !clip.graphic) return;
        const stage = event.currentTarget.parentElement?.getBoundingClientRect();
        if (!stage?.width || !stage.height) return;
        store.getState().pausePlayback();
        drag.current = { pointerId: event.pointerId, target: event.currentTarget, left: event.clientX, top: event.clientY, width: stage.width, height: stage.height, graphic: clip.graphic, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.stopPropagation();
    };
    const move = (event: PointerEvent<HTMLButtonElement>) => {
        const value = drag.current;
        if (!value || value.pointerId !== event.pointerId) return;
        const dx = event.clientX - value.left,
            dy = event.clientY - value.top;
        if (!value.moved && Math.hypot(dx, dy) < 3) return;
        value.moved = true;
        store.getState().previewGesture({ op: "setGraphic", payload: { id: clip.id, graphic: { ...value.graphic, x: Math.max(0, Math.min(1, value.graphic.x + dx / value.width)), y: Math.max(0, Math.min(1, value.graphic.y + dy / value.height)) } } });
        event.preventDefault();
    };
    const finish = (event: PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
        const value = drag.current;
        if (!value || value.pointerId !== event.pointerId) return;
        drag.current = undefined;
        if (value.moved) {
            if (cancelled) store.getState().cancelGesture();
            else store.getState().commitGesture();
        }
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };
    const key = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === "Escape" && drag.current) {
            const value = drag.current;
            drag.current = undefined;
            if (value.moved) store.getState().cancelGesture();
            if (event.currentTarget.hasPointerCapture(value.pointerId)) event.currentTarget.releasePointerCapture(value.pointerId);
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        if (!clip.graphic || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) || !available() || store.getState().inPreview || event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault();
        event.stopPropagation();
        const step = event.shiftKey ? 0.05 : 0.01,
            g = clip.graphic;
        store.getState().dispatch({
            op: "setGraphic",
            payload: {
                id: clip.id,
                graphic: {
                    ...g,
                    x: Math.max(0, Math.min(1, g.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0))),
                    y: Math.max(0, Math.min(1, g.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0))),
                },
            },
        });
    };
    return (
        <button
            {...props}
            type="button"
            title="拖动调整位置；方向键微调，Shift 加快"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={(event) => finish(event, false)}
            onPointerCancel={(event) => finish(event, true)}
            onLostPointerCapture={(event) => finish(event, true)}
            onKeyDown={key}
        >
            {children}
        </button>
    );
}

export function EditorNativeGraphics({ playbackMs }: { playbackMs: number }) {
    const host = useEditorHostContext(),
        { project, selectClip, selectedClipId } = useEditorStoreContext(),
        scope = getActiveUserScope();
    const owner = `${scope}:${host.projectId}`,
        activeOwner = useRef(owner);
    activeOwner.current = owner;
    // Position, timing and most animations reuse the same raster. The browser
    // samples current clip values so a drag never hides the layer or sends a
    // new preview request for every pointer movement.
    const serialized = useMemo(
        () =>
            JSON.stringify({
                output: timelineOutputFormat(host.aspectRatio, project?.output),
                clips: (project?.clips ?? [])
                    .filter((clip) => clip.graphic && project?.tracks.find((track) => track.id === clip.trackId)?.visible !== false)
                    .map((clip) => ({
                        id: clip.id,
                        kind: clip.kind,
                        text: clip.text,
                        startMs: 0,
                        durationMs: 1,
                        sourceStartMs: 0,
                        graphic: { ...clip.graphic, x: 0.5, y: 0.5, bpm: 120, phaseOffsetMs: 0, phaseDurationMs: 1, animation: clip.graphic!.animation === "morph" ? "morph" : "none" },
                    })),
            }),
        [project, host.aspectRatio],
    );
    const input = useMemo(() => JSON.parse(serialized) as { output: ReturnType<typeof timelineOutputFormat>; clips: GraphicPreviewClip[] }, [serialized]);
    const [record, setRecord] = useState<{ owner: string; key: string; preview?: GraphicPreview; error?: string }>(),
        [retry, setRetry] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        if (!input.clips.length) return () => controller.abort();
        const timer = setTimeout(() => {
            void previewProjectGraphics(host.projectId, input.clips, input.output, controller.signal)
                .then((preview) => {
                    if (!controller.signal.aborted && activeOwner.current === owner && getActiveUserScope() === scope) setRecord({ owner, key: serialized, preview });
                })
                .catch((cause) => {
                    if (!controller.signal.aborted && activeOwner.current === owner && getActiveUserScope() === scope) setRecord({ owner, key: serialized, error: cause instanceof Error ? cause.message : "叠层预览未完成" });
                });
        }, 250);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [input, serialized, host.projectId, owner, scope, retry]);
    if (!input.clips.length) return null;
    const current = record?.owner === owner && record.key === serialized ? record : undefined,
        preview = current?.preview;
    const ranks = timelineOverlayRanks(project);
    return (
        <div className="pointer-events-none absolute inset-0" aria-label="标题与图形叠层预览">
            {!preview && (
                <p role="status" className="absolute left-2 top-2 rounded-md bg-[var(--previs-sequencer-surface)] px-2 py-1 text-xs text-[var(--previs-dock-fg)]">
                    {current?.error ? (
                        <>
                            {current.error}{" "}
                            <button type="button" className="pointer-events-auto underline" onClick={() => setRetry((value) => value + 1)}>
                                重试叠层预览
                            </button>
                        </>
                    ) : (
                        "更新叠层预览…"
                    )}
                </p>
            )}
            {preview?.layers.map((layer) => {
                const clip = project?.clips.find((clip) => clip.id === layer.clipId);
                if (!clip?.graphic) return null;
                const sample = sampleTimelineGraphic(clip.graphic, clip, playbackMs, preview.width, preview.height);
                if (!sample.visible) return null;
                return (
                    <GraphicLayer
                        key={layer.clipId}
                        clip={clip}
                        aria-label={`选择叠层${clip.title || layer.clipId}`}
                        aria-pressed={selectedClipId === layer.clipId}
                        data-graphic-preview-layer={layer.clipId}
                        className="pointer-events-auto absolute touch-none border-0 bg-transparent p-0"
                        onClick={() => selectClip(layer.clipId)}
                        style={{
                            zIndex: ranks.get(clip.id),
                            left: `${(sample.x / preview.width) * 100}%`,
                            top: `${(sample.y / preview.height) * 100}%`,
                            width: `${(layer.width / preview.width) * 100}%`,
                            height: `${(layer.height / preview.height) * 100}%`,
                            transform: `translate(-50%, -50%) rotate(${sample.rotation}deg) scale(${sample.scale})`,
                            transformOrigin: "center",
                            outline: selectedClipId === layer.clipId ? "1px solid var(--workspace-accent)" : undefined,
                        }}
                    >
                        <img src={layer.image} alt="" draggable={false} className="h-full w-full" style={{ opacity: sample.opacity, borderRadius: clip.graphic.animation === "morph" ? `${(sample.radius / clip.graphic.size) * 100}%` : undefined }} />
                    </GraphicLayer>
                );
            })}
        </div>
    );
}
