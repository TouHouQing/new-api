import { describe, expect, test } from "bun:test";
import { canvasImageEditSubmission } from "@/lib/canvas/canvas-image-edit-submission";
import { defaultConfig } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

const target = (id = "edit-output"): CanvasNodeData => ({ id, type: CanvasNodeType.Image, title: "视角修改", position: { x: 300, y: 40 }, width: 512, height: 512, metadata: { prompt: "保持主体", status: "loading" } });
const base = () => ({
    projectId: "native-canvas",
    target: target(),
    connections: [{ id: "edge", fromNodeId: "source", toNodeId: "edit-output", fromPort: "image" }],
    config: defaultConfig,
    prompt: "保持主体",
    referenceImages: [{ id: "source", name: "原图", type: "image/png", storageKey: "resource:original", url: "/api/resources/original/file" }],
    metadata: { sourceNodeId: "source", edit: "angle" },
});

describe("manual image edit admission", () => {
    test("the exact new target and incoming edge exist before React updates", () => {
        const input = base(),
            submission = canvasImageEditSubmission(input);
        const draft = submission.metadata!.canvasTaskDraft as { node: CanvasNodeData; connections: typeof input.connections; requireExisting: boolean };
        expect(submission.mode).toBe("image");
        expect(submission.nodeId).toBe(input.target.id);
        expect(draft.node).toMatchObject(input.target);
        expect(draft.connections).toEqual(input.connections);
        expect(draft.requireExisting).toBe(false);
        input.target.position.x = 1000;
        expect(draft.node.position.x).toBe(300);
        expect(submission.metadata!.sourceNodeId).toBe("source");
    });
    test("one new target keeps its intent while a separate edit uses a separate identity", () => {
        expect(canvasImageEditSubmission(base()).clientOperationId).toBe(canvasImageEditSubmission(base()).clientOperationId);
        expect(canvasImageEditSubmission({ ...base(), target: target("other-output") }).clientOperationId).not.toBe(canvasImageEditSubmission(base()).clientOperationId);
    });
    test("an unsaved canvas or a non-image target cannot enter image admission", () => {
        expect(() => canvasImageEditSubmission({ ...base(), projectId: "" })).toThrow("保存");
        expect(() => canvasImageEditSubmission({ ...base(), target: { ...target(), type: CanvasNodeType.Text } })).toThrow("图片");
    });
});
