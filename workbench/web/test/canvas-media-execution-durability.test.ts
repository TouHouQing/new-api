import { describe, expect, test } from "bun:test";
import { executeAudioGeneration, executeVideoGeneration } from "@/pages/canvas/canvas-media-generation-executors";
import { executeImageGeneration } from "@/pages/canvas/canvas-image-generation-executor";
import { executeTextGeneration } from "@/pages/canvas/canvas-text-generation-executor";
import type { CanvasGenerationExecution } from "@/pages/canvas/canvas-generation-executor-types";
import { defaultConfig } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasNodeData, type CanvasConnection } from "@/types/canvas";

const source = (type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({ id: "source", type, title: "原素材", width: 300, height: 200, position: { x: 20, y: 30 }, metadata });
function fixture(node: CanvasNodeData, nodes = [node], connections: CanvasConnection[] = []) {
    const updates: Array<Parameters<CanvasGenerationExecution["setNodes"]>[0]> = [];
    const connectionUpdates: Array<Parameters<CanvasGenerationExecution["setConnections"]>[0]> = [];
    const controller = new AbortController();
    const execution: CanvasGenerationExecution = {
        projectId: "canvas",
        nodeId: node.id,
        sourceNode: node,
        canvasNodes: nodes,
        canvasConnections: connections,
        prompt: "保留晨光",
        effectivePrompt: "保留晨光",
        generationConfig: { ...defaultConfig, model: "system::local", size: "16:9" },
        generationContext: { prompt: "保留晨光", referenceImages: [], referenceVideos: [], referenceAudios: [], textCount: 1, imageCount: 0, videoCount: 0, audioCount: 0, resolvedCharacterVersions: [], resolvedCharacterVoices: [] },
        controller,
        editingTextNode: false,
        styleMetadata: {},
        skillMetadata: {},
        setNodes: (update) => updates.push(update),
        setConnections: (update) => connectionUpdates.push(update),
        setSelectedNodeIds: () => {},
        setSelectedConnectionId: () => {},
        setDialogNodeId: () => {},
        startGenerationRequest: () => controller,
        finishGenerationRequest: () => {},
        bindGenerationTask: () => {},
        applyGenerationTaskResult: async () => {},
        registerPendingNodeIds: () => {},
        showError: () => {},
    };
    const requests: Array<Parameters<NonNullable<Parameters<typeof executeVideoGeneration>[1]>>[0]> = [];
    const runTask: NonNullable<Parameters<typeof executeVideoGeneration>[1]> = async (input) => {
        requests.push(input);
        const task = { id: "fixture-task", type: `canvas_${input.mode}`, status: "succeeded" as const, prompt: input.prompt, attempts: 1, createdAt: "", updatedAt: "", resultJson: JSON.stringify({ mode: input.mode }) };
        input.onTaskCreated?.(task);
        return { mode: input.mode, taskId: task.id };
    };
    const drain = () => ({
        nodes: updates.reduce((current, update) => (typeof update === "function" ? update(current) : update), nodes),
        connections: connectionUpdates.reduce((current, update) => (typeof update === "function" ? update(current) : update), connections),
    });
    return { execution, requests, runTask, drain };
}

describe("ordinary media admission before React persistence", () => {
    test("new video request contains its exact pending target and edge even while all state updates are deferred", async () => {
        const state = fixture(source(CanvasNodeType.Text, { content: "晨光下的窗台" }));
        await executeVideoGeneration(state.execution, state.runTask);
        const request = state.requests[0],
            draft = request.metadata!.canvasTaskDraft as ReturnType<typeof import("@/lib/canvas/canvas-task-draft").canvasGenerationTaskDraft>;
        expect(request.clientOperationId).toMatch(/^canvas-video:/);
        expect(draft.requireExisting).toBe(false);
        expect(draft.node.id).toBe(request.nodeId);
        expect(draft.node.type).toBe(CanvasNodeType.Video);
        expect(draft.connections).toHaveLength(1);
        const saved = state.drain();
        expect(saved.nodes.find((node) => node.id === request.nodeId)?.position).toEqual(draft.node.position);
        expect(saved.connections).toEqual(draft.connections);
    });
    test("video regeneration retains the previous media version and all incoming storyboard relations in place", async () => {
        const old = source(CanvasNodeType.Video, { content: "/api/resources/old/file", storageKey: "resource:old", taskId: "old-task", status: "success" });
        const reference = { ...source(CanvasNodeType.Text), id: "reference" };
        const edge: CanvasConnection = { id: "input", fromNodeId: reference.id, toNodeId: old.id, fromHandleId: "right", toHandleId: "left", fromAnchorRatio: 0.25, toAnchorRatio: 0.75, relation: "storyboard-output", storyboardRowId: "shot-one" };
        const state = fixture(old, [reference, old], [edge]);
        await executeVideoGeneration(state.execution, state.runTask);
        const request = state.requests[0],
            draft = request.metadata!.canvasTaskDraft as ReturnType<typeof import("@/lib/canvas/canvas-task-draft").canvasGenerationTaskDraft>;
        expect(draft.node.id).toBe(old.id);
        expect(draft.requireExisting).toBe(true);
        expect(draft.node.metadata.mediaVersions?.some((version) => version.media.storageKey === "resource:old")).toBe(true);
        expect(draft.node.metadata.taskId).toBe("old-task");
        const saved = state.drain();
        expect(saved.nodes.find((node) => node.id === old.id)?.metadata.mediaVersions?.some((version) => version.media.storageKey === "resource:old")).toBe(true);
        expect(saved.connections).toEqual([edge]);
    });
    test("in-place audio retry preserves its previous binding and exact retry key in the native draft", async () => {
        const state = fixture(source(CanvasNodeType.Audio, { taskId: "failed-task", status: "error", taskCreatedAt: "old-clock" }));
        state.execution.retryContext = { retryOf: "failed-task", attemptGroupId: "group", clientOperationId: "retry:authorized-once" };
        await executeAudioGeneration(state.execution, state.runTask);
        const request = state.requests[0],
            draft = request.metadata!.canvasTaskDraft as ReturnType<typeof import("@/lib/canvas/canvas-task-draft").canvasGenerationTaskDraft>;
        expect(request.clientOperationId).toBe("retry:authorized-once");
        expect(draft.requireExisting).toBe(true);
        expect(draft.node.id).toBe("source");
        expect(draft.node.metadata.taskId).toBe("failed-task");
        expect(draft.node.metadata.taskCreatedAt).toBeUndefined();
    });
    test("separate authorized generations on the same empty target use distinct submission identities", async () => {
        const state = fixture(source(CanvasNodeType.Audio));
        await executeAudioGeneration(state.execution, state.runTask);
        await executeAudioGeneration(state.execution, state.runTask);
        expect(state.requests[0].nodeId).toBe(state.requests[1].nodeId);
        expect(state.requests[0].clientOperationId).toBeTruthy();
        expect(state.requests[0].clientOperationId).not.toBe(state.requests[1].clientOperationId);
    });
    test("single image preserves old result and submits the new target before deferred React updates", async () => {
        const old = source(CanvasNodeType.Image, { content: "/api/resources/old/file", storageKey: "resource:old", status: "success" });
        const state = fixture(old);
        state.execution.generationConfig.count = "1";
        await executeImageGeneration(state.execution, state.runTask);
        const request = state.requests[0],
            draft = request.metadata!.canvasTaskDraft as ReturnType<typeof import("@/lib/canvas/canvas-task-draft").canvasGenerationTaskDraft>;
        expect(request.clientOperationId).toMatch(/^canvas-image:/);
        expect(draft.node.id).toBe(request.nodeId);
        expect(draft.node.id).not.toBe(old.id);
        expect(draft.node.metadata.storageKey).toBeUndefined();
        expect(state.drain().nodes.find((node) => node.id === old.id)?.metadata.storageKey).toBe("resource:old");
    });
    test("image batch child snapshots share the exact durable root and use separate submission identities", async () => {
        const state = fixture(source(CanvasNodeType.Config));
        state.execution.generationConfig.count = "3";
        await executeImageGeneration(state.execution, state.runTask);
        expect(state.requests).toHaveLength(3);
        expect(new Set(state.requests.map((input) => input.clientOperationId)).size).toBe(3);
        const saved = state.drain(),
            root = saved.nodes.find((node) => node.metadata?.isBatchRoot)!;
        expect(root.metadata!.batchChildIds).toEqual(state.requests.map((input) => input.nodeId));
        for (const request of state.requests) {
            const draft = request.metadata!.canvasTaskDraft as ReturnType<typeof import("@/lib/canvas/canvas-task-draft").canvasGenerationTaskDraft>;
            expect(draft.node.metadata.batchRootId).toBe(root.id);
            expect(draft.connections).toHaveLength(1);
            expect(draft.connections[0].fromNodeId).toBe(root.id);
        }
    });
    test("text in place binds the previous owned result and keeps it out of the new draft", async () => {
        const old = source(CanvasNodeType.Text, { content: "原来的正文", richText: "<p>原来的正文</p>", taskId: "previous-text-task", status: "success" });
        const state = fixture(old);
        await executeTextGeneration(state.execution, state.runTask);
        const request = state.requests[0],
            draft = request.metadata!.canvasTaskDraft as ReturnType<typeof import("@/lib/canvas/canvas-task-draft").canvasGenerationTaskDraft>;
        expect(draft.requireExisting).toBe(true);
        expect(draft.node.id).toBe(old.id);
        expect(draft.node.metadata.taskId).toBe("previous-text-task");
        expect(draft.node.metadata.content).toBeUndefined();
        expect(draft.node.metadata.richText).toBeUndefined();
    });
    test("text variants persist all target and edge snapshots even before React commits", async () => {
        const state = fixture(source(CanvasNodeType.Config, { textCount: 3 }));
        await executeTextGeneration(state.execution, state.runTask);
        expect(state.requests).toHaveLength(3);
        expect(new Set(state.requests.map((input) => input.clientOperationId)).size).toBe(3);
        const saved = state.drain();
        for (const request of state.requests) {
            const draft = request.metadata!.canvasTaskDraft as ReturnType<typeof import("@/lib/canvas/canvas-task-draft").canvasGenerationTaskDraft>;
            expect(saved.nodes.find((node) => node.id === request.nodeId)?.position).toEqual(draft.node.position);
            expect(saved.connections.find((edge) => edge.toNodeId === request.nodeId)).toEqual(draft.connections[0]);
        }
    });
    test("failed text variants finish all observers and clear every pending card", async () => {
        const state = fixture(source(CanvasNodeType.Config, { textCount: 3 }));
        let finished = 0;
        state.execution.finishGenerationRequest = () => {
            finished++;
        };
        await expect(
            executeTextGeneration(state.execution, async () => {
                throw new Error("整批未执行");
            }),
        ).rejects.toThrow("整批未执行");
        expect(finished).toBe(3);
        expect(
            state
                .drain()
                .nodes.filter((node) => node.id !== "source")
                .every((node) => node.metadata?.status === "error"),
        ).toBe(true);
    });
});
