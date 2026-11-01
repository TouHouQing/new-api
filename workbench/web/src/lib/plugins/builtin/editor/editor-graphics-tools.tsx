import { useEffect, useRef, useState } from "react";
import { Button, Input, InputNumber, Select } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { useEditorHostContext, useEditorStoreApi, useEditorStoreContext } from "@/components/editor/editor-context";
import { timelineOutputFormat } from "@/lib/timeline/timeline-output";
import { validateMotionGraphic } from "@/lib/timeline/timeline-graphics";
import { defaultAssetCategoryForKind } from "@/lib/asset-category";
import { getActiveUserScope } from "@/lib/user-scope";
import { uploadResourceFile } from "@/services/api/resources";
import { linkProjectAsset } from "@/services/api/projects";
import type { TimelineMotionGraphic } from "@/types/timeline";

export function EditorGraphicsTools() {
    const host = useEditorHostContext(),
        store = useEditorStoreApi(),
        { project, selectedClipId, selectClip, seekTransportMs, setPanelDraftDirty, editingBlocked, inPreview } = useEditorStoreContext();
    const [open, setOpen] = useState(false),
        [text, setText] = useState("给故事一个标题"),
        [duration, setDuration] = useState(3),
        [error, setError] = useState(""),
        [uploading, setUploading] = useState(false);
    const [graphic, setGraphic] = useState<TimelineMotionGraphic>({ version: 1, kind: "text", x: 0.5, y: 0.5, size: 64, color: "#ffffff", fontFamily: "sans", animation: "fade", bpm: 120, phaseDurationMs: 3000 });
    const file = useRef<HTMLInputElement>(null),
        scope = getActiveUserScope(),
        owner = `${scope}:${host.projectId}`,
        activeOwner = useRef(owner),
        mounted = useRef(false);
    activeOwner.current = owner;
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const current = (expected: string) => mounted.current && activeOwner.current === expected && getActiveUserScope() === scope;
    useEffect(() => {
        setPanelDraftDirty("graphic-create", open);
        return () => setPanelDraftDirty("graphic-create", false);
    }, [open, setPanelDraftDirty]);
    const enter = () => {
        const output = timelineOutputFormat(host.aspectRatio, project?.output);
        setGraphic({ version: 1, kind: "text", x: 0.5, y: 0.5, size: Math.max(12, Math.min(300, Math.round(Math.min(output.width, output.height) * 0.08))), color: "#ffffff", fontFamily: "sans", animation: "fade", bpm: 120, phaseDurationMs: 3000 });
        setText("给故事一个标题");
        setDuration(3);
        setError("");
        setOpen(true);
    };
    const upload = async (source: File) => {
        if (uploading) return;
        if (source.size > 32 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(source.type)) {
            setError("请选择32MB内的PNG、JPEG或WebP静态图片");
            return;
        }
        setUploading(true);
        setError("");
        const requestedOwner = owner;
        try {
            const resource = await uploadResourceFile(source, "image");
            if (!current(requestedOwner)) return;
            await linkProjectAsset(host.projectId, { assetId: resource.id, category: defaultAssetCategoryForKind("image"), title: source.name });
            if (!current(requestedOwner)) return;
            await host.refreshAssets();
            if (current(requestedOwner)) {
                setGraphic((value) => ({ ...value, resourceId: resource.id }));
                setText(source.name);
            }
        } catch (cause) {
            if (current(requestedOwner)) setError(cause instanceof Error ? cause.message : "图片上传失败，当前设置已保留");
        } finally {
            if (current(requestedOwner)) setUploading(false);
        }
    };
    const create = () => {
        if (!project || uploading || editingBlocked || inPreview) return;
        try {
            const settings = { ...graphic, phaseDurationMs: Math.round(duration * 1000) };
            validateMotionGraphic(settings);
            const id = crypto.randomUUID(),
                startMs = Math.round(store.getState().transportMs);
            store.getState().dispatch({ op: "addGraphic", payload: { id, startMs, durationMs: Math.round(duration * 1000), text, graphic: settings } });
            if (!store.getState().project?.clips.some((clip) => clip.id === id)) throw new Error(store.getState().saveError || "叠层尚未添加，请检查设置");
            setPanelDraftDirty("graphic-create", false);
            selectClip(id);
            seekTransportMs(startMs + Math.min(400, Math.floor((duration * 1000) / 2)));
            setOpen(false);
            host.focusInspector?.();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "叠层设置无效");
        }
    };
    const rows = project?.clips.filter((clip) => clip.graphic) ?? [];
    const images = host.assets.filter((asset) => asset.mediaType === "image" && asset.storageKey?.startsWith("resource:"));
    return (
        <section aria-label="标题与图形工具" className="mb-4 flex flex-col gap-2 border-b border-[var(--previs-sequencer-border)] pb-3">
            <strong className="text-xs">标题、图形与叠层</strong>
            <p className="text-xs text-[var(--previs-dock-fg)]/65">为画面加上标题、角标或图片。可在预览中选择，在检查面板调整，支持撤销。</p>
            <Button size="small" className="self-start" disabled={!project || editingBlocked || inPreview} onClick={enter}>
                添加标题或图形
            </Button>
            {rows.map((clip) => (
                <Button
                    key={clip.id}
                    size="small"
                    className="h-auto whitespace-normal text-left"
                    aria-pressed={selectedClipId === clip.id}
                    onClick={() => {
                        selectClip(clip.id);
                        seekTransportMs(clip.startMs + Math.min(400, Math.floor(clip.durationMs / 2)));
                        host.focusInspector?.();
                    }}
                >
                    {clip.title || clip.text || "叠层"}
                </Button>
            ))}
            <AppModal
                open={open}
                title="添加标题或图形"
                width={560}
                onCancel={() => {
                    if (!uploading) setOpen(false);
                }}
                closable={!uploading}
                maskClosable={!uploading}
                footer={
                    <div className="flex flex-wrap justify-end gap-2">
                        <Button disabled={uploading} onClick={() => setOpen(false)}>
                            取消
                        </Button>
                        <Button type="primary" loading={uploading} disabled={uploading || editingBlocked || inPreview || (graphic.kind === "image" && !graphic.resourceId)} onClick={create}>
                            添加到时间线
                        </Button>
                    </div>
                }
            >
                <div className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1 text-sm">
                        内容类型
                        <Select
                            aria-label="叠层内容类型"
                            value={graphic.kind}
                            disabled={uploading}
                            onChange={(kind) => {
                                setGraphic((value) => ({ ...value, kind, resourceId: undefined, icon: "spark", shape: "square" }));
                                setText(kind === "text" ? "给故事一个标题" : { image: "图片叠层", icon: "图标", shape: "图形" }[kind]);
                            }}
                            options={[
                                { value: "text", label: "文字标题" },
                                { value: "icon", label: "图标" },
                                { value: "shape", label: "形状" },
                                { value: "image", label: "图片与Logo" },
                            ]}
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                        {graphic.kind === "text" ? "标题文字" : "叠层名称"}
                        <Input.TextArea aria-label="新叠层文字或名称" value={text} maxLength={2000} rows={3} disabled={uploading} onChange={(event) => setText(event.target.value)} />
                    </label>
                    {graphic.kind === "image" && (
                        <div className="flex flex-col gap-2">
                            <Select
                                aria-label="选择叠层图片"
                                placeholder="选择项目中的图片"
                                value={graphic.resourceId}
                                disabled={uploading}
                                showSearch
                                optionFilterProp="label"
                                onChange={(resourceId) => setGraphic((value) => ({ ...value, resourceId }))}
                                options={images.map((asset) => ({ value: asset.storageKey!.slice("resource:".length), label: asset.title }))}
                            />
                            <Button disabled={uploading} loading={uploading} onClick={() => file.current?.click()}>
                                上传图片作为叠层
                            </Button>
                            <input
                                ref={file}
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                hidden
                                onChange={(event) => {
                                    const source = event.target.files?.[0];
                                    event.target.value = "";
                                    if (source) void upload(source);
                                }}
                            />
                        </div>
                    )}
                    <label className="flex flex-col gap-1 text-sm">
                        显示时长（秒）
                        <InputNumber
                            aria-label="新叠层显示时长"
                            min={0.1}
                            max={3600}
                            precision={3}
                            value={duration}
                            disabled={uploading}
                            onChange={(value) => {
                                if (value != null) setDuration(value);
                            }}
                        />
                    </label>
                    <p className="text-xs text-muted-foreground">添加在当前播放头位置。颜色、位置、字体与动画可在添加后调整，不运行生成模型。</p>
                    {error && (
                        <p role="alert" className="text-sm text-[var(--previs-danger)]">
                            {error}
                        </p>
                    )}
                </div>
            </AppModal>
        </section>
    );
}
