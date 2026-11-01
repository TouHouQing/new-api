import { describe, expect, test } from "bun:test";
import { readImageLayerPlanningDraft, type ImageLayerPlanningDraft } from "../src/lib/canvas/image-layer-planning-draft";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const draft: ImageLayerPlanningDraft = {
    version: 1,
    plan: {
        source: { sourceNodeId: "source", resourceId: "original", sha256: "a".repeat(64), width: 1600, height: 900, purpose: "materials" },
        layers: [
            { name: "原图", description: "底图", kind: "background", generation: { prompt: "保留", background: "opaque" }, extraction: { method: "source" } },
            { name: "手工改名", description: "左侧照片", kind: "object", bbox: [50, 167, 450, 878], generation: { prompt: "左侧照片", background: "transparent" }, extraction: { method: "source-region", shape: "rect" } },
        ],
    },
    prompt: "手工改过的要求",
    purpose: "materials",
    regions: [[20, 30, 600, 900]],
    selectedLayer: 1,
    plannerModel: "local-text",
    maxCredits: 0,
    planningMaxCredits: 0,
    generationConfig: { model: "local-image", imageModel: "local-image", size: "16:9", quality: "" },
};
const node = (value = draft): CanvasNodeData => ({ id: "source", type: CanvasNodeType.Image, metadata: { storageKey: "resource:original", imageLayerPlanningDraft: value } }) as CanvasNodeData;

describe("reviewed image planning draft", () => {
    test("retains edited layer names, exact bounds, prompts, purpose and budgets across JSON reopen", () => {
        const result = readImageLayerPlanningDraft(JSON.parse(JSON.stringify(node())));
        expect(result).toEqual(draft);
        result!.plan.layers[1].name = "changed later";
        expect(draft.plan.layers[1].name).toBe("手工改名");
    });
    test("does not restore reviewed edits onto another source or replaced original", () => {
        expect(readImageLayerPlanningDraft({ ...node(), id: "other" })).toBeUndefined();
        expect(readImageLayerPlanningDraft({ ...node(), metadata: { ...node().metadata, storageKey: "resource:new-original" } })).toBeUndefined();
        const changed = structuredClone(draft);
        changed.plan.source!.sha256 = "not-a-sha";
        expect(readImageLayerPlanningDraft(node(changed))).toBeUndefined();
    });
    test("ignores malformed drafts without breaking the dialog", () => {
        for (const patch of [{ selectedLayer: 100 }, { purpose: "recompose" }, { maxCredits: -1 }, { regions: [[10, 10, 5, 20]] }, { plan: { ...draft.plan, layers: [null, null] } }, { generationConfig: null }])
            expect(readImageLayerPlanningDraft(node({ ...draft, ...patch } as any))).toBeUndefined();
    });
});
