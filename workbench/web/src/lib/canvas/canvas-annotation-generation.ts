import type { ReferenceImage } from "@/types/image";

export function annotationGeneration(source: ReferenceImage, payload: { annotatedDataUrl: string; annotatedReferenceDataUrl: string; prompt: string }, maxReferences: number) {
    if (maxReferences < 1) throw new Error("当前图片模型不支持参考图片，请选择可根据批注修改的模型");
    const instruction = payload.prompt.trim();
    if (!instruction || instruction.length > 3200) throw new Error("请填写要如何修改标记区域，最多3200字");
    const one = maxReferences === 1;
    const image = one ? payload.annotatedReferenceDataUrl : payload.annotatedDataUrl;
    if (!image.startsWith("data:image/png;base64,")) throw new Error("批注参考图不完整，请保留修改要求后重新打开原图");
    const reference: ReferenceImage = { id: `${source.id}-annotation`, name: "annotation.png", type: "image/png", dataUrl: image };
    const prompt = [
        instruction,
        one ? "参考图已经包含原图和用户的彩色批注，标记用于定位修改区域。" : "第一张参考图是原图，第二张参考图是对应的彩色批注，标记用于定位修改区域。",
        "按用户要求修改标记对应内容，保持未标记部分的构图、主体和细节，去除批注线和标记本身，输出自然的编辑结果。",
    ].join("\n");
    return { references: one ? [reference] : [source, reference], prompt };
}
