import { useRef, useState } from "react";
import { Button, ColorPicker, InputNumber, Select } from "antd";
import { useEditorStoreContext } from "@/components/editor/editor-context";
import { captionPresentation, defaultCaptionPresentation, markCaptionHighlight } from "@/lib/timeline/caption-presentation";
import type { CaptionPresentation, CaptionPresentationHighlight, TimelineClip } from "@/types/timeline";

export function EditorCaptionAppearance({ clip }: { clip: TimelineClip }) {
    const { dispatch } = useEditorStoreContext();
    const [error, setError] = useState("");
    const selection = useRef<HTMLTextAreaElement>(null);
    const range = useRef<{ text: string; start: number; end: number } | undefined>(undefined);
    let appearance: CaptionPresentation;
    try {
        appearance = captionPresentation(clip);
    } catch {
        return (
            <section className="mt-3 flex flex-col gap-2">
                <p role="alert">此片段的字幕外观无效，请恢复默认后重新设置。</p>
                <Button onClick={() => dispatch({ op: "setClipProperty", payload: { id: clip.id, patch: { captionPresentation: defaultCaptionPresentation() } } })}>恢复默认字幕外观</Button>
            </section>
        );
    }
    const commit = (value: CaptionPresentation) => {
        setError("");
        try {
            dispatch({ op: "setClipProperty", payload: { id: clip.id, patch: { captionPresentation: value } } });
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "字幕外观未保存");
        }
    };
    const change = (patch: Partial<CaptionPresentation>) => commit({ ...appearance, ...patch });
    const highlight = (index: number, patch: Partial<CaptionPresentationHighlight>) => change({ highlights: appearance.highlights?.map((value, at) => (at === index ? { ...value, ...patch } : value)) });
    return (
        <section aria-label="字幕外观" className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs">
                {clip.kind === "subtitle" ? "字幕文本" : "文字内容"}
                <textarea
                    ref={selection}
                    aria-label={clip.kind === "subtitle" ? "字幕文本" : "文字内容"}
                    maxLength={2000}
                    value={clip.text ?? ""}
                    onChange={(event) => {
                        range.current = undefined;
                        setError("");
                        dispatch({ op: "setClipProperty", payload: { id: clip.id, patch: { text: event.target.value } } });
                    }}
                    onSelect={(event) => {
                        const area = event.currentTarget;
                        range.current = { text: area.value, start: area.selectionStart, end: area.selectionEnd };
                    }}
                    className="min-h-16 w-full rounded-md border border-[var(--previs-sequencer-border)] bg-[var(--previs-sequencer-surface-raised)] p-2 text-sm"
                />
            </label>
            <strong className="text-xs">字幕外观</strong>
            {!clip.captionPresentation && (clip.subtitleStyle || clip.captionOrigin?.subtitleStyle) && <p className="text-xs text-[var(--previs-dock-fg)]/70">原画布样式已按成片换算，请预览核对字号和边距。原始设置仍保留。</p>}
            <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs">
                    字号
                    <InputNumber
                        aria-label="字幕字号"
                        min={12}
                        max={144}
                        value={appearance.fontSize}
                        onChange={(value) => {
                            if (value !== null) change({ fontSize: value });
                        }}
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                    位置
                    <Select
                        aria-label="字幕位置"
                        value={appearance.position}
                        className="min-w-24"
                        options={[
                            { value: "top", label: "上方" },
                            { value: "center", label: "居中" },
                            { value: "bottom", label: "下方" },
                        ]}
                        onChange={(position) => change({ position })}
                    />
                </label>
                <ColorPicker value={appearance.color} onChangeComplete={(color) => change({ color: color.toHexString() })}>
                    <Button size="small" aria-label="选择字幕颜色">
                        文字颜色
                    </Button>
                </ColorPicker>
                <ColorPicker value={appearance.backgroundColor} onChangeComplete={(color) => change({ backgroundColor: color.toHexString() })}>
                    <Button size="small" aria-label="选择字幕底色">
                        字幕底色
                    </Button>
                </ColorPicker>
            </div>
            <details>
                <summary className="cursor-pointer text-xs">标记重点文字</summary>
                <div className="mt-2 flex flex-col gap-2">
                    <p className="text-xs text-[var(--previs-dock-fg)]/70">在上面的台词中选中文字，再点击标记。重叠范围会替换；修改台词会清除当前重点，原版本仍保留。</p>
                    <Button
                        size="small"
                        aria-label="标记所选字幕重点"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                            const selected = range.current;
                            if (!selected || selected.start === selected.end || selected.text !== clip.text) {
                                setError("请先选中当前台词中要强调的文字");
                                return;
                            }
                            try {
                                commit(markCaptionHighlight(clip, selected.start, selected.end));
                            } catch (cause) {
                                setError(cause instanceof Error ? cause.message : "重点范围无效");
                            }
                        }}
                    >
                        标记所选文字
                    </Button>
                    {appearance.highlights?.map((row, index) => (
                        <div key={`${row.start}:${row.end}`} className="flex flex-col gap-2 border-t border-[var(--previs-sequencer-border)] pt-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs">{(clip.text ?? "").slice(row.start, row.end)}</span>
                                <Select
                                    aria-label={`字幕重点${index + 1}动画`}
                                    size="small"
                                    value={row.animation}
                                    options={[
                                        { value: "none", label: "静态" },
                                        { value: "pop", label: "轻弹出" },
                                        { value: "wipe", label: "逐步显示" },
                                    ]}
                                    onChange={(animation) => highlight(index, { animation })}
                                />
                                <Button size="small" aria-label={`移除字幕重点${index + 1}`} onClick={() => change({ highlights: appearance.highlights?.filter((_, at) => at !== index) })}>
                                    移除
                                </Button>
                            </div>
                            <details>
                                <summary className="cursor-pointer text-xs">重点颜色和间距</summary>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <ColorPicker value={row.color} onChangeComplete={(color) => highlight(index, { color: color.toHexString() })}>
                                        <Button size="small" aria-label={`选择字幕重点${index + 1}文字颜色`}>
                                            文字颜色
                                        </Button>
                                    </ColorPicker>
                                    <ColorPicker value={row.backgroundColor} onChangeComplete={(color) => highlight(index, { backgroundColor: color.toHexString() })}>
                                        <Button size="small" aria-label={`选择字幕重点${index + 1}底色`}>
                                            底色
                                        </Button>
                                    </ColorPicker>
                                    {(["paddingX", "paddingY", "radius"] as const).map((key) => (
                                        <label key={key} className="flex flex-col gap-1 text-xs">
                                            {{ paddingX: "左右留白", paddingY: "上下留白", radius: "圆角" }[key]}
                                            <InputNumber
                                                aria-label={`字幕重点${index + 1}${{ paddingX: "左右留白", paddingY: "上下留白", radius: "圆角" }[key]}`}
                                                size="small"
                                                min={0}
                                                max={72}
                                                value={row[key]}
                                                onChange={(value) => {
                                                    if (value !== null) highlight(index, { [key]: value });
                                                }}
                                            />
                                        </label>
                                    ))}
                                </div>
                            </details>
                        </div>
                    ))}
                </div>
            </details>
            <details>
                <summary className="cursor-pointer text-xs">字幕高级设置</summary>
                <div className="mt-2 flex flex-wrap gap-2">
                    <label className="flex flex-col gap-1 text-xs">
                        底色留白
                        <InputNumber
                            aria-label="字幕底色留白"
                            min={0}
                            max={72}
                            value={appearance.padding}
                            onChange={(value) => {
                                if (value !== null) change({ padding: value });
                            }}
                        />
                    </label>
                    <Button size="small" onClick={() => commit(defaultCaptionPresentation())}>
                        恢复默认外观
                    </Button>
                </div>
                <p className="mt-2 text-xs text-[var(--previs-dock-fg)]/70">字号与间距按成片短边1080像素换算，横竖版可复用。外观修改支持撤销。</p>
            </details>
            {error && (
                <p role="alert" className="text-xs text-[var(--previs-danger)]">
                    {error}
                </p>
            )}
        </section>
    );
}
