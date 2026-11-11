import { expect, test } from "bun:test";

import { defaultModelCapabilityConfig } from "../src/lib/model-capabilities";
import { modelCompatibilityError, modelGroupReferenceLimits, resolveVideoOperationForModel, type ModelInputSummary } from "../src/lib/model-selection";
import { defaultConfig, type AiConfig, type ModelChannel } from "../src/stores/use-config-store";

function videoCapability(model: string, operations: string[], maxImages: number) {
    const capabilityConfig = defaultModelCapabilityConfig(undefined, model);
    capabilityConfig.video!.operations = operations;
    capabilityConfig.video!.references.maxImages = maxImages;
    return capabilityConfig;
}

function referenceConfig(): AiConfig {
    const imageOnly = "relay::seedance-image-only";
    const fullReference = "relay::seedance-full-reference";
    const textOnly = "relay::text-only-video";
    const channel: ModelChannel = {
        id: "relay",
        name: "视频分组",
        baseUrl: "/api",
        apiKey: "",
        apiFormat: "openai",
        scope: "system",
        models: ["seedance-image-only", "seedance-full-reference", "text-only-video"],
        modelCosts: [
            {
                model: "seedance-image-only",
                displayName: "Seedance 多图",
                capability: "video",
                billingMode: "per_second",
                unitPriceMicrocredits: 2,
                capabilityConfig: videoCapability("seedance-image-only", ["text_to_video", "image_to_video"], 9),
            },
            {
                model: "seedance-full-reference",
                displayName: "Seedance 参考族",
                capability: "video",
                billingMode: "per_second",
                unitPriceMicrocredits: 1,
                capabilityConfig: videoCapability("seedance-full-reference", ["text_to_video", "image_to_video", "reference_to_video"], 9),
            },
            {
                model: "text-only-video",
                displayName: "Seedance 参考族",
                capability: "video",
                billingMode: "per_second",
                unitPriceMicrocredits: 0,
                capabilityConfig: videoCapability("text-only-video", ["text_to_video"], 9),
            },
        ],
    };
    const models = [imageOnly, fullReference, textOnly];
    return { ...defaultConfig, channels: [channel], models, videoModels: models, model: models[0], videoModel: models[0] };
}

const threeImages: ModelInputSummary = {
    textCount: 1,
    imageCount: 3,
    videoCount: 0,
    audioCount: 0,
    characterCount: 0,
};

test("三张普通参考图可由只声明 image_to_video 的多图模型承接", () => {
    const config = referenceConfig();
    const imageOnly = "relay::seedance-image-only";

    expect(modelCompatibilityError(config, imageOnly, { capability: "video", input: threeImages })).toBe("");
    expect(resolveVideoOperationForModel(config, imageOnly, threeImages)).toBe("image_to_video");
    expect(modelGroupReferenceLimits(config, imageOnly, "video", { capability: "video", input: threeImages })).toEqual({
        maxImages: 9,
        maxVideos: 0,
        maxAudios: 0,
    });
});

test("支持全模态参考的模型继续使用 reference_to_video", () => {
    const config = referenceConfig();
    const fullReference = "relay::seedance-full-reference";

    expect(modelCompatibilityError(config, fullReference, { capability: "video", input: threeImages })).toBe("");
    expect(resolveVideoOperationForModel(config, fullReference, threeImages)).toBe("reference_to_video");
});

test("只有文本能力的视频模型仍会对参考图报错", () => {
    const config = referenceConfig();
    const textOnly = "relay::text-only-video";

    expect(modelCompatibilityError(config, textOnly, { capability: "video", input: threeImages })).toBe("不支持全模态参考");
});

test("参考视频不会因为图片降级规则被错误放行", () => {
    const config = referenceConfig();
    const imageOnly = "relay::seedance-image-only";
    const withVideo: ModelInputSummary = { ...threeImages, videoCount: 1 };

    expect(modelCompatibilityError(config, imageOnly, { capability: "video", input: withVideo })).toBe("最多支持 0 个参考视频");
    expect(resolveVideoOperationForModel(config, imageOnly, withVideo)).toBe("reference_to_video");
});
