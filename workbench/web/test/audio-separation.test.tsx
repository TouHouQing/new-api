import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AudioSettingsPanel } from "@/components/audio-settings-panel";
import { audioSeparationConfig, audioSeparationModels } from "@/lib/canvas/canvas-audio-separation";
import { audioTaskOutputNodeId } from "@/lib/canvas/canvas-audio-task-results";
import { audioReferenceCapacity, modelCompatibilityError, modelRequestOptions } from "@/lib/model-selection";
import { defaultModelCapabilityConfig } from "@/lib/model-capabilities";
import { canvasThemes } from "@/lib/canvas-theme";
import { readNodeGenerationSpec, synchronizeGenerationSpec } from "@/lib/canvas/generation-contract";
import { createModelChannel, defaultConfig, encodeChannelModel } from "@/stores/use-config-store";
import { backendProviderConfig } from "@/services/api/generation-task";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

const spec = {
    version: 1,
    capability: "audio",
    inputs: { audio: { min: 1, max: 1 }, image: { min: 0, max: 0 }, video: { min: 0, max: 0 } },
    options: { audioStems: { values: ["pair", "all"] } },
    audio: defaultModelCapabilityConfig("yingce-local-separation").audio!,
};
const channel = createModelChannel({
    id: "local-separation",
    scope: "system",
    models: ["htdemucs"],
    interfaceType: "yingce-local-separation",
    modelCosts: [{ model: "htdemucs", logicalModelId: "separate", logicalCapabilitySpec: spec, capability: "audio", billingMode: "fixed_request", unitPriceMicrocredits: 0 }],
});
const selected = encodeChannelModel(channel.id, "htdemucs");
const config = { ...defaultConfig, model: selected, audioModel: selected, channels: [channel], audioStems: "all" };

describe("原生声音分离", () => {
    test("免费系统工具可选，未配置工具时不使用用户渠道替代", () => {
        expect(audioSeparationModels(config).map((item) => item.value)).toEqual([selected]);
        expect(audioSeparationConfig(config, selected, "all").audioStems).toBe("all");
        expect(() => audioSeparationConfig({ ...config, channels: [] }, selected, "all")).toThrow();
        expect(() => audioSeparationConfig({ ...config, channels: [{ ...channel, scope: "user" }] }, selected, "all")).toThrow();
        expect(() => audioSeparationConfig(config, selected, "download")).toThrow();
    });
    test("参数只显示分轨选择，任务只发送模型实际支持的参数", () => {
        const html = renderToStaticMarkup(<AudioSettingsPanel config={config} theme={Object.values(canvasThemes)[0]} onConfigChange={() => {}} />);
        expect(html).toContain('aria-label="分轨范围"');
        expect(html).toContain("人声与伴奏");
        expect(html).not.toContain('aria-label="渠道音色 ID"');
        expect(html).not.toContain('aria-label="配音音色"');
        expect(modelRequestOptions(config, "audio")).toEqual({ audioStems: "all" });
        expect(audioReferenceCapacity(config, selected)).toBe(1);
        expect(backendProviderConfig(config, "audio").audioStems).toBe("all");
        const speechChannel = createModelChannel({ id: "speech", models: ["chatterbox-multilingual"], interfaceType: "yingce-local-audio" });
        const speech = { ...config, channels: [speechChannel], model: encodeChannelModel(speechChannel.id, "chatterbox-multilingual") };
        expect(backendProviderConfig(speech, "audio").audioStems).toBeUndefined();
    });
    test("有效音频可进入原生路由，缺少原音频和未知模式被拦截", () => {
        const input = { textCount: 0, imageCount: 0, videoCount: 0, audioCount: 1, characterCount: 0 };
        expect(modelCompatibilityError(config, selected, { capability: "audio", input, options: { audioStems: "all" } })).toBe("");
        expect(modelCompatibilityError(config, selected, { capability: "audio", input: { ...input, audioCount: 0 }, options: { audioStems: "all" } })).not.toBe("");
        expect(modelCompatibilityError(config, selected, { capability: "audio", input, options: { audioStems: "unknown" } })).not.toBe("");
    });
    test("重开和重试保留分轨范围，长节点ID仍满足画布合同", () => {
        const node = { id: "audio", type: CanvasNodeType.Audio, metadata: {} } as CanvasNodeData;
        const changed = synchronizeGenerationSpec(node, { audioStems: "all" });
        const reopened = JSON.parse(JSON.stringify(changed));
        expect(readNodeGenerationSpec(reopened, "audio").options.audioStems).toBe("all");
        expect(audioTaskOutputNodeId("a".repeat(80), "task", 1).length).toBeLessThan(80);
        expect(audioTaskOutputNodeId("voice", "task", 1)).not.toBe(audioTaskOutputNodeId("voice", "task", 2));
        expect(audioTaskOutputNodeId("voice", "task", 1)).toBe("audio_822968a790dc6335");
    });
});
