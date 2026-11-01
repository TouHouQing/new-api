import type { ShotArtifact } from "@/services/api/projects";
import { resourceFileUrl, resourceStorageKey } from "@/services/api/resources";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio } from "@/types/media";
import { resolveShotAssetMentionPrompt, type ShotAssetReferenceContext } from "./workflow-shot-references";

export type ShotVideoInput = {
    referenceImages: ReferenceImage[];
    referenceAudios: ReferenceAudio[];
    operation: "text_to_video" | "image_to_video" | "reference_to_video";
    resolvedCharacterVersions: ShotAssetReferenceContext["resolvedCharacterVersions"];
    frameArtifact?: ShotArtifact;
    assetFirstFrame?: boolean;
    error?: string;
};

export function shotVideoInput(source: string, context: ShotAssetReferenceContext, artifacts: ShotArtifact[], shotId: string, operations?: readonly string[]): ShotVideoInput {
    const empty: ShotVideoInput = { referenceImages: [], referenceAudios: [], operation: "text_to_video", resolvedCharacterVersions: [] };
    if (source === "text") return empty;
    // Single-image models consume the bound image as a first frame. Never
    // reduce multiple pictures or drop a character's bound voice to fit them.
    if (source === "assets" && context.referenceImages.length === 1 && !context.referenceAudios.length && operations?.includes("image_to_video") && !operations.includes("reference_to_video"))
        return {
            referenceImages: context.referenceImages.map((image) => ({ ...image, role: "first_frame" })),
            referenceAudios: [],
            operation: "image_to_video",
            resolvedCharacterVersions: context.resolvedCharacterVersions,
            assetFirstFrame: true,
        };
    if (source === "assets")
        return {
            referenceImages: context.referenceImages.map((image) => ({ ...image, role: "reference" })),
            referenceAudios: context.referenceAudios,
            operation: "reference_to_video",
            resolvedCharacterVersions: context.resolvedCharacterVersions,
            ...(!context.referenceImages.length ? { error: "先绑定有图片的角色、场景或道具，再使用资产参考" } : {}),
        };
    const artifact = artifacts.find((item) => source === `frame:${item.id}` && item.shotId === shotId && ["storyboard", "start_frame"].includes(item.type));
    if (!artifact?.resourceId || artifact.archived || !["ready", "stale"].includes(artifact.status)) return { ...empty, error: "所选首帧已不可用，请重新选择一版已完成的分镜图或首帧" };
    return {
        ...empty,
        operation: "image_to_video",
        frameArtifact: artifact,
        referenceImages: [{ id: `shot-frame:${artifact.id}`, name: `分镜首帧 v${artifact.version}`, type: "image/*", dataUrl: "", role: "first_frame", storageKey: resourceStorageKey(artifact.resourceId), url: resourceFileUrl(artifact.resourceId) }],
    };
}

export function shotVideoPrompt(prompt: string, dialogue: string, context: ShotAssetReferenceContext, input: ShotVideoInput): string {
    if (input.error) throw new Error(input.error);
    if (input.assetFirstFrame) return ["以所提供的绑定图片为首帧，保持主体、构图与画面风格。", resolveShotAssetMentionPrompt(prompt, context, { dialogue })].join("\n\n");
    if (input.operation === "reference_to_video") return resolveShotAssetMentionPrompt(prompt, context, { dialogue });
    // Asset names remain useful in the script, but no unsubmitted image/audio is claimed as model input.
    const names = new Map(context.mentionReferences.map((reference) => [reference.assetId, reference.title || reference.label]));
    const text = prompt.replace(/@\[asset:([^\]]+)\]/g, (token, assetId: string) => {
        const title = names.get(assetId);
        if (!title) throw new Error(`提示词中的 ${token} 未绑定到当前镜头，请重新选择资产或删除引用`);
        return title;
    });
    return [input.frameArtifact ? "以所提供的首帧为画面起点，保持主体、构图与画面风格。" : "", text.trim(), dialogue.trim() ? `【镜头台词】\n${dialogue.trim()}` : ""].filter(Boolean).join("\n\n");
}
