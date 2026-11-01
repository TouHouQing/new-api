import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button, Input, InputNumber, Segmented, Tag } from "antd";
import { Layers3, Plus, RotateCcw, X } from "lucide-react";

import { ModelPicker } from "@/components/model-picker";
import { AppModal } from "@/components/ui/product/app-modal";
import { selectableModelsByCapability, type AiConfig } from "@/stores/use-config-store";
import { defaultImageParamsForModel } from "@/lib/model-selection";
import { imageLayerOutputSize, imageLayerPlannerError, type ImageLayerPlan, type ImageLayerPlanningOptions, type ImageLayerPlanningPurpose } from "@/lib/canvas/canvas-image-layer-plan";
import { CanvasLayerPlanReview } from "./canvas-layer-plan-review";
import type { ImageLayerPlanningDraft } from "@/lib/canvas/image-layer-planning-draft";
import { resolveImageLayerExtractions } from "@/lib/canvas/canvas-image-layer-strategy";
import { ImageLayerPlanningEmptyError, ImageLayerPlanningPendingError } from "@/services/canvas-image-layer-planning";
import { supportsExperimentalLayerExtraction, supportsLayerDecomposition } from "@/lib/canvas/canvas-image-layers";
import type { ImageLayerExtraction } from "@/lib/canvas/canvas-image-layer-strategy";
import { navigateToSettings } from "@/lib/settings-navigation";

export type CanvasImageLayerDecompositionPayload = {
    prompt: string;
    plannerModel: string;
    maxCredits?: number;
    planningMaxCredits?: number;
    regions?: Array<[number, number, number, number]>;
    experimentalTargets?: string[];
    extractions?: ImageLayerExtraction[];
    removeFromBackground?: boolean[];
    backgroundRemovalModel?: string;
    planning?: ImageLayerPlan;
    independentMaterials?: boolean;
    generationConfig?: Partial<Pick<AiConfig, "model" | "imageModel" | "size" | "quality">>;
};

const DEFAULT_PROMPT = "拆出完整不透明背景和必要的独立前景。背景移除已拆内容并修补，保留其他环境与设计结构；框内完整照片或场景保留内部内容，不拆碎。前景保持原始比例、位置和细节，使用真实透明背景；不扩展原图画幅。";
const MATERIALS_PROMPT = "保留完整原图，将有复用价值的完整照片、设计组件或主体整理为独立素材。完整照片保留内部全部内容；不拆碎场景，不重画可直接提取的原图区域。";

export function CanvasNodeLayerDecompositionDialog({
    dataUrl,
    open,
    config,
    sourceSize,
    onClose,
    onConfirm,
    onPlan,
    savedDraft,
    onDraftChange,
    onDraftFlush,
}: {
    dataUrl: string;
    open: boolean;
    config: AiConfig;
    sourceSize?: { width: number; height: number };
    onClose: () => void;
    onConfirm: (payload: CanvasImageLayerDecompositionPayload) => Promise<void>;
    onPlan: (model: string, prompt: string, signal: AbortSignal, options?: ImageLayerPlanningOptions) => Promise<ImageLayerPlan>;
    savedDraft?: ImageLayerPlanningDraft;
    onDraftChange?: (draft: ImageLayerPlanningDraft | undefined) => void;
    onDraftFlush?: () => Promise<void>;
}) {
    const [prompt, setPrompt] = useState(MATERIALS_PROMPT);
    const [measuredSize, setMeasuredSize] = useState<{ width: number; height: number }>();
    const [generationConfig, setGenerationConfig] = useState<AiConfig>(config);
    const [plannerModel, setPlannerModel] = useState("");
    const [maxCredits, setMaxCredits] = useState(0);
    const [planningMaxCredits, setPlanningMaxCredits] = useState(0);
    const [purpose, setPurpose] = useState<ImageLayerPlanningPurpose>("materials");
    const [plan, setPlan] = useState<ImageLayerPlan>();
    const [selectedLayer, setSelectedLayer] = useState(1);
    const [planning, setPlanning] = useState(false);
    const [pendingTask, setPendingTask] = useState(false);
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [savingDraft, setSavingDraft] = useState(false);
    const draftCallbacks = useRef({ onDraftChange, onDraftFlush });
    draftCallbacks.current = { onDraftChange, onDraftFlush };
    const savedDraftRef = useRef(savedDraft);
    savedDraftRef.current = savedDraft;
    const planningController = useRef<AbortController | null>(null);
    const onPlanRef = useRef(onPlan);
    onPlanRef.current = onPlan;
    const [regions, setRegions] = useState<Array<[number, number, number, number]>>([]);
    const [drawing, setDrawing] = useState<{ x: number; y: number } | null>(null);
    const [draft, setDraft] = useState<[number, number, number, number] | null>(null);
    const imageFrameRef = useRef<HTMLDivElement>(null);
    const configRef = useRef(config);
    configRef.current = config;

    useEffect(() => {
        if (!open) return;
        const current = configRef.current;
        const models = [current.imageModel, current.model, ...selectableModelsByCapability(current, "image")];
        const model = models.find((value) => supportsLayerDecomposition(current, value || "")) || models.find((value) => supportsExperimentalLayerExtraction(current, value || "")) || "";
        setGenerationConfig({ ...current, model, imageModel: model, ...defaultImageParamsForModel(current, model) });
        setPlannerModel([current.textModel, ...selectableModelsByCapability(current, "text")].find((value) => value && !imageLayerPlannerError(current, value)) || "");
        setPrompt(MATERIALS_PROMPT);
        setMeasuredSize(undefined);
        setRegions([]);
        setDrawing(null);
        setDraft(null);
        setMaxCredits(0);
        setPlanningMaxCredits(0);
        setPurpose("materials");
        setPlan(undefined);
        setSelectedLayer(1);
        setPendingTask(false);
        setPlanning(false);
        setError("");
        setSubmitting(false);
        const saved = savedDraftRef.current;
        if (saved) {
            setPlan(saved.plan);
            setPrompt(saved.prompt);
            setPurpose(saved.purpose);
            setRegions(saved.regions);
            setSelectedLayer(saved.selectedLayer);
            setPlannerModel(saved.plannerModel);
            setMaxCredits(saved.maxCredits);
            setPlanningMaxCredits(saved.planningMaxCredits);
            setGenerationConfig({ ...current, ...saved.generationConfig });
        }
        return () => planningController.current?.abort();
    }, [dataUrl, open]);

    const draftValue: ImageLayerPlanningDraft | undefined = plan?.source
        ? {
              version: 1,
              plan,
              prompt,
              purpose,
              regions,
              selectedLayer,
              plannerModel,
              maxCredits,
              planningMaxCredits,
              generationConfig: { model: generationConfig.model, imageModel: generationConfig.imageModel, size: generationConfig.size, quality: generationConfig.quality },
          }
        : undefined;
    const draftValueRef = useRef(draftValue);
    draftValueRef.current = draftValue;
    const draftKey = draftValue ? JSON.stringify(draftValue) : "";
    useEffect(() => {
        if (!open || !draftKey) return;
        const timer = setTimeout(() => {
            try {
                draftCallbacks.current.onDraftChange?.(draftValueRef.current);
            } catch (cause) {
                setError(cause instanceof Error ? cause.message : "草稿尚未保存");
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [draftKey, open]);
    const closeWithDraft = async () => {
        if (savingDraft || submitting) return;
        setSavingDraft(true);
        try {
            if (draftValueRef.current) {
                draftCallbacks.current.onDraftChange?.(draftValueRef.current);
                await draftCallbacks.current.onDraftFlush?.();
            }
            onClose();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "草稿未保存，请重试关闭");
        } finally {
            setSavingDraft(false);
        }
    };

    const selectedModel = generationConfig.imageModel || generationConfig.model;
    const supported = supportsLayerDecomposition(config, selectedModel) || supportsExperimentalLayerExtraction(config, selectedModel);
    const plannerError = imageLayerPlannerError(config, plannerModel);
    const outputSize = imageLayerOutputSize(config, selectedModel, sourceSize || measuredSize);
    const outputSizeError = supported && !outputSize ? "所选模型没有支持原图比例的尺寸，或源图尺寸尚未读取；请更换模型或重新打开图片" : "";
    const needsImages = Boolean(plan?.layers.some((layer) => !layer.extraction || layer.extraction.method === "generate"));
    let planError = "";
    if (plan) {
        try {
            resolveImageLayerExtractions(
                plan.layers.length,
                plan.layers.map((layer) => layer.extraction || { method: "generate" }),
                plan.layers.map((layer, index) => index > 0 && plan.layers[0].extraction?.method !== "source" && Boolean(layer.removeFromBackground)),
            );
            if (new Set(plan.layers.map((layer) => layer.name.trim())).size !== plan.layers.length || plan.layers.some((layer) => !layer.name.trim())) planError = "请为每层填写不同的名称";
        } catch (cause) {
            planError = cause instanceof Error ? cause.message : "请核对图层范围";
        }
    }
    const requestPlan = async (history: boolean) => {
        if (planning) return;
        const controller = new AbortController();
        planningController.current?.abort();
        planningController.current = controller;
        setPlanning(true);
        setError("");
        try {
            const scope = `${prompt.trim()}\n${regions.length ? `重点区域（0–1000）：${regions.map((region) => `<bbox>${region.join(" ")}</bbox>`).join("；")}` : "根据实际图像选择必要图层，避免过度拆碎。"}`;
            const result = await onPlanRef.current(plannerModel, scope, controller.signal, { history, purpose, input: "preview", maxCredits: planningMaxCredits });
            if (!controller.signal.aborted) {
                setPlan(result);
                setPendingTask(false);
                setSelectedLayer(1);
            }
        } catch (cause) {
            if (!controller.signal.aborted) {
                setError(cause instanceof Error ? cause.message : "无法读取规划");
                setPendingTask(cause instanceof ImageLayerPlanningPendingError);
            }
        } finally {
            if (!controller.signal.aborted) setPlanning(false);
        }
    };
    useEffect(() => {
        if (!open) return;
        if (savedDraftRef.current) return;
        const controller = new AbortController();
        planningController.current?.abort();
        planningController.current = controller;
        setPlanning(true);
        void onPlanRef
            .current("", "", controller.signal, { history: true, purpose: "materials" })
            .then((result) => {
                if (!controller.signal.aborted) setPlan(result);
            })
            .catch((cause) => {
                if (!controller.signal.aborted && !(cause instanceof ImageLayerPlanningEmptyError)) {
                    setError(cause instanceof Error ? cause.message : "无法读取已有规划");
                    setPendingTask(cause instanceof ImageLayerPlanningPendingError);
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setPlanning(false);
            });
        return () => controller.abort();
    }, [dataUrl, open]);

    const point = (event: ReactPointerEvent<HTMLDivElement>) => {
        const rect = imageFrameRef.current?.getBoundingClientRect();
        if (!rect) return null;
        return {
            x: Math.max(0, Math.min(1000, ((event.clientX - rect.left) / Math.max(1, rect.width)) * 1000)),
            y: Math.max(0, Math.min(1000, ((event.clientY - rect.top) / Math.max(1, rect.height)) * 1000)),
        };
    };
    const finishBox = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!drawing) return;
        const next = point(event);
        const box = next ? [Math.min(drawing.x, next.x), Math.min(drawing.y, next.y), Math.max(drawing.x, next.x), Math.max(drawing.y, next.y)] : draft;
        if (box && box[2] - box[0] >= 2 && box[3] - box[1] >= 2) {
            const bbox = box.map(Math.round) as [number, number, number, number];
            if (plan && selectedLayer > 0)
                setPlan({
                    ...plan,
                    layers: plan.layers.map((layer, index) =>
                        index === selectedLayer
                            ? {
                                  ...layer,
                                  bbox,
                                  extraction: {
                                      method: "source-region",
                                      region: { bbox, shape: layer.extraction?.region?.shape || "rect", ...(layer.extraction?.region?.shape === "rounded-rect" ? { radiusRatio: layer.extraction.region.radiusRatio } : {}) },
                                  },
                              }
                            : layer,
                    ),
                });
            else setRegions((current) => [...current, bbox]);
        }
        setDrawing(null);
        setDraft(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };

    return (
        <AppModal flush open={open && Boolean(dataUrl)} onCancel={() => void closeWithDraft()} footer={null} centered width={1120} title="AI 图层拆分">
            <div className="grid max-h-[82vh] gap-6 overflow-y-auto p-5 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" data-canvas-no-zoom>
                <div className="grid min-h-[260px] place-items-center overflow-hidden rounded-xl bg-black/5 p-3 dark:bg-white/[0.04] md:sticky md:top-0 md:min-h-[480px] md:self-start">
                    <div
                        ref={imageFrameRef}
                        aria-label="框选重点区域"
                        className="relative inline-block max-h-[60vh] max-w-full touch-none select-none"
                        onPointerDown={(event) => {
                            if (event.button !== 0) return;
                            const next = point(event);
                            if (!next) return;
                            event.preventDefault();
                            event.currentTarget.setPointerCapture(event.pointerId);
                            setDrawing(next);
                            setDraft([next.x, next.y, next.x, next.y]);
                        }}
                        onPointerMove={(event) => {
                            if (!drawing) return;
                            const next = point(event);
                            if (next) setDraft([Math.min(drawing.x, next.x), Math.min(drawing.y, next.y), Math.max(drawing.x, next.x), Math.max(drawing.y, next.y)]);
                        }}
                        onPointerUp={finishBox}
                        onPointerCancel={() => {
                            setDrawing(null);
                            setDraft(null);
                        }}
                    >
                        <img
                            src={dataUrl}
                            alt="待拆分图片"
                            className="block max-h-[60vh] max-w-full object-contain"
                            draggable={false}
                            onLoad={(event) => setMeasuredSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                        />
                        <div className="pointer-events-none absolute inset-0">
                            {regions.map((region, index) => (
                                <RegionBox key={`${region.join("-")}-${index}`} region={region} label={index + 1} />
                            ))}
                            {draft ? <RegionBox region={draft} label={regions.length + 1} draft /> : null}
                            {plan?.layers.map((layer, index) => (layer.extraction?.region ? <RegionBox key={`planned-${index}`} region={layer.extraction.region.bbox} label={index + 1} /> : null))}
                        </div>
                    </div>
                </div>
                <div className="flex min-w-0 flex-col gap-4">
                    <div>
                        <h3 className="text-lg font-semibold">拆分图片图层</h3>
                        <p className="mt-2 text-sm opacity-60">先识图、再核对图层，最后确认制作。识图不会自动生成图片；关闭窗口后，可读取已有规划。</p>
                    </div>
                    <Segmented
                        aria-label="拆层用途"
                        block
                        value={purpose}
                        options={[
                            { value: "materials", label: "提取素材 · 保留原图" },
                            { value: "recompose", label: "分离前景 · 修补背景" },
                        ]}
                        onChange={(value) => {
                            setPurpose(value as ImageLayerPlanningPurpose);
                            setPrompt(value === "materials" ? MATERIALS_PROMPT : DEFAULT_PROMPT);
                            setPlan(undefined);
                            setError("");
                            try {
                                draftCallbacks.current.onDraftChange?.(undefined);
                            } catch (cause) {
                                setError(cause instanceof Error ? cause.message : "草稿尚未保存");
                            }
                        }}
                        disabled={planning}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                        {regions.length ? <Tag color="blue">已框选 {regions.length} 个区域</Tag> : <span className="rounded-md bg-black/5 px-2 py-1 text-xs dark:bg-white/5">未框选，按描述拆分</span>}
                        {regions.length ? (
                            <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={() => setRegions([])}>
                                清除选区
                            </Button>
                        ) : (
                            <span className="text-xs opacity-55">
                                <Plus className="mr-1 inline size-3" />
                                在图片上拖动添加选区
                            </span>
                        )}
                    </div>
                    <Input.TextArea
                        aria-label="拆层要求"
                        rows={5}
                        value={prompt}
                        disabled={planning}
                        placeholder="描述需要拆分的内容"
                        onChange={(event) => {
                            setPrompt(event.target.value);
                            setPlan(undefined);
                        }}
                    />
                    <div className="space-y-2">
                        <div className="text-sm font-medium opacity-75">视觉规划模型</div>
                        <ModelPicker
                            config={config}
                            value={plannerModel}
                            capability="text"
                            fullWidth
                            showSelectedPrice
                            placeholder="选择视觉规划模型"
                            modelFilter={(model) => !imageLayerPlannerError(config, model)}
                            onMissingConfig={() => navigateToSettings({ continueCreation: true })}
                            onChange={setPlannerModel}
                        />
                        {plannerError ? (
                            <p role="alert" className="text-xs text-red-500">
                                {plannerError}
                            </p>
                        ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button type={plan ? "default" : "primary"} loading={planning} disabled={planning || pendingTask || Boolean(plannerError) || !prompt.trim()} onClick={() => void requestPlan(false)}>
                            {plan ? "重新识图规划" : "1. 先识图规划"}
                        </Button>
                        <Button disabled={planning} onClick={() => void requestPlan(true)}>
                            读取已有规划
                        </Button>
                    </div>
                    {planning ? (
                        <p role="status" className="text-sm opacity-65">
                            正在读取图片与规划。可关闭窗口，稍后读取已有规划；任务记录会保留。
                        </p>
                    ) : null}
                    {error ? (
                        <p role="alert" className="text-sm text-red-500">
                            {error}
                        </p>
                    ) : null}
                    {plan ? <CanvasLayerPlanReview plan={plan} selected={selectedLayer} onSelect={setSelectedLayer} onChange={setPlan} /> : null}
                    {needsImages ? (
                        <>
                            <div className="space-y-2">
                                <div className="text-sm font-medium opacity-75">图层拆分模型</div>
                                <ModelPicker
                                    config={{ ...config, model: selectedModel, imageModel: selectedModel }}
                                    value={selectedModel}
                                    capability="image"
                                    fullWidth
                                    showSelectedPrice
                                    placeholder="选择图层拆分模型"
                                    modelFilter={(model) => supportsLayerDecomposition(config, model) || supportsExperimentalLayerExtraction(config, model)}
                                    onMissingConfig={() => navigateToSettings({ continueCreation: true })}
                                    onChange={(model) => setGenerationConfig((current) => ({ ...current, model, imageModel: model, ...defaultImageParamsForModel(current, model) }))}
                                />
                                {!supported ? (
                                    <p role="alert" className="text-xs text-red-500">
                                        请选择可编辑参考图的图片模型或专用拆层模型
                                    </p>
                                ) : null}
                                {outputSizeError ? (
                                    <p role="alert" className="text-xs text-red-500">
                                        {outputSizeError}
                                    </p>
                                ) : null}
                            </div>
                        </>
                    ) : plan ? (
                        <p className="text-sm opacity-65">本次仅提取原图像素，不调用图片模型。</p>
                    ) : null}
                    <div className="space-y-2">
                        {needsImages ? (
                            <>
                                <label htmlFor="layer-workflow-budget" className="text-sm font-medium">
                                    拆层生成积分上限
                                </label>
                                <InputNumber id="layer-workflow-budget" aria-label="拆层生成积分上限" min={0} max={1000000} precision={4} value={maxCredits} onChange={(value) => setMaxCredits(value ?? 0)} className="w-full" />
                                <p className="text-xs opacity-60">0 仅允许免费模型。报价超过上限不会提交图片生成。</p>
                            </>
                        ) : null}
                        <label htmlFor="layer-planning-budget" className="text-sm font-medium">
                            识图规划积分上限
                        </label>
                        <InputNumber id="layer-planning-budget" aria-label="识图规划积分上限" min={0} max={1000000} precision={4} value={planningMaxCredits} onChange={(value) => setPlanningMaxCredits(value ?? 0)} className="w-full" />
                        <p className="text-xs opacity-60">识图与图片生成分别设置上限。0 使用免费模型；读取已有规划不调用模型。</p>
                    </div>
                    {planError ? (
                        <p role="alert" className="text-sm text-red-500">
                            {planError}
                        </p>
                    ) : null}
                    <div className="mt-auto flex justify-end gap-2 pt-2">
                        <Button icon={<X className="size-4" />} loading={savingDraft} disabled={submitting} onClick={() => void closeWithDraft()}>
                            {plan ? "保存草稿并关闭" : "关闭"}
                        </Button>
                        <Button
                            type="primary"
                            icon={<Layers3 className="size-4" />}
                            loading={submitting}
                            disabled={!plan?.source || !prompt.trim() || !dataUrl || planning || submitting || Boolean(drawing) || Boolean(planError) || (needsImages && (!supported || Boolean(outputSizeError)))}
                            onClick={async () => {
                                const scopePrompt = `${prompt.trim()}\n自动拆分：根据实际图像结构选择必要图层，不固定题材或层数；保留完整底图，避免过度拆碎。`;
                                const selectedPrompt = regions.length
                                    ? `${scopePrompt}\n\n重点处理用户框选的区域。选区坐标（图像 0-1000 坐标系）：${regions.map((region, index) => `区域${index + 1} <bbox>${region.join(" ")}</bbox>`).join("；")}`
                                    : scopePrompt;
                                const models = [config.imageModel, config.model, ...selectableModelsByCapability(config, "image")];
                                setSubmitting(true);
                                try {
                                    await onConfirm({
                                        prompt: selectedPrompt,
                                        plannerModel,
                                        maxCredits,
                                        planningMaxCredits,
                                        planning: plan && { ...plan, layers: plan.layers.map((layer, index) => ({ ...layer, removeFromBackground: index > 0 && plan.layers[0].extraction?.method !== "source" && Boolean(layer.removeFromBackground) })) },
                                        regions,
                                        independentMaterials: false,
                                        backgroundRemovalModel: models.find((value) => supportsExperimentalLayerExtraction(config, value || "") && !supportsLayerDecomposition(config, value || "")),
                                        generationConfig: { model: selectedModel, imageModel: selectedModel, size: outputSize, quality: generationConfig.quality },
                                    });
                                } finally {
                                    setSubmitting(false);
                                }
                            }}
                        >
                            3. 确认图层并制作
                        </Button>
                    </div>
                </div>
            </div>
        </AppModal>
    );
}

function RegionBox({ region, label, draft = false }: { region: [number, number, number, number]; label: number; draft?: boolean }) {
    const [x1, y1, x2, y2] = region;
    return (
        <div
            className={`absolute rounded-sm border-2 ${draft ? "border-dashed border-blue-500 bg-blue-500/10" : "border-solid border-amber-400 bg-amber-400/10"}`}
            style={{ left: `${x1 / 10}%`, top: `${y1 / 10}%`, width: `${(x2 - x1) / 10}%`, height: `${(y2 - y1) / 10}%` }}
        >
            <span className="absolute -left-0.5 -top-0.5 grid size-5 -translate-y-1/2 -translate-x-1/2 place-items-center rounded-full bg-amber-400 text-[var(--fs-label)] font-semibold text-black shadow">{label}</span>
        </div>
    );
}
