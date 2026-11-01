import { describe, expect, test } from "bun:test";

import { canvasResourceMentionToken } from "@/lib/canvas/canvas-resource-references";
import type { ProjectAsset, ProjectDetail } from "@/services/api/projects";
import { buildShotAssetReferenceContext, ensureShotAssetMentionPrompt, resolveShotAssetMentionPrompt } from "@/pages/production/detail/workflow-shot-references";

describe("workflow shot asset references", () => {
    test("builds ordered image references for bound media and characters", () => {
        const context = buildShotAssetReferenceContext(detail(), "shot-1");

        expect(context.mentionReferences.map((reference) => reference.label)).toEqual(["雨夜街道", "林默"]);
        expect(context.referenceImages.map((image) => image.id)).toEqual(["asset-scene", "asset-character"]);
        expect(context.referenceImages[1]?.storageKey).toBe("resource:character-cover");
    });

    test("resolves asset tokens to the submitted reference image order", () => {
        const context = buildShotAssetReferenceContext(detail(), "shot-1");
        const [scene, character] = context.mentionReferences;
        const prompt = `让 ${canvasResourceMentionToken(character)} 从 ${canvasResourceMentionToken(scene)} 走近镜头`;

        expect(resolveShotAssetMentionPrompt(prompt, context)).toContain("让 图片2 从 图片1 走近镜头");
    });

    test("rejects stale mentions after an asset is unbound", () => {
        const context = buildShotAssetReferenceContext(detail(), "shot-1");

        expect(() => resolveShotAssetMentionPrompt("跟随 @[asset:missing]", context)).toThrow("未绑定到当前镜头");
    });

    test("adds bound assets as editable mention tokens without duplicating existing mentions", () => {
        const context = buildShotAssetReferenceContext(detail(), "shot-1");
        const prompt = ensureShotAssetMentionPrompt("让 @[asset:asset-character] 走近镜头", context.mentionReferences);

        expect(prompt).toContain("@[asset:asset-character]");
        expect(prompt.match(/@\[asset:asset-character\]/g)).toHaveLength(1);
        expect(prompt).toContain("【场景与道具参考】\n雨夜街道：@[asset:asset-scene]");
    });
});

test("fixed historical reference never silently uses the current character image", () => {
    const value = detail();
    const reference = value.shotReferences.find((item) => item.assetVersionId === "version-character")!;
    reference.asset = value.assets.find((asset) => asset.id === "asset-character");
    reference.assetVersionId = "historical-version";
    reference.referencedVersion = { id: "historical-version", assetId: "asset-character", version: 1, representations: [] };
    const context = buildShotAssetReferenceContext(value, "shot-1");
    expect(context.referenceImages.some((image) => image.storageKey === "resource:character-cover")).toBe(false);
    expect(() => resolveShotAssetMentionPrompt("@[asset:asset-character]", context)).toThrow("未绑定到当前镜头");
});

test("stage-bound references pick the exact version and ignore audio representations", () => {
    const value = detail(),
        actor = value.assets.find((asset) => asset.id === "asset-character")!;
    const reference = value.shotReferences.find((item) => item.assetVersionId === "version-character")!;
    reference.asset = actor;
    reference.referencedVersion = {
        id: "version-character",
        assetId: actor.id,
        version: 2,
        representations: [
            { id: "audio", resourceId: "voice", mediaType: "audio", role: "primary" },
            { id: "video-stage", resourceId: "video-stage-image", mediaType: "image", role: "front" },
        ],
    };
    value.shotReferences.push({
        ...reference,
        id: "earlier",
        assetVersionId: "earlier-version",
        referencedVersion: { id: "earlier-version", assetId: actor.id, version: 1, representations: [{ id: "image-stage", resourceId: "image-stage-image", mediaType: "image", role: "primary" }] },
    });
    const common = { wardrobe: "", emotion: "", propState: "", note: "", referenceResourceIds: [] };
    const states = [
        { ...common, assetVersionId: "earlier-version", stage: "image" as const },
        { ...common, assetVersionId: "version-character", stage: "video" as const },
    ];
    const image = buildShotAssetReferenceContext(value, "shot-1", "image", states),
        video = buildShotAssetReferenceContext(value, "shot-1", "video", states);
    expect(image.referenceImages.some((item) => item.storageKey === "resource:image-stage-image")).toBe(true);
    expect(image.referenceImages.some((item) => item.storageKey === "resource:video-stage-image")).toBe(false);
    expect(video.referenceImages.some((item) => item.storageKey === "resource:video-stage-image")).toBe(true);
    expect(video.referenceImages.some((item) => item.storageKey === "resource:image-stage-image" || item.storageKey === "resource:voice")).toBe(false);
});

function detail(): ProjectDetail {
    const scene = {
        id: "asset-scene",
        title: "雨夜街道",
        mediaType: "image",
        category: "environment",
        status: "confirmed",
        primaryVersionId: "version-scene",
        versionCount: 1,
        usages: [],
        position: 0,
        storageKey: "resource:scene-image",
        updatedAt: "2026-08-29T00:00:00Z",
    } satisfies ProjectAsset;
    const character = {
        id: "asset-character",
        title: "林默",
        mediaType: "entity",
        category: "character",
        status: "confirmed",
        primaryVersionId: "version-character",
        versionCount: 1,
        usages: [],
        position: 1,
        updatedAt: "2026-08-29T00:00:00Z",
        character: {
            versionId: "version-character",
            version: 1,
            definition: {},
            representations: [{ id: "representation-1", resourceId: "character-cover", mediaType: "image", role: "primary" }],
            visualStatus: "ready",
            voiceStatus: "missing",
        },
    } satisfies ProjectAsset;
    const audio = {
        id: "asset-audio",
        title: "雨声",
        mediaType: "audio",
        category: "other",
        status: "confirmed",
        primaryVersionId: "version-audio",
        versionCount: 1,
        usages: [],
        position: 2,
        storageKey: "resource:rain-audio",
        updatedAt: "2026-08-29T00:00:00Z",
    } satisfies ProjectAsset;
    return {
        assets: [scene, character, audio],
        shotReferences: [
            { id: "reference-scene", shotId: "shot-1", assetVersionId: "version-scene", role: "reference", status: "linked", createdAt: "2026-08-29T00:00:00Z" },
            { id: "reference-character", shotId: "shot-1", assetVersionId: "version-character", role: "reference", status: "linked", createdAt: "2026-08-29T00:00:01Z" },
            { id: "reference-audio", shotId: "shot-1", assetVersionId: "version-audio", role: "reference", status: "linked", createdAt: "2026-08-29T00:00:02Z" },
            { id: "reference-other-shot", shotId: "shot-2", assetVersionId: "version-scene", role: "reference", status: "linked", createdAt: "2026-08-29T00:00:03Z" },
        ],
    } as ProjectDetail;
}
