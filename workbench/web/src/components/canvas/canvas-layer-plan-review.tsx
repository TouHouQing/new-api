import { Checkbox, Input, InputNumber, Select } from "antd";
import type { ImageLayerPlan } from "@/lib/canvas/canvas-image-layer-plan";

export function CanvasLayerPlanReview({ plan, selected, onSelect, onChange }: { plan: ImageLayerPlan; selected: number; onSelect: (index: number) => void; onChange: (plan: ImageLayerPlan) => void }) {
    const update = (index: number, patch: Partial<ImageLayerPlan["layers"][number]>) => onChange({ ...plan, layers: plan.layers.map((layer, i) => (i === index ? { ...layer, ...patch } : layer)) });
    return (
        <section aria-label="核对图层" className="space-y-3 border-t border-black/10 pt-4 dark:border-white/10">
            <h4 className="font-medium">2. 核对 {plan.layers.length} 个图层</h4>
            <p className="text-xs opacity-65">原图区域提取保留原像素；AI 重绘可能改变细节。选中图层后可在左侧重新框选范围。</p>
            {plan.layers.map((layer, index) => (
                <div key={index} className={`space-y-2 rounded-lg border p-3 ${index === selected ? "border-blue-500" : "border-black/10 dark:border-white/10"}`}>
                    <button type="button" className="text-left text-sm font-medium" onClick={() => onSelect(index)}>
                        {index + 1}. {layer.name}
                        {index === selected ? " · 已选中，可框选" : " · 选择"}
                    </button>
                    <Input aria-label={`图层${index + 1}名称`} value={layer.name} maxLength={80} onChange={(event) => update(index, { name: event.target.value })} />
                    <p className="text-xs opacity-65">{layer.description}</p>
                    <Select
                        aria-label={`图层${index + 1}提取方式`}
                        className="w-full"
                        value={layer.extraction?.method || "generate"}
                        options={
                            index === 0
                                ? [
                                      { value: "source", label: "保留完整原图 · 无需生成" },
                                      { value: "generate", label: "AI 修补背景 · 调用图片模型" },
                                  ]
                                : [
                                      { value: "source-region", label: "提取原图区域 · 无需生成" },
                                      { value: "generate", label: "AI 重绘独立素材 · 调用图片模型" },
                                  ]
                        }
                        onChange={(method) =>
                            update(index, { extraction: { method, ...(method === "source-region" && layer.extraction?.region ? { region: layer.extraction.region } : {}) }, ...(index === 0 && method === "source" ? { removeFromBackground: false } : {}) })
                        }
                    />
                    {layer.extraction?.method === "source-region" ? (
                        <>
                            <p className="text-xs opacity-65">{layer.extraction.region ? `范围：${layer.extraction.region.bbox.join("，")}（0–1000）` : "尚无可靠范围，请先选择本层，再在原图上框选完整素材。"}</p>
                            <Select
                                aria-label={`图层${index + 1}区域形状`}
                                className="w-full"
                                value={layer.extraction.region?.shape || "rect"}
                                disabled={!layer.extraction.region}
                                options={[
                                    { value: "rect", label: "矩形" },
                                    { value: "rounded-rect", label: "圆角矩形" },
                                    { value: "ellipse", label: "椭圆" },
                                ]}
                                onChange={(shape) => update(index, { extraction: { method: "source-region", region: { ...layer.extraction!.region!, shape, ...(shape === "rounded-rect" ? { radiusRatio: 0.04 } : { radiusRatio: undefined }) } } })}
                            />
                            {layer.extraction.region?.shape === "rounded-rect" ? (
                                <InputNumber
                                    aria-label={`图层${index + 1}圆角比例`}
                                    min={0}
                                    max={0.5}
                                    step={0.01}
                                    value={layer.extraction.region.radiusRatio}
                                    onChange={(value) => update(index, { extraction: { method: "source-region", region: { ...layer.extraction!.region!, radiusRatio: value ?? 0.04 } } })}
                                />
                            ) : null}
                        </>
                    ) : null}
                    {index > 0 && plan.layers[0].extraction?.method !== "source" ? (
                        <Checkbox checked={Boolean(layer.removeFromBackground)} onChange={(event) => update(index, { removeFromBackground: event.target.checked })}>
                            从背景中移除本层内容
                        </Checkbox>
                    ) : null}
                    {layer.extraction?.method === "generate" ? (
                        <details>
                            <summary className="cursor-pointer text-xs">调整本层制作要求</summary>
                            <Input.TextArea
                                aria-label={`图层${index + 1}制作要求`}
                                className="mt-2"
                                value={layer.generation.prompt}
                                maxLength={2400}
                                autoSize={{ minRows: 3, maxRows: 8 }}
                                onChange={(event) => update(index, { generation: { ...layer.generation, prompt: event.target.value } })}
                            />
                        </details>
                    ) : null}
                </div>
            ))}
            {plan.warnings?.length ? (
                <details>
                    <summary className="cursor-pointer text-xs">识图说明与待核对事项（{plan.warnings.length}）</summary>
                    <ul className="list-disc space-y-1 pl-4 text-xs opacity-70">
                        {plan.warnings.map((warning, index) => (
                            <li key={index}>{warning}</li>
                        ))}
                    </ul>
                </details>
            ) : null}
        </section>
    );
}
