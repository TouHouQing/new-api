import { canonicalize } from "json-canonicalize";
import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";

const pollingFields: (keyof CanvasNodeMetadata)[] = [
    "taskStatus",
    "taskProgress",
    "taskStage",
    "taskMediaStage",
    "taskCanRecoverMedia",
    "taskProvider",
    "taskStartedAt",
    "taskCompletedAt",
    "taskDurationMs",
    "taskErrorCode",
    "taskOfficialStatus",
    "taskReceiptRecorded",
    "errorDetails",
    "generationErrorCode",
    "resourceReloadAvailable",
    "failedPromptFingerprint",
];
const projections = new WeakMap<CanvasNodeData, CanvasNodeData>();
const serialized = new WeakMap<CanvasNodeData, string>();

function persistentNode(node: CanvasNodeData) {
    const cached = projections.get(node);
    if (cached) return cached;
    const metadata = node.metadata;
    if (!metadata?.taskId) return node;
    const transient = metadata.status === "loading" ? pollingFields : [];
    if (!transient.some((key) => key in metadata)) return node;
    const nextMetadata = { ...metadata };
    for (const key of transient) delete nextMetadata[key];
    const next = { ...node, metadata: nextMetadata };
    projections.set(node, next);
    return next;
}

function serialize(node: CanvasNodeData) {
    let value = serialized.get(node);
    if (value === undefined) {
        value = canonicalize(node);
        serialized.set(node, value);
    }
    return value;
}

/** Keep task identity and edits durable; recover live progress from the task API. */
export function canvasPersistentNodes(nodes: CanvasNodeData[], previous: CanvasNodeData[] = []): CanvasNodeData[] {
    if (nodes === previous) return nodes;
    const previousById = new Map(previous.map((node) => [node.id, node]));
    const next = nodes.map((node) => {
        let projected = persistentNode(node);
        const old = previousById.get(node.id);
        if (old?.metadata?.taskId && old.metadata.taskId === node.metadata?.taskId && node.metadata.status === "loading") {
            // Existing server observations are a durable baseline. Later live
            // polling must neither delete them nor turn each heartbeat into a save.
            const metadata = { ...projected.metadata };
            for (const key of [...pollingFields, "taskUpdatedAt" as const]) {
                if (Object.hasOwn(old.metadata, key)) Object.assign(metadata, { [key]: old.metadata[key] });
                else delete metadata[key];
            }
            projected = { ...projected, metadata };
        }
        return old && (old === projected || serialize(old) === serialize(projected)) ? old : projected;
    });
    return previous.length === next.length && next.every((node, index) => node === previous[index]) ? previous : next;
}
