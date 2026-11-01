import type { CanvasNodeData } from "@/types/canvas";
import type { ReferenceImage } from "@/types/image";

export function imageEditRetryContext(inputJson: string | undefined, nodes: readonly CanvasNodeData[]): { metadata: Record<string, unknown>; referenceImages?: ReferenceImage[] } {
    if (!inputJson) return { metadata: {} };
    const input = JSON.parse(inputJson),
        metadata = input?.metadata;
    if (metadata?.edit === "annotation") return { metadata: { edit: "annotation", annotationReference: true, sourceNodeId: metadata.sourceNodeId, sourceResourceId: metadata.sourceResourceId } };
    if (metadata?.edit !== "mask") return { metadata: {} };
    const edit = metadata.nativeImageEdit;
    if (!edit?.mask || edit.emotion || typeof edit.sourceNodeId !== "string" || typeof edit.resourceId !== "string" || typeof edit.expectedSourceSha256 !== "string") throw new Error("原任务缺少固定选区，请回到原图核对后重新修改");
    const source = nodes.find((node) => node.id === edit.sourceNodeId);
    if (source?.type !== "image" || source.metadata?.storageKey !== "resource:" + edit.resourceId) throw new Error("原图已更换或移除，不能将旧选区用于新图");
    return {
        metadata: { edit: "mask", sourceNodeId: source.id, nativeImageEdit: edit },
        referenceImages: [{ id: source.id, name: source.title || "original.png", type: source.metadata.mimeType || "image/png", dataUrl: source.metadata.content || "", storageKey: source.metadata.storageKey }],
    };
}
