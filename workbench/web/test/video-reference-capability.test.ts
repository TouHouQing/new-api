import { expect, test } from "bun:test";

import { defaultModelCapabilityConfig } from "../src/lib/model-capabilities";
import { modelCompatibilityError, modelGroupReferenceLimits, resolveCompatibleModel, resolveVideoOperationForModel, type ModelInputSummary } from "../src/lib/model-selection";
import { creationVideoConfig } from "../src/pages/create/creation-generation-config";
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
                externalBilling: true,
                newApiGroup: "video",
                billingMode: "per_second",
                unitPriceMicrocredits: 2,
                capabilityConfig: videoCapability("seedance-image-only", ["text_to_video", "image_to_video"], 9),
            },
            {
                model: "seedance-full-reference",
                displayName: "Seedance 参考族",
                capability: "video",
                externalBilling: true,
                newApiGroup: "video",
                billingMode: "per_second",
                unitPriceMicrocredits: 1,
                capabilityConfig: videoCapability("seedance-full-reference", ["text_to_video", "image_to_video", "reference_to_video"], 9),
            },
            {
                model: "text-only-video",
                displayName: "Seedance 参考族",
                capability: "video",
                externalBilling: true,
                newApiGroup: "video",
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

test("New API 视频模型不按本地多图能力拦截", () => {
    const config = referenceConfig();
    const imageOnly = "relay::seedance-image-only";

    expect(modelCompatibilityError(config, imageOnly, { capability: "video", input: threeImages })).toBe("");
    expect(resolveVideoOperationForModel(config, imageOnly, threeImages)).toBe("reference_to_video");
    expect(modelGroupReferenceLimits(config, imageOnly, "video", { capability: "video", input: threeImages })).toEqual({
        maxImages: Number.MAX_SAFE_INTEGER,
        maxVideos: Number.MAX_SAFE_INTEGER,
        maxAudios: Number.MAX_SAFE_INTEGER,
    });
});

test("New API 视频模型选择保持用户当前选择，不自动改选更便宜的模型", () => {
    const config = referenceConfig();
    const fullReference = "relay::seedance-full-reference";

    expect(modelCompatibilityError(config, fullReference, { capability: "video", input: threeImages })).toBe("");
    expect(resolveVideoOperationForModel(config, fullReference, threeImages)).toBe("reference_to_video");
    expect(resolveCompatibleModel(config, "relay::text-only-video", { capability: "video", input: threeImages })).toBe("relay::text-only-video");
});

test("参考视频、时长和参数能力交给上游判断", () => {
    const config = referenceConfig();
    const textOnly = "relay::text-only-video";
    const withVideo: ModelInputSummary = { ...threeImages, videoCount: 1 };

    expect(modelCompatibilityError(config, textOnly, { capability: "video", input: withVideo, videoSeconds: "120", options: { vquality: "8k" } })).toBe("");
    expect(resolveVideoOperationForModel(config, textOnly, withVideo)).toBe("reference_to_video");
});

test("New API 视频请求保留用户参数，不按本地能力配置归一化", () => {
    const config = { ...referenceConfig(), videoGenerateAudio: "true", videoWatermark: "true" };
    const request = creationVideoConfig(config, "relay::seedance-image-only", { ratio: "2:1", seconds: "120", videoQuality: "8k" });

    expect(request).toMatchObject({
        size: "2:1",
        videoSeconds: "120",
        vquality: "8k",
        videoGenerateAudio: "true",
        videoWatermark: "true",
    });
});
