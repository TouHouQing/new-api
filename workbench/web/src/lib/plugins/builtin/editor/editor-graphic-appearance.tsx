import { Button, ColorPicker, Input, InputNumber, Select } from "antd";
import { useEffect, useState } from "react";
import { useEditorStoreContext, useEditorHostContext } from "@/components/editor/editor-context";
import type { TimelineClip, TimelineMotionGraphic } from "@/types/timeline";

export function EditorGraphicAppearance({ clip }: { clip: TimelineClip }) {
    const { dispatch, project, editingBlocked, inPreview, setPanelDraftDirty } = useEditorStoreContext(),
        g = clip.graphic;
    const host = useEditorHostContext();
    const [text, setText] = useState(clip.text || "");
    useEffect(() => setText(clip.text || ""), [clip.text]);
    useEffect(() => {
        setPanelDraftDirty(`graphic-text:${clip.id}`, text !== (clip.text || ""));
        return () => setPanelDraftDirty(`graphic-text:${clip.id}`, false);
    }, [text, clip.id, clip.text, setPanelDraftDirty]);
    if (!g) return null;
    const change = (patch: Partial<TimelineMotionGraphic>) => dispatch({ op: "setGraphic", payload: { id: clip.id, graphic: { ...g, ...patch } } });
    const disabled = editingBlocked || inPreview || !!project?.tracks.find((track) => track.id === clip.trackId)?.locked;
    const images = host.assets.filter((asset) => asset.mediaType === "image" && asset.storageKey?.startsWith("resource:")).map((asset) => ({ value: asset.storageKey!.slice("resource:".length), label: asset.title }));
    if (g.kind === "image" && g.resourceId && !images.some((image) => image.value === g.resourceId)) images.unshift({ value: g.resourceId, label: "当前叠层图片" });
    const advanced = (g.phaseOffsetMs || 0) + (clip.sourceStartMs || 0) > 0;
    return (
        <section aria-label="标题与图形外观" className="mt-3 flex flex-col gap-3">
            <strong className="text-xs">{g.kind === "text" ? "标题文字与外观" : "图形叠层"}</strong>
            <Input.TextArea aria-label="叠层文字或名称" value={text} maxLength={2000} rows={3} disabled={disabled} onChange={(event) => setText(event.target.value)} />
            {text !== (clip.text || "") && (
                <div className="flex gap-2">
                    <Button
                        size="small"
                        disabled={disabled || (g.kind === "text" && !text)}
                        onClick={() => {
                            dispatch({ op: "setClipProperty", payload: { id: clip.id, patch: { text } } });
                        }}
                    >
                        应用文字
                    </Button>
                    <Button size="small" disabled={disabled} onClick={() => setText(clip.text || "")}>
                        放弃文字修改
                    </Button>
                </div>
            )}
            {g.kind === "image" && (
                <label className="flex flex-col gap-1 text-xs">
                    替换叠层图片
                    <Select aria-label="替换叠层图片" value={g.resourceId} disabled={disabled} showSearch optionFilterProp="label" onChange={(resourceId) => change({ resourceId })} options={images} />
                </label>
            )}
            <div className="flex flex-wrap gap-2">
                {(["x", "y"] as const).map((axis) => (
                    <label key={axis} className="flex flex-col gap-1 text-xs">
                        {axis === "x" ? "左右位置（%）" : "上下位置（%）"}
                        <InputNumber
                            aria-label={axis === "x" ? "叠层左右位置" : "叠层上下位置"}
                            min={0}
                            max={100}
                            step={1}
                            value={Math.round(g[axis] * 10000) / 100}
                            disabled={disabled}
                            onChange={(value) => {
                                if (value != null) change({ [axis]: value / 100 });
                            }}
                        />
                    </label>
                ))}
            </div>
            <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs">
                    {g.kind === "text" ? "字号（像素）" : "大小（像素）"}
                    <InputNumber
                        aria-label="叠层大小"
                        min={12}
                        max={300}
                        precision={0}
                        value={g.size}
                        disabled={disabled}
                        onChange={(value) => {
                            if (value != null) change({ size: value });
                        }}
                    />
                </label>
                {g.kind !== "image" && (
                    <ColorPicker disabledAlpha value={g.color} disabled={disabled} onChangeComplete={(color) => change({ color: color.toHexString() })}>
                        <Button size="small" aria-label="选择叠层颜色">
                            颜色
                        </Button>
                    </ColorPicker>
                )}
            </div>
            {g.kind === "text" && (
                <Select
                    aria-label="叠层字体"
                    value={g.fontFamily || "sans"}
                    disabled={disabled}
                    onChange={(fontFamily) => change({ fontFamily })}
                    options={[
                        { value: "sans", label: "黑体" },
                        { value: "serif", label: "宋体与衬线" },
                    ]}
                />
            )}
            {g.kind === "icon" && (
                <Select
                    aria-label="叠层图标"
                    value={g.icon || "spark"}
                    disabled={disabled}
                    onChange={(icon) => change({ icon })}
                    options={[
                        { value: "spark", label: "星光" },
                        { value: "play", label: "播放" },
                        { value: "heart", label: "爱心" },
                        { value: "check", label: "完成" },
                        { value: "arrow", label: "箭头" },
                    ]}
                />
            )}
            {g.kind === "shape" && (
                <Select
                    aria-label="叠层形状"
                    value={g.shape || "square"}
                    disabled={disabled}
                    onChange={(shape) => change({ shape })}
                    options={[
                        { value: "square", label: "方形" },
                        { value: "circle", label: "圆形" },
                    ]}
                />
            )}
            <label className="flex flex-col gap-1 text-xs">
                动画
                <Select
                    aria-label="叠层动画"
                    value={g.animation}
                    disabled={disabled}
                    onChange={(animation) => change({ animation })}
                    options={[
                        { value: "none", label: "静态显示" },
                        { value: "fade", label: "淡入淡出" },
                        { value: "slide", label: "滑入" },
                        { value: "pulse", label: "呼吸" },
                        { value: "bounce", label: "弹跳" },
                        { value: "rotate", label: "旋转" },
                        ...(g.kind === "shape" ? [{ value: "morph", label: "方圆变形" }] : []),
                    ]}
                />
            </label>
            {["pulse", "bounce", "rotate", "morph"].includes(g.animation) && (
                <label className="flex flex-col gap-1 text-xs">
                    动作节奏
                    <InputNumber
                        aria-label="叠层动画节奏"
                        min={30}
                        max={240}
                        precision={0}
                        value={g.bpm}
                        disabled={disabled}
                        onChange={(value) => {
                            if (value != null) change({ bpm: value });
                        }}
                    />
                </label>
            )}
            <details>
                <summary className="cursor-pointer text-xs">动画时间</summary>
                <div className="mt-2 flex flex-col gap-2">
                    <label className="flex flex-col gap-1 text-xs">
                        动画长度（秒）
                        <InputNumber
                            aria-label="叠层动画长度"
                            min={0.001}
                            max={3600}
                            precision={3}
                            value={g.phaseDurationMs / 1000}
                            disabled={disabled}
                            onChange={(value) => {
                                if (value != null) change({ phaseDurationMs: Math.round(value * 1000) });
                            }}
                        />
                    </label>
                    <p className="text-xs text-muted-foreground">{advanced ? "此片段延续原来的动画，拆分和移动会保留原节奏。" : "动画按片段的时间播放。"}</p>
                    <Button size="small" disabled={disabled} onClick={() => dispatch({ op: "setGraphic", payload: { id: clip.id, graphic: g, restart: true } })}>
                        让动画重新覆盖整个片段
                    </Button>
                </div>
            </details>
        </section>
    );
}
