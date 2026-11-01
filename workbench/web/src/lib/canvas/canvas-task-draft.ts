import { resetGenerationTaskMetadata } from "@/lib/canvas/canvas-task-state";
import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";

/** The task transaction binds the snapshot; media remains in owned resources. */
export function canvasGenerationTaskDraft(node: CanvasNodeData, connections: readonly CanvasConnection[] = [], previousNode?: CanvasNodeData) {
    const metadata = resetGenerationTaskMetadata(node.metadata, "loading");
    delete metadata.content;
    delete metadata.richText;
    delete metadata.storageKey;
    delete metadata.assetId;
    if (previousNode?.metadata?.taskId) metadata.taskId = previousNode.metadata.taskId;
    if (previousNode?.metadata?.storageKey) metadata.storageKey = previousNode.metadata.storageKey;
    return {
        node: { id: node.id, type: node.type, title: node.title, position: { ...node.position }, width: node.width, height: node.height, metadata },
        connections: connections.filter((connection) => connection.toNodeId === node.id).map((connection) => ({ ...connection })),
        requireExisting: Boolean(previousNode),
    };
}
