import { expect, test } from "bun:test";
import { shotVideoInput, shotVideoPrompt } from "@/pages/production/detail/workflow-video-input";
import type { ShotAssetReferenceContext } from "@/pages/production/detail/workflow-shot-references";
import type { ShotArtifact } from "@/services/api/projects";

const context: ShotAssetReferenceContext = {
    mentionReferences: [{ id: "reference", nodeId: "", assetId: "cat", kind: "character", label: "橘猫", title: "橘猫", active: true }],
    referenceImages: [{ id: "cat", name: "橘猫", type: "image/png", dataUrl: "", storageKey: "resource:cat-image" }],
    referenceAudios: [{ id: "voice", name: "角色声音", type: "audio/wav", storageKey: "resource:voice" }],
    assetReferences: [{ assetId: "cat", title: "橘猫", category: "character", imageIndex: 1 }],
    resolvedCharacterVersions: [{ assetId: "cat", versionId: "cat-v1" }],
};
const frame = { id: "board-v1", projectId: "project", shotId: "shot", type: "storyboard", version: 1, resourceId: "frame-image", status: "ready", selected: true, metadataJson: "{}", createdAt: "", updatedAt: "" } satisfies ShotArtifact;

test("a chosen storyboard is a fixed first frame, with no undeclared character image or voice", () => {
    const newer = { ...frame, id: "board-v2", version: 2, resourceId: "other-image" };
    const input = shotVideoInput("frame:board-v1", context, [newer, frame], "shot");
    expect(input.operation).toBe("image_to_video");
    expect(input.referenceImages.map((image) => [image.storageKey, image.role])).toEqual([["resource:frame-image", "first_frame"]]);
    expect(input.referenceAudios).toEqual([]);
    expect(input.resolvedCharacterVersions).toEqual([]);
    expect(input.frameArtifact?.version).toBe(1);
});

test("unavailable, foreign-shot and wrong-kind frames never fall back to text generation", () => {
    for (const artifacts of [[], [{ ...frame, archived: true }], [{ ...frame, status: "failed" }], [{ ...frame, status: "running" }], [{ ...frame, resourceId: "" }], [{ ...frame, shotId: "other" }], [{ ...frame, type: "video" }]]) {
        const input = shotVideoInput("frame:board-v1", context, artifacts, "shot");
        expect(input.error).toContain("首帧已不可用");
        expect(() => shotVideoPrompt("test", "", context, input)).toThrow("首帧已不可用");
    }
});

test("an explicitly chosen historical frame remains usable after script edits", () => {
    const input = shotVideoInput("frame:board-v1", context, [{ ...frame, status: "stale", selected: false }], "shot");
    expect(input.error).toBeUndefined();
    expect(input.frameArtifact?.status).toBe("stale");
    expect(input.referenceImages[0]?.storageKey).toBe("resource:frame-image");
});

test("first-frame prompting resolves names without claiming unsent reference images or voice", () => {
    const prompt = shotVideoPrompt("@[asset:cat] 向镜头走来", "你好", context, shotVideoInput("frame:board-v1", context, [frame], "shot"));
    expect(prompt).toContain("橘猫 向镜头走来");
    expect(prompt).toContain("以所提供的首帧");
    expect(prompt).not.toContain("图片1");
    expect(prompt).not.toContain("声音参考");
    expect(prompt.match(/你好/g)).toHaveLength(1);
});

test("asset reference mode preserves multimodal reference semantics and bound versions", () => {
    const input = shotVideoInput("assets", context, [frame], "shot");
    expect(input.operation).toBe("reference_to_video");
    expect(input.referenceImages[0]?.role).toBe("reference");
    expect(input.referenceAudios).toEqual(context.referenceAudios);
    expect(input.resolvedCharacterVersions).toEqual(context.resolvedCharacterVersions);
    expect(shotVideoPrompt("@[asset:cat]", "", context, input)).toContain("图片1");
});

test("text mode sends no media and rejects an unbound mention", () => {
    const input = shotVideoInput("text", context, [frame], "shot");
    expect(input.referenceImages).toEqual([]);
    expect(input.referenceAudios).toEqual([]);
    expect(input.operation).toBe("text_to_video");
    expect(() => shotVideoPrompt("@[asset:missing]", "", context, input)).toThrow("未绑定到当前镜头");
});

test("asset mode with an empty binding tells the user how to fix it", () => {
    expect(shotVideoInput("assets", { ...context, referenceImages: [] }, [], "shot").error).toContain("先绑定");
});

test("a single bound picture uses the first-frame contract on Wan without changing its resource", () => {
    const imageOnly = { ...context, referenceAudios: [] },
        input = shotVideoInput("assets", imageOnly, [], "shot", ["text_to_video", "image_to_video"]);
    expect(input.operation).toBe("image_to_video");
    expect(input.assetFirstFrame).toBe(true);
    expect(input.referenceImages.map((image) => [image.storageKey, image.role])).toEqual([["resource:cat-image", "first_frame"]]);
    expect(input.resolvedCharacterVersions).toEqual(context.resolvedCharacterVersions);
    const prompt = shotVideoPrompt("@[asset:cat] 轻轻转头", "", imageOnly, input);
    expect(prompt).toContain("绑定图片为首帧");
    expect(prompt).toContain("图片1");
    expect(prompt).not.toContain("声音参考");
});

test("single-image fallback never discards a bound voice or other images", () => {
    for (const value of [context, { ...context, referenceAudios: [], referenceImages: [...context.referenceImages, { ...context.referenceImages[0]!, id: "second", storageKey: "resource:second" }] }]) {
        const input = shotVideoInput("assets", value, [], "shot", ["image_to_video"]);
        expect(input.operation).toBe("reference_to_video");
        expect(input.assetFirstFrame).toBeUndefined();
        expect(input.referenceImages).toHaveLength(value.referenceImages.length);
        expect(input.referenceAudios).toEqual(value.referenceAudios);
    }
});

test("a model supporting both modes retains the asset reference contract", () => {
    const input = shotVideoInput("assets", { ...context, referenceAudios: [] }, [], "shot", ["image_to_video", "reference_to_video"]);
    expect(input.operation).toBe("reference_to_video");
    expect(input.referenceImages[0]?.role).toBe("reference");
    expect(input.assetFirstFrame).toBeUndefined();
});
