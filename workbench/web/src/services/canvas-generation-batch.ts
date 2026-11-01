import { prepareBackendGenerationTask, parseBackendGenerationResult } from "@/services/api/generation-task";
import { createCanvasGenerationBatch, waitForGenerationTask, type CanvasTaskDraft } from "@/services/api/task-center";
import type { runBackendCanvasGenerationTask } from "@/lib/canvas/canvas-project-generation";

type CanvasGenerationInput = Parameters<typeof runBackendCanvasGenerationTask>[0];
type BatchDependencies = {
    prepare: typeof prepareBackendGenerationTask;
    admit: typeof createCanvasGenerationBatch;
    wait: typeof waitForGenerationTask;
};
const defaults: BatchDependencies = { prepare: prepareBackendGenerationTask, admit: createCanvasGenerationBatch, wait: waitForGenerationTask };

/** All targets are admitted before observing any child; observers never POST again. */
export function createDurableCanvasBatchRunner(inputs: CanvasGenerationInput[], options: { root?: CanvasTaskDraft; retiredNodeIds?: string[] } = {}, dependencies: BatchDependencies = defaults) {
    let admission: ReturnType<typeof createCanvasGenerationBatch> | undefined;
    return async (input: CanvasGenerationInput) => {
        if (!inputs.some((item) => item.nodeId === input.nodeId)) throw new Error("批次中没有此目标节点");
        admission ??= (async () => {
            const tasks = await Promise.all(inputs.map((item) => dependencies.prepare({ ...item, metadata: { nodeId: item.nodeId, ...item.metadata } })));
            if (inputs.some((item) => item.signal?.aborted)) throw new DOMException("Aborted", "AbortError");
            const firstDraft = (tasks[0]?.input?.metadata as { canvasTaskDraft?: CanvasTaskDraft } | undefined)?.canvasTaskDraft;
            const root = options.root ? { ...options.root, node: { ...options.root.node, metadata: { ...options.root.node.metadata, references: firstDraft?.node.metadata.references ?? [] } } } : undefined;
            const admitted = await dependencies.admit({ tasks, ...options, ...(root ? { root } : {}) });
            if (admitted.length !== inputs.length || inputs.some((item) => !item.clientOperationId || !admitted.some((task) => task.clientOperationId === item.clientOperationId))) throw new Error("批次提交回执不完整，请到任务中心核对原任务，勿重复生成");
            return admitted;
        })();
        const tasks = await admission;
        const original = inputs.find((item) => item.nodeId === input.nodeId)!;
        const task = tasks.find((task) => task.clientOperationId === original.clientOperationId)!;
        input.onTaskCreated?.(task);
        const completed = await dependencies.wait(task.id, { signal: input.signal, initialTask: task, onTaskUpdate: input.onTaskCreated });
        return parseBackendGenerationResult(completed);
    };
}
