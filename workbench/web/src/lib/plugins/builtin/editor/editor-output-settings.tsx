import { useEffect, useState } from "react";
import { Button, InputNumber, Select } from "antd";
import { useEditorHostContext, useEditorStoreContext } from "@/components/editor/editor-context";
import { timelineOutputFormat } from "@/lib/timeline/timeline-output";
import type { TimelineOutput } from "@/types/timeline";

export function EditorOutputSettings() {
    const { project, dispatch, editingBlocked, inPreview, setPanelDraftDirty } = useEditorStoreContext();
    const host = useEditorHostContext();
    const current = timelineOutputFormat(host.aspectRatio, project?.output),
        key = JSON.stringify(current);
    const [draft, setDraft] = useState<TimelineOutput>(current),
        [error, setError] = useState("");
    const dirty = JSON.stringify(draft) !== key;
    useEffect(() => {
        setDraft(JSON.parse(key));
        setError("");
    }, [key]);
    useEffect(() => {
        setPanelDraftDirty("output-settings", dirty);
        return () => setPanelDraftDirty("output-settings", false);
    }, [dirty, setPanelDraftDirty]);
    if (!project) return null;
    const change = (patch: Partial<TimelineOutput>) => {
        setDraft((value) => ({ ...value, ...patch }));
        setError("");
    };
    const blocked = editingBlocked || inPreview;
    const ratios = [
        { value: "16:9", label: "横屏 16:9", w: 16, h: 9 },
        { value: "9:16", label: "竖屏 9:16", w: 9, h: 16 },
        { value: "1:1", label: "方形 1:1", w: 1, h: 1 },
        { value: "4:3", label: "横屏 4:3", w: 4, h: 3 },
        { value: "3:4", label: "竖屏 3:4", w: 3, h: 4 },
    ];
    const selectedRatio = ratios.find((ratio) => draft.width * ratio.h === draft.height * ratio.w)?.value || "custom";
    return (
        <details className="mb-3" aria-label="成片画面设置">
            <summary className="cursor-pointer text-xs">画幅与画面适配</summary>
            <section className="mt-2 flex flex-col gap-2">
                <p className="text-xs text-[var(--previs-dock-fg)]/70">先选横屏或竖屏，再看预览。设置会随剪辑保存，可撤销。</p>
                <Select
                    aria-label="成片画幅预设"
                    value={selectedRatio}
                    disabled={blocked}
                    onChange={(ratio) => {
                        if (ratio === "custom") return;
                        const next = timelineOutputFormat(ratio);
                        change({ width: next.width, height: next.height });
                    }}
                    options={[...ratios, ...(selectedRatio === "custom" ? [{ value: "custom", label: `自定义 ${draft.width}×${draft.height}` }] : [])]}
                />
                <Select
                    aria-label="成片画面适配"
                    disabled={blocked}
                    value={draft.fit || "letterbox"}
                    onChange={(fit) => change({ fit })}
                    options={[
                        { value: "letterbox", label: "完整显示 · 可能留黑边" },
                        { value: "crop", label: "铺满画面 · 会裁掉边缘" },
                        { value: "blur", label: "完整显示 · 模糊背景填边" },
                    ]}
                />
                <details>
                    <summary className="cursor-pointer text-xs">尺寸和帧率</summary>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {(["width", "height", "fps"] as const).map((field) => (
                            <label key={field} className="flex flex-col gap-1 text-xs">
                                {{ width: "宽度", height: "高度", fps: "帧率" }[field]}
                                <InputNumber
                                    aria-label={`成片${{ width: "宽度", height: "高度", fps: "帧率" }[field]}`}
                                    value={draft[field]}
                                    disabled={blocked}
                                    min={field === "fps" ? 12 : 64}
                                    max={field === "fps" ? 60 : 4096}
                                    step={field === "fps" ? 1 : 2}
                                    precision={0}
                                    onChange={(value) => {
                                        if (value != null) change({ [field]: value });
                                    }}
                                />
                            </label>
                        ))}
                    </div>
                </details>
                <div className="flex flex-wrap gap-2">
                    <Button
                        size="small"
                        disabled={!dirty || blocked}
                        onClick={() => {
                            try {
                                const output = timelineOutputFormat(undefined, draft);
                                dispatch({ op: "setOutput", payload: { output } });
                            } catch (cause) {
                                setError(cause instanceof Error ? cause.message : "画面设置无效");
                            }
                        }}
                    >
                        应用画面设置
                    </Button>
                    {dirty && (
                        <Button
                            size="small"
                            onClick={() => {
                                setDraft(current);
                                setError("");
                            }}
                        >
                            放弃修改
                        </Button>
                    )}
                </div>
                {error && (
                    <p role="alert" className="text-xs text-[var(--previs-danger)]">
                        {error}
                    </p>
                )}
            </section>
        </details>
    );
}
