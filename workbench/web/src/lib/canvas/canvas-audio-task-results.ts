import { findAvailableGenerationGroupPosition } from "@/lib/canvas/canvas-generation-layout";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

type AudioOutput = { name?: string; role?: string };

// FNV-1a over UTF-8 is shared with native Agent writeback. Keep generated IDs
// below the canvas contract's 80-character limit even for long source IDs.
export function audioTaskOutputNodeId(rootId: string, taskId: string, index: number) {
    let hash = BigInt("14695981039346656037");
    const prime = BigInt("1099511628211");
    for (const byte of new TextEncoder().encode(`${rootId}\n${taskId}\n${index}`)) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * prime);
    return `audio_${hash.toString(16).padStart(16, "0")}`;
}

export function planAudioTaskResultNodes(node: CanvasNodeData, nodes: CanvasNodeData[], taskId: string, outputs: AudioOutput[]) {
    if (!outputs.length || outputs.length > 32) throw new Error("音频任务返回的音轨数量无效");
    const ids = outputs.slice(1).map((_, index) => audioTaskOutputNodeId(node.id, taskId, index + 1));
    const delivered = node.metadata?.taskId === taskId && node.metadata.status === "success" && node.metadata.generationOutputCount === outputs.length && (node.metadata.audioOutputNodeIds?.length || 0) === ids.length;
    const label = (index: number) => (typeof outputs[index].name === "string" ? Array.from(outputs[index].name!.replace(/\s+/g, " ").trim()).slice(0, 96).join("") : "");
    const plans: Array<{ outputIndex: number; node: CanvasNodeData }> = [
        {
            outputIndex: 0,
            node: {
                ...node,
                type: CanvasNodeType.Audio,
                title: delivered ? node.title : label(0) || node.title,
                metadata: { ...node.metadata, generationOutputCount: outputs.length, audioOutputNodeIds: ids.length ? ids : undefined, audioOutputSourceNodeId: undefined },
            } satisfies CanvasNodeData,
        },
    ];
    for (let index = 1; index < outputs.length; index += 1) {
        const id = ids[index - 1];
        const existing = nodes.find((candidate) => candidate.id === id);
        // A committed group proves all outputs were delivered atomically.
        // Missing or repurposed tracks are later edits, not incomplete delivery.
        if (delivered && (!existing || existing.metadata?.audioOutputSourceNodeId !== node.id || existing.metadata.taskId !== taskId)) continue;
        if (existing && (existing.metadata?.audioOutputSourceNodeId !== node.id || existing.metadata.taskId !== taskId)) throw new Error("音轨节点已关联其他内容，原结果保留在素材库");
        const child: CanvasNodeData = existing
            ? { ...existing }
            : {
                  ...node,
                  id,
                  type: CanvasNodeType.Audio,
                  title: label(index) || `音轨 ${index + 1}`,
                  parentId: undefined,
                  position: findAvailableGenerationGroupPosition([...nodes, ...plans.slice(1).map((plan) => plan.node)], { x: node.position.x + node.width + 48, y: node.position.y + (index - 1) * (node.height + 24) }, node),
              };
        plans.push({ outputIndex: index, node: { ...child, metadata: { ...child.metadata, audioOutputSourceNodeId: node.id, audioOutputNodeIds: undefined, generationOutputCount: undefined } } });
    }
    return plans;
}
