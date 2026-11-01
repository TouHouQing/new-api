import { isLocalSeparationConfig } from "@/lib/audio-generation";
import { modelOptionLabel, modelOptionsFromChannels, type AiConfig } from "@/stores/use-config-store";

export function audioSeparationModels(config: AiConfig) {
    return modelOptionsFromChannels(config.channels.filter((channel) => channel.scope === "system" && channel.enabled !== false))
        .filter((model) => isLocalSeparationConfig({ ...config, model }))
        .map((value) => ({ value, label: modelOptionLabel(config, value) }));
}

export function audioSeparationConfig(config: AiConfig, model: string, stems: string): AiConfig {
    if (!audioSeparationModels(config).some((item) => item.value === model)) throw new Error("声音分离服务尚未配置，请联系管理员启用本地分离模型");
    if (stems !== "pair" && stems !== "all") throw new Error("请选择人声与伴奏，或全部五轨");
    return { ...config, model, audioModel: model, audioStems: stems, audioFormat: "wav", audioVoice: "", audioInstructions: "", audioLanguage: "", taskWorkflowProvider: "model" };
}
