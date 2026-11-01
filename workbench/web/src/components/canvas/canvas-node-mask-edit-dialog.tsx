import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Button, Collapse, Input, Segmented, Slider } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { ImageSettingsPanel } from "@/components/image-settings-panel";
import { ModelPicker } from "@/components/model-picker";
import { canvasThemes } from "@/lib/canvas-theme";
import { defaultImageParamsForModel } from "@/lib/model-selection";
import { exportEditMask, paintMaskStrokes, readImageMaskDocument, type ImageMaskDocument, type MaskPoint, type MaskStroke } from "@/lib/canvas/image-mask-document";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import type { AiConfig } from "@/stores/use-config-store";
import { useImageToolSource } from "./use-image-tool-source";
import { CanvasImageCandidateCount } from "./canvas-image-candidate-count";
import { getGenerationCount } from "@/lib/canvas/canvas-project-generation";

export type CanvasImageMaskEditPayload =
    | {
          kind?: "ai";
          maskDataUrl: string;
          document: ImageMaskDocument;
          prompt: string;
          generationConfig?: Partial<Pick<AiConfig, "model" | "imageModel" | "size" | "quality" | "count" | "transparentBackground">>;
      }
    | { kind: "mask"; document: ImageMaskDocument }
    | { kind: "save-mask"; document: ImageMaskDocument };
type MaskEditorProps = { dataUrl: string; sourceStorageKey?: string; sourceChanged?: boolean; initialDocument?: ImageMaskDocument; open: boolean; config: AiConfig; onClose: () => void; onConfirm: (payload: CanvasImageMaskEditPayload) => Promise<void> };

export function CanvasNodeMaskEditDialog(props: MaskEditorProps) {
    return props.open && props.dataUrl ? <MaskSession {...props} /> : null;
}

function MaskSession(props: MaskEditorProps) {
    const [source] = useState(() => ({ dataUrl: props.dataUrl, sourceStorageKey: props.sourceStorageKey, initialDocument: props.initialDocument }));
    const changed = source.sourceStorageKey !== props.sourceStorageKey || (!source.sourceStorageKey && source.dataUrl !== props.dataUrl);
    return (
        <MaskEditor
            {...props}
            {...source}
            sourceChanged={changed}
            onConfirm={async (payload) => {
                if (changed) throw new Error("原节点图片已经变化，当前笔画保留在此窗口；请先核对原图，再关闭并重新打开遮罩工具");
                await props.onConfirm(payload);
            }}
        />
    );
}

function MaskEditor({ dataUrl, sourceStorageKey = "", sourceChanged, initialDocument, config, onClose, onConfirm }: MaskEditorProps) {
    const { size, error: loadError } = useImageToolSource(dataUrl);
    const [restored] = useState(() => {
        try {
            return { document: initialDocument ? readImageMaskDocument(initialDocument, sourceStorageKey) : undefined, error: "" };
        } catch (failure) {
            return { document: undefined, error: failure instanceof Error ? failure.message : "遮罩草稿无法读取" };
        }
    });
    const surface = useRef<HTMLCanvasElement>(null);
    const strokes = useRef<MaskStroke[]>(restored.document?.strokes || []);
    const activePointer = useRef<number | null>(null);
    const frame = useRef<number | null>(null);
    const [diameter, setDiameter] = useState(100);
    const [mode, setMode] = useState("paint");
    const [prompt, setPrompt] = useState(restored.document?.prompt || "");
    const [purpose, setPurpose] = useState<"ai" | "keep" | "remove">(restored.document?.editor?.purpose || restored.document?.mode || "ai");
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState(false);
    const [settings, setSettings] = useState(() => {
        const editor = restored.document?.editor;
        const model = editor ? editor.model : config.imageModel || config.model;
        return { ...config, ...(editor ? { size: editor.size, quality: editor.quality, transparentBackground: editor.transparentBackground } : {}), model, imageModel: model, count: String(editor?.count || 1) };
    });
    const [error, setError] = useState(restored.error);
    const [strokeCount, setStrokeCount] = useState(strokes.current.length);
    const theme = canvasThemes[useActiveTheme()];

    useEffect(
        () => () => {
            if (frame.current !== null) cancelAnimationFrame(frame.current);
        },
        [],
    );
    const repaint = () => {
        if (frame.current !== null) return;
        frame.current = requestAnimationFrame(() => {
            frame.current = null;
            if (!surface.current) return;
            try {
                paintMaskStrokes(surface.current, strokes.current, "#2563eb");
            } catch (failure) {
                setError(failure instanceof Error ? failure.message : "遮罩预览失败");
            }
        });
    };
    useEffect(() => {
        if (!size) return;
        if (restored.document) {
            try {
                readImageMaskDocument(restored.document, sourceStorageKey, size);
            } catch (failure) {
                strokes.current = [];
                setStrokeCount(0);
                setError(failure instanceof Error ? failure.message : "草稿尺寸与原图不一致");
            }
        }
        repaint();
    }, [size, restored, sourceStorageKey]);
    const pointAt = (event: PointerEvent<HTMLCanvasElement>): MaskPoint => {
        const rect = event.currentTarget.getBoundingClientRect();
        return [((event.clientX - rect.left) * event.currentTarget.width) / Math.max(1, rect.width), ((event.clientY - rect.top) * event.currentTarget.height) / Math.max(1, rect.height)];
    };
    const finishStroke = (event: PointerEvent<HTMLCanvasElement>) => {
        if (activePointer.current !== event.pointerId) return;
        activePointer.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        setStrokeCount(strokes.current.length);
    };
    const document = () => {
        if (!size) throw new Error("请等待原图读取完成");
        return readImageMaskDocument(
            {
                version: 1,
                sourceStorageKey,
                ...size,
                mode: purpose === "remove" ? "remove" : "keep",
                strokes: strokes.current,
                prompt,
                editor: { purpose, model: settings.model, count: getGenerationCount(settings.count), size: settings.size, quality: settings.quality, transparentBackground: settings.transparentBackground },
            },
            sourceStorageKey,
            size,
        );
    };
    const saveDocument = async () => {
        if (busy) return;
        setBusy(true);
        setError("");
        try {
            await onConfirm({ kind: "save-mask", document: document() });
            setSaved(true);
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "遮罩保存失败，请保留当前笔画重试");
        } finally {
            setBusy(false);
        }
    };
    const submit = async () => {
        if (busy) return;
        if (!size) return;
        if (purpose !== "ai") {
            setBusy(true);
            setError("");
            try {
                const draft = document();
                if (!draft.strokes.length) throw new Error("请先涂抹需要处理的区域");
                await onConfirm({ kind: "mask", document: draft });
            } catch (failure) {
                setError(failure instanceof Error ? failure.message : "遮罩处理失败");
            } finally {
                setBusy(false);
            }
            return;
        }
        if (!prompt.trim()) return setError("请填写修改要求");
        let maskDataUrl: string;
        try {
            maskDataUrl = exportEditMask(size.width, size.height, strokes.current);
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "遮罩生成失败");
            return;
        }
        const { model, quality, count, transparentBackground } = settings;
        setBusy(true);
        try {
            await onConfirm({ kind: "ai", prompt: prompt.trim(), maskDataUrl, document: document(), generationConfig: { model, imageModel: model, size: settings.size, quality, count, transparentBackground } });
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "局部修改失败");
        } finally {
            setBusy(false);
        }
    };
    return (
        <AppModal
            open
            centered
            title="局部重绘"
            className="workspace-modal workspace-modal-wide"
            onCancel={() => {
                if (!busy) onClose();
            }}
            onOk={() => void submit()}
            okText={purpose === "ai" ? "AI 修改" : purpose === "keep" ? "提取选中区域（免费）" : "擦除选中区域（免费）"}
            confirmLoading={busy}
            okButtonProps={{ disabled: !size || sourceChanged }}
        >
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                <section className="flex min-w-0 flex-col items-center justify-center gap-3 rounded-lg bg-surface-active p-3">
                    <div className="relative max-w-full select-none overflow-hidden rounded-lg">
                        <img src={dataUrl} alt="局部重绘原图" draggable={false} className="block max-h-[62vh] max-w-full" />
                        {size ? (
                            <canvas
                                ref={surface}
                                width={size.width}
                                height={size.height}
                                aria-label="涂抹需要修改的图片区域"
                                className="absolute inset-0 h-full w-full touch-none cursor-crosshair opacity-40"
                                onPointerDown={(event) => {
                                    if (busy || event.button !== 0 || activePointer.current !== null) return;
                                    if (strokes.current.length >= 256) {
                                        setError("最多保存256笔，请撤销部分笔画后继续");
                                        return;
                                    }
                                    event.preventDefault();
                                    event.stopPropagation();
                                    event.currentTarget.setPointerCapture(event.pointerId);
                                    activePointer.current = event.pointerId;
                                    strokes.current.push({ diameter, erase: mode === "erase", points: [pointAt(event)] });
                                    setSaved(false);
                                    setError("");
                                    repaint();
                                }}
                                onPointerMove={(event) => {
                                    if (activePointer.current !== event.pointerId) return;
                                    event.preventDefault();
                                    if (strokes.current.reduce((total, stroke) => total + stroke.points.length, 0) >= 8192) {
                                        setError("最多8192个采样点，请简化笔画后继续");
                                        return;
                                    }
                                    strokes.current.at(-1)?.points.push(pointAt(event));
                                    repaint();
                                }}
                                onPointerUp={finishStroke}
                                onPointerCancel={finishStroke}
                                onLostPointerCapture={finishStroke}
                            />
                        ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {size ? `${size.width} × ${size.height} px · ${purpose === "ai" ? "蓝色区域将被重新生成" : purpose === "keep" ? "提取蓝色区域，其余变透明" : "蓝色区域变透明"}` : loadError || "正在读取图片…"}
                    </p>
                </section>
                <section className="flex max-h-[68vh] flex-col gap-4 overflow-y-auto pr-1">
                    <Segmented
                        block
                        disabled={busy}
                        aria-label="遮罩处理方式"
                        value={purpose}
                        onChange={(value) => {
                            if (value === "ai" || value === "keep" || value === "remove") {
                                setPurpose(value);
                                setSaved(false);
                            }
                        }}
                        options={[
                            { label: "AI 修改", value: "ai" },
                            { label: "提取区域", value: "keep" },
                            { label: "擦除区域", value: "remove" },
                        ]}
                    />
                    <Segmented
                        block
                        disabled={busy}
                        value={mode}
                        onChange={setMode}
                        options={[
                            { label: "画笔", value: "paint" },
                            { label: "擦除笔画", value: "erase" },
                        ]}
                    />
                    <label className="text-sm">
                        笔刷直径 · {diameter} px
                        <Slider disabled={busy} min={8} max={160} step={2} value={diameter} onChange={setDiameter} />
                    </label>
                    <div className="flex gap-2">
                        <Button
                            disabled={busy || !strokeCount}
                            onClick={() => {
                                strokes.current.pop();
                                setStrokeCount(strokes.current.length);
                                setSaved(false);
                                repaint();
                            }}
                        >
                            撤销笔画
                        </Button>
                        <Button
                            disabled={busy}
                            onClick={() => {
                                strokes.current = [];
                                activePointer.current = null;
                                setStrokeCount(0);
                                setError("");
                                setSaved(false);
                                repaint();
                            }}
                        >
                            清空遮罩
                        </Button>
                    </div>
                    {sourceChanged ? (
                        <p role="alert" className="text-sm text-destructive">
                            原节点图片已更新。此窗口保留旧图和笔画，请核对后关闭并重新打开遮罩工具。
                        </p>
                    ) : null}
                    <Button disabled={busy || !size || sourceChanged || !sourceStorageKey.startsWith("resource:")} onClick={() => void saveDocument()}>
                        保存遮罩草稿
                    </Button>
                    <p role="status" className="text-xs text-muted-foreground">
                        {saved ? "遮罩草稿已保存到项目，重新打开可继续修改。" : purpose === "ai" ? "生成候选后仅合成涂抹区域，未涂抹的原图保留。草稿可稍后继续；AI 修改会调用模型。" : "按原图像素处理并另存 PNG，原图保留；不会补绘背景。"}
                    </p>
                    {purpose === "ai" ? (
                        <label className="flex flex-col gap-2 text-sm">
                            修改要求
                            <Input.TextArea
                                disabled={busy}
                                rows={4}
                                maxLength={3200}
                                value={prompt}
                                placeholder="描述选中区域需要发生的变化"
                                onChange={(event) => {
                                    setPrompt(event.target.value);
                                    setError("");
                                    setSaved(false);
                                }}
                            />
                        </label>
                    ) : null}
                    {purpose === "ai" ? (
                        <Collapse
                            defaultActiveKey={["settings"]}
                            items={[
                                {
                                    key: "settings",
                                    label: "生成设置",
                                    children: (
                                        <div className="space-y-4">
                                            <ModelPicker
                                                config={settings}
                                                value={settings.model}
                                                capability="image"
                                                fullWidth
                                                showSelectedPrice={false}
                                                onChange={(model) => {
                                                    setSettings((previous) => ({ ...previous, ...defaultImageParamsForModel(previous, model), imageModel: model, model, count: previous.count }));
                                                    setSaved(false);
                                                    setError("");
                                                }}
                                            />
                                            <ImageSettingsPanel
                                                config={settings}
                                                theme={theme}
                                                showTitle={false}
                                                showCount={false}
                                                bypassPriceGuard
                                                onConfigChange={(key, value) => {
                                                    setSettings((previous) => ({ ...previous, [key]: value }));
                                                    setSaved(false);
                                                }}
                                            />
                                            <CanvasImageCandidateCount
                                                theme={theme}
                                                count={getGenerationCount(settings.count)}
                                                disabled={busy}
                                                onChange={(value) => {
                                                    setSettings((previous) => ({ ...previous, count: String(value) }));
                                                    setSaved(false);
                                                }}
                                            />
                                        </div>
                                    ),
                                },
                            ]}
                        />
                    ) : null}
                    {error || loadError ? (
                        <p role="alert" className="text-sm text-destructive">
                            {error || loadError}
                        </p>
                    ) : null}
                </section>
            </div>
        </AppModal>
    );
}
