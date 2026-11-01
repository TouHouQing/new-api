// 读取选中片段（store.selectedClipId），属性编辑经 setClipProperty 命令入队
// 并进入统一撤销历史；检查器不直接修改 project，避免绕过命令校验和持久化。

import { useEffect, useState } from "react";
import { Button } from "antd";

import { useEditorStoreContext } from "@/components/editor/editor-context";
import { formatTimelineTime } from "@/lib/timeline/timeline-view";
import { clipPlaybackRate } from "@/lib/timeline/timeline-speed";
import type { TimelineClip } from "@/types/timeline";
import { EditorAudioLink } from "./editor-audio-link";
import { EditorCaptionLink } from "./editor-caption-link";
import { EditorCaptionAppearance } from "./editor-caption-appearance";
import { EditorGraphicAppearance } from "./editor-graphic-appearance";
import { EditorReframeSource } from "./editor-reframe-source";

export function EditorInspector() {
    const { project, selectedClipId, dispatch, selectClip, seekTransportMs } = useEditorStoreContext();
    const clip = project?.clips.find((c) => c.id === selectedClipId) ?? null;

    if (!clip) {
        return (
            <div className="flex h-full flex-col bg-[var(--previs-sequencer-surface)]">
                <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
                    <p className="text-xs text-[var(--previs-dock-fg)]/60">未选中片段</p>
                    <p className="max-w-[180px] text-[var(--fs-label)] leading-relaxed text-[var(--previs-dock-fg)]/45">在时间线中点击片段后，可在此编辑属性</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col bg-[var(--previs-sequencer-surface)]">
            <div className="director-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
                <SectionTitle>片段</SectionTitle>
                <ClipSummary clip={clip} />
                {clip.reframe && (
                    <>
                        <SectionTitle>跟随构图</SectionTitle>
                        <EditorReframeSource key={clip.id} clip={clip} />
                    </>
                )}
                <SectionTitle>基本</SectionTitle>
                <PropertyField label="名称" value={clip.title ?? clip.nodeId ?? clip.id} onChange={(value) => dispatch({ op: "setClipProperty", payload: { id: clip.id, patch: { title: value } } })} />
                {clip.kind === "audio" && (
                    <PropertyField
                        label="音量"
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={clip.volume ?? 1}
                        formatValue={(v) => `${Math.round(v * 100)}%`}
                        onChange={(value) => dispatch({ op: "setClipProperty", payload: { id: clip.id, patch: { volume: Number(value) } } })}
                    />
                )}
                {clip.kind === "audio" && <EditorAudioLink key={clip.id} clip={clip} />}
                {clip.graphic ? <EditorGraphicAppearance key={`graphic:${clip.id}`} clip={clip} /> : (clip.kind === "subtitle" || clip.kind === "text") && <EditorCaptionAppearance key={`caption-appearance:${clip.id}`} clip={clip} />}
                {clip.kind === "subtitle" && !clip.productionBinding?.sourceClipId && <EditorCaptionLink key={clip.id} clip={clip} />}
                {clip.kind === "subtitle" && clip.productionBinding?.sourceClipId && (
                    <p className="mt-3 text-xs text-[var(--previs-dock-fg)]/70">
                        此字幕跟随关联片段。裁剪或拆分会保留文字，请核对显示内容。
                        <Button
                            size="small"
                            onClick={() => {
                                const parent = project?.clips.find((item) => item.id === clip.productionBinding!.sourceClipId);
                                if (parent) {
                                    selectClip(parent.id);
                                    seekTransportMs(parent.startMs);
                                }
                            }}
                        >
                            定位字幕来源
                        </Button>
                    </p>
                )}
                {clip.kind === "video" && project?.clips.some((item) => item.audioLink?.sourceClipId === clip.id) && <p className="mt-3 text-xs text-[var(--previs-dock-fg)]/70">此镜头的跟随声音会一起移动、裁剪和拆分。变速按各声音选择的方式处理。</p>}
                {(clip.kind === "video" || clip.kind === "audio") && (
                    <>
                        <SectionTitle>片段速度</SectionTitle>
                        <label className="mb-2 block text-xs text-[var(--previs-dock-fg)]">
                            播放速度
                            <select
                                aria-label="片段播放速度"
                                value={clipPlaybackRate(clip)}
                                onChange={(event) => dispatch({ op: "setClipPlaybackRate", payload: { id: clip.id, playbackRate: Number(event.target.value) } })}
                                className="mt-1 w-full rounded-md border border-[var(--previs-sequencer-border)] bg-[var(--previs-sequencer-surface-raised)] p-2"
                            >
                                {Array.from(new Set([0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, clipPlaybackRate(clip)]))
                                    .sort((a, b) => a - b)
                                    .map((rate) => (
                                        <option key={rate} value={rate}>
                                            {rate} 倍{rate === 1 ? "（原速）" : ""}
                                        </option>
                                    ))}
                            </select>
                        </label>
                        <p className="text-[11px] leading-relaxed text-[var(--previs-dock-fg)]/60">保留源素材范围，关联字幕与跟随声音按设置调整。其他片段位置保留；变慢后请检查重叠处。可撤销。</p>
                        <SectionTitle>转场</SectionTitle>
                        <PropertyField
                            label="淡入"
                            type="range"
                            min={0}
                            max={Math.min(2000, clip.durationMs)}
                            step={50}
                            value={clip.fadeInMs ?? 0}
                            formatValue={(v) => `${(v / 1000).toFixed(1)}s`}
                            onChange={(value) => dispatch({ op: "setClipProperty", payload: { id: clip.id, patch: { fadeInMs: Number(value) } } })}
                        />
                        <PropertyField
                            label="淡出"
                            type="range"
                            min={0}
                            max={Math.min(2000, clip.durationMs)}
                            step={50}
                            value={clip.fadeOutMs ?? 0}
                            formatValue={(v) => `${(v / 1000).toFixed(1)}s`}
                            onChange={(value) => dispatch({ op: "setClipProperty", payload: { id: clip.id, patch: { fadeOutMs: Number(value) } } })}
                        />
                    </>
                )}
            </div>
            <div className="shrink-0 border-t border-[var(--previs-sequencer-border)] p-2">
                <button type="button" onClick={() => selectClip(null)} className="w-full rounded-md border border-[var(--previs-sequencer-border)] py-2 text-xs text-[var(--previs-dock-fg)] hover:bg-[var(--previs-control-hover)]">
                    清除选中
                </button>
            </div>
        </div>
    );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return <h3 className="mb-2 mt-4 text-[var(--fs-label)] font-medium uppercase tracking-wider text-[var(--previs-dock-fg)]/45 first:mt-0">{children}</h3>;
}

function ClipSummary({ clip }: { clip: TimelineClip }) {
    const kindLabel: Record<TimelineClip["kind"], string> = {
        video: "视频",
        audio: "音频",
        subtitle: "字幕",
        text: "文本",
        image: "图片",
    };
    return (
        <div>
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--previs-dock-fg-strong)]">{kindLabel[clip.kind] ?? clip.kind}</span>
                <span className="font-mono text-[var(--fs-label)] text-[var(--previs-dock-fg)]/40">#{clip.id.slice(-6)}</span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[var(--fs-label)]">
                <div className="flex items-baseline justify-between gap-2">
                    <dt className="shrink-0 text-[var(--previs-dock-fg)]/45">起点</dt>
                    <dd className="tabular-nums text-[var(--previs-dock-fg)]/80">{formatTimelineTime(clip.startMs)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                    <dt className="shrink-0 text-[var(--previs-dock-fg)]/45">时长</dt>
                    <dd className="tabular-nums text-[var(--previs-dock-fg)]/80">{formatTimelineTime(clip.durationMs)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                    <dt className="shrink-0 text-[var(--previs-dock-fg)]/45">源起点</dt>
                    <dd className="tabular-nums text-[var(--previs-dock-fg)]/80">{formatTimelineTime(clip.sourceStartMs ?? 0)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                    <dt className="shrink-0 text-[var(--previs-dock-fg)]/45">结束</dt>
                    <dd className="tabular-nums text-[var(--previs-dock-fg)]/80">{formatTimelineTime(clip.startMs + clip.durationMs)}</dd>
                </div>
            </dl>
        </div>
    );
}

function PropertyField({
    label,
    value,
    onChange,
    type = "text",
    min,
    max,
    step,
    formatValue,
}: {
    label: string;
    value: string | number;
    onChange: (value: string) => void;
    type?: "text" | "range";
    min?: number;
    max?: number;
    step?: number;
    formatValue?: (value: number) => string;
}) {
    const [localValue, setLocalValue] = useState<string>(String(value));
    useEffect(() => setLocalValue(String(value)), [value]);

    const displayValue = type === "range" && formatValue ? formatValue(Number(localValue)) : localValue;

    return (
        <div className="mb-3">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-[var(--fs-label)] text-[var(--previs-dock-fg)]/70">{label}</span>
                {type === "range" && <span className="tabular-nums text-[var(--fs-label)] text-[var(--previs-dock-fg)]/50">{displayValue}</span>}
            </div>
            {type === "range" ? (
                <input
                    type="range"
                    aria-label={label}
                    min={min}
                    max={max}
                    step={step}
                    value={Number(localValue)}
                    onChange={(e) => {
                        setLocalValue(e.target.value);
                        onChange(e.target.value);
                    }}
                    className="editor-slider"
                />
            ) : (
                <input
                    type="text"
                    aria-label={label}
                    value={localValue}
                    onChange={(e) => setLocalValue(e.target.value)}
                    onBlur={() => {
                        if (localValue !== String(value)) onChange(localValue);
                    }}
                    className="h-7 w-full rounded-md border border-[var(--previs-sequencer-border)] bg-[var(--previs-sequencer-surface-raised)] px-2 text-xs text-[var(--previs-dock-fg-strong)] outline-none transition-colors focus:border-[var(--previs-dock-fg-strong)]/40"
                />
            )}
        </div>
    );
}
