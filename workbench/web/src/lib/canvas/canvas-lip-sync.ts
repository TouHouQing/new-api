import { modelOptionLabel, modelOptionsFromChannels, resolveModelRequestConfig, type AiConfig } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export type LipSyncRegion = { x: number; y: number; width: number; height: number };
export type LipSyncPlan = {
    version: 1;
    sourceNodeId: string;
    audioNodeId: string;
    sourceStorageKey: string;
    audioStorageKey: string;
    sourceKind: "image" | "video";
    sourceSha256?: string;
    audioSha256?: string;
    selection: { version: 1; startMs: number; endMs: number; audioStartMs: number; region?: LipSyncRegion };
    rightsConfirmedFor: string[];
};
export const LOCAL_LIP_SYNC = "yingce-local-lip-sync";
export function lipSyncModels(config: AiConfig) {
    return modelOptionsFromChannels(config.channels.filter((c) => c.scope === "system" && c.enabled !== false))
        .filter((model) => resolveModelRequestConfig({ ...config, model }, model).interfaceType === LOCAL_LIP_SYNC)
        .map((value) => ({ value, label: modelOptionLabel(config, value) }));
}
export function lipSyncConfig(config: AiConfig, model: string, plan: LipSyncPlan): AiConfig {
    if (!lipSyncModels(config).some((item) => item.value === model)) throw Error("口型服务尚未启用，请联系管理员配置本地口型模型");
    const duration = plan.selection.endMs - plan.selection.startMs;
    if (!Number.isInteger(duration) || duration < 100 || duration > 30000) throw Error("请选择0.1–30秒的口型片段");
    return { ...config, model, videoModel: model, videoSeconds: String(Math.ceil(duration / 1000)), size: "original", vquality: "original", videoGenerateAudio: "true", videoWatermark: "false", count: "1", taskWorkflowProvider: "model" };
}
export function readLipSyncDraft(node: CanvasNodeData): LipSyncPlan | undefined {
    const value = node.metadata?.lipSyncDraft;
    if (!value || value.version !== 1 || value.sourceNodeId !== node.id || value.sourceStorageKey !== node.metadata?.storageKey || value.sourceKind !== node.type) return;
    return structuredClone(value);
}
export function validateLipSyncPlan(plan: LipSyncPlan, source: CanvasNodeData, audio: CanvasNodeData | undefined) {
    const s = plan.selection;
    if (
        !audio ||
        audio.type !== CanvasNodeType.Audio ||
        !source.metadata?.storageKey?.startsWith("resource:") ||
        audio.metadata?.storageKey !== plan.audioStorageKey ||
        plan.sourceStorageKey !== source.metadata.storageKey ||
        plan.sourceNodeId !== source.id ||
        plan.audioNodeId !== audio.id
    )
        throw Error("原画面或对白已变化，请重新选择");
    if (![s.startMs, s.endMs, s.audioStartMs].every(Number.isSafeInteger) || s.startMs < 0 || s.audioStartMs < 0 || s.endMs - s.startMs < 100 || s.endMs - s.startMs > 30000 || s.endMs > 3600000 || s.audioStartMs > 3600000)
        throw Error("请选择0.1–30秒的有效时间范围");
    if (source.type === CanvasNodeType.Image && s.startMs !== 0) throw Error("照片从0秒开始，请调整对白起点");
    if (source.type === CanvasNodeType.Video && source.metadata.durationMs && s.endMs > source.metadata.durationMs) throw Error("片段结束时间超过原视频");
    if (audio.metadata.durationMs && s.audioStartMs + s.endMs - s.startMs > audio.metadata.durationMs) throw Error("对白不能覆盖整个片段，请缩短时长或调整对白起点");
    if (plan.rightsConfirmedFor.length !== 2 || plan.rightsConfirmedFor[0] !== plan.sourceStorageKey || plan.rightsConfirmedFor[1] !== plan.audioStorageKey) throw Error("请确认所选画面与对白的使用权");
    if (s.region) {
        const r = s.region;
        if (!Object.values(r).every(Number.isSafeInteger) || r.x < 0 || r.y < 0 || r.width < 48 || r.height < 48 || r.x + r.width > (source.metadata.naturalWidth || 1280) || r.y + r.height > (source.metadata.naturalHeight || 1280))
            throw Error("请框选原画面内至少48像素的完整正面人物");
    }
}
