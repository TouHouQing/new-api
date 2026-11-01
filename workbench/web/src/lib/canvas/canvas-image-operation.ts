import type { GenerationTask } from "@/services/api/task-center";
import type { ImageOperationResult } from "@/services/api/image-operations";
import { imageMetadata } from "@/lib/canvas/canvas-generation-task-sync";
import { fitImageNodeSize } from "@/lib/canvas/canvas-node-size";
import { layoutGridSplitCells } from "@/lib/canvas/canvas-grid-split";
import { findAvailableGenerationGroupPosition } from "@/lib/canvas/canvas-generation-layout";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";

export function imageOperationNodes(task: GenerationTask, result: ImageOperationResult, source: CanvasNodeData, nodes: CanvasNodeData[] = [source]): CanvasNodeData[] {
    const request = result.imageOperation.request;
    if (source.id !== request.sourceNodeId || source.type !== CanvasNodeType.Image || source.metadata?.storageKey !== `resource:${request.resourceId}`) throw new Error("源图片已被修改或删除，处理结果已保留在素材库");
    const sizes = result.images.map((output) => fitImageNodeSize(output.width, output.height));
    const origin = { x: source.position.x + source.width + 96, y: source.position.y };
    const positions = layoutGridSplitCells(
        origin,
        result.images.map((output, i) => ({ row: output.piece.row, column: output.piece.column, ...sizes[i] })),
    );
    const groupSize = {
        width: Math.max(...positions.map((position, i) => position.x - origin.x + sizes[i].width)),
        height: Math.max(...positions.map((position, i) => position.y - origin.y + sizes[i].height)),
    };
    const available = findAvailableGenerationGroupPosition(nodes, origin, groupSize);
    const label =
        request.recipe.operation === "mask"
            ? request.recipe.mask.mode === "keep"
                ? "提取区域"
                : "擦除区域"
            : { split: "切图", crop: "裁剪", resize: "插值缩放", compose: "图层合成", "trim-layers": "独立素材", region: "原图区域提取", normalize: "规格整理", "background-patch": "局部底图修补" }[request.recipe.operation];
    return result.images.map((output, index) => ({
        id: `image-operation:${task.id}:${index}`,
        type: CanvasNodeType.Image,
        title: `${source.title || "图片"} · ${label}${result.images.length > 1 ? ` ${output.piece.row + 1}-${output.piece.column + 1}` : ""}`,
        position: { x: positions[index].x + available.x - origin.x, y: positions[index].y + available.y - origin.y },
        ...sizes[index],
        metadata: {
            ...imageMetadata(output),
            prompt: source.metadata?.prompt,
            manualSize: true,
            assetId: output.assetId,
            assetVersionId: output.assetVersionId,
            imageOperationTaskId: task.id,
            imageOperationOutputIndex: index,
            generationEffectKeys: [`image-operation:${task.id}:adopt`],
        },
    }));
}

export function mergeImageOperationNodes(nodes: CanvasNodeData[], connections: CanvasConnection[], sourceId: string, children: CanvasNodeData[]) {
    const existing = new Map(nodes.map((node) => [node.id, node]));
    for (const child of children) {
        const previous = existing.get(child.id);
        if (previous && previous.metadata?.storageKey !== child.metadata?.storageKey) throw new Error("处理结果节点已经改变，请从素材库选择所需版本");
    }
    const added = children.filter((child) => !existing.has(child.id));
    const connectionIds = new Set(connections.map((item) => item.id));
    return {
        nodes: [...nodes, ...added],
        connections: [...connections, ...added.map((child) => ({ id: `image-operation-link:${child.id}`, fromNodeId: sourceId, toNodeId: child.id })).filter((connection) => !connectionIds.has(connection.id))],
        added: added.length,
    };
}
