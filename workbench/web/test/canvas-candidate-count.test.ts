import { expect, test } from "bun:test";
import { buildGenerationConfig } from "@/lib/canvas/canvas-project-generation";
import { buildNodeConfig } from "@/components/canvas/canvas-node-prompt-config";
import { defaultModelCapabilityConfig } from "@/lib/model-capabilities";
import { defaultConfig, type AiConfig, type ModelChannel } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { backendProviderConfig } from "@/services/api/generation-task";

test("canvas candidate count survives a model limited to one image per request", () => {
    const capabilityConfig = defaultModelCapabilityConfig("openai-image", "gpt-image-1");
    capabilityConfig.image!.maxOutputs = 1;
    for (const field of capabilityConfig.image!.parameters || []) if (field.name === "count") field.max = 1;
    const channel: ModelChannel = {
        id: "one-image",
        name: "逐张生成",
        apiFormat: "openai",
        interfaceType: "openai-image",
        baseUrl: "/api",
        apiKey: "",
        scope: "system",
        models: ["gpt-image-1"],
        modelCosts: [{ model: "gpt-image-1", capability: "image", billingMode: "fixed_request", unitPriceMicrocredits: 100, capabilityConfig }],
    };
    const config: AiConfig = { ...defaultConfig, channels: [channel], model: "one-image::gpt-image-1", imageModel: "one-image::gpt-image-1", size: "1024x1024", canvasImageCount: "1" };
    const node: CanvasNodeData = { id: "root", type: CanvasNodeType.Image, title: "候选图片", position: { x: 0, y: 0 }, width: 300, height: 300, metadata: { model: config.model, count: 3, size: "1024x1024" } };
    const requirements = { capability: "image" as const, input: { textCount: 1, imageCount: 0, videoCount: 0, audioCount: 0, characterCount: 0 } };
    expect(buildNodeConfig(config, node, "image", requirements).count).toBe("3");
    expect(buildGenerationConfig(config, node, "image", requirements).count).toBe("3");
    expect(capabilityConfig.image!.maxOutputs).toBe(1);
    const provider = backendProviderConfig({ ...config, count: "1" }, "image");
    expect(provider.channelId).toBe(channel.id);
    expect(provider.apiKey).toBe("");
    expect(provider.secretKey).toBe("");
});
