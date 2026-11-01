import type { ProjectCreativeBrief, ShotNarrative, ShotReferenceState, ShotRevision } from "@/services/api/projects";

export const creativeGoals = [
    { value: "story", label: "故事 / 短剧" },
    { value: "product", label: "商品 / 广告" },
    { value: "explain", label: "知识 / 讲解" },
    { value: "presenter", label: "口播" },
    { value: "music", label: "音乐 / MV" },
    { value: "custom", label: "自定义" },
] as const;
export const narrativePurposes = [
    { value: "", label: "暂不设置" },
    { value: "opening", label: "吸引观众" },
    { value: "establish", label: "交代背景" },
    { value: "action", label: "推动行动" },
    { value: "emotion", label: "表达情绪" },
    { value: "benefit", label: "呈现利益点" },
    { value: "ending", label: "收束 / 引导" },
] as const;
export const emptyCreativeBrief = (): ProjectCreativeBrief => ({ version: 1, goal: "story", audience: "", keyMessage: "", targetDurationMs: 0, language: "", tone: "", constraints: [] });

export function parseCreativeBrief(raw?: string): ProjectCreativeBrief | null {
    if (!raw) return null;
    try {
        const value = JSON.parse(raw);
        if (value.version !== 1 || !creativeGoals.some((goal) => goal.value === value.goal) || !Number.isSafeInteger(value.targetDurationMs) || value.targetDurationMs < 0 || value.targetDurationMs > 3_600_000) return null;
        if (!["audience", "keyMessage", "language", "tone"].every((key) => typeof value[key] === "string") || (value.constraints != null && (!Array.isArray(value.constraints) || value.constraints.some((text: unknown) => typeof text !== "string"))))
            return null;
        return { ...value, constraints: value.constraints || [] };
    } catch {
        return null;
    }
}
export function shotIntentionsFromRevision(revision?: ShotRevision): { narrative?: ShotNarrative; referenceStates?: ShotReferenceState[] } {
    const result: { narrative?: ShotNarrative; referenceStates?: ShotReferenceState[] } = {};
    if (revision?.narrativeJson) {
        const value = JSON.parse(revision.narrativeJson);
        if (
            !value ||
            typeof value !== "object" ||
            Array.isArray(value) ||
            (value.purpose != null && !narrativePurposes.some((item) => item.value === value.purpose)) ||
            !["information", "emotion", "visualBeat", "continuityNeeds"].every((key) => value[key] == null || typeof value[key] === "string")
        )
            throw new Error("镜头意图记录无法读取，请核对原版本");
        result.narrative = value;
    }
    if (revision?.referenceStatesJson) {
        const values = JSON.parse(revision.referenceStatesJson);
        if (
            !Array.isArray(values) ||
            values.length > 32 ||
            values.some(
                (value) =>
                    !value ||
                    typeof value !== "object" ||
                    typeof value.assetVersionId !== "string" ||
                    !value.assetVersionId ||
                    (value.stage != null && !["", "image", "video"].includes(value.stage)) ||
                    !["wardrobe", "emotion", "propState", "note"].every((key) => value[key] == null || typeof value[key] === "string") ||
                    (value.referenceResourceIds != null && (!Array.isArray(value.referenceResourceIds) || value.referenceResourceIds.some((id: unknown) => typeof id !== "string" || !id))),
            )
        )
            throw new Error("镜头接戏记录无法读取，请核对原版本");
        result.referenceStates = values.map((value) => ({ ...value, referenceResourceIds: value.referenceResourceIds || [] }));
    }
    return result;
}
export function creativeBriefPrompt(brief?: ProjectCreativeBrief | null): string {
    if (!brief) return "";
    return [
        `作品类型：${creativeGoals.find((value) => value.value === brief.goal)?.label || brief.goal}`,
        brief.audience && `目标观众：${brief.audience}`,
        brief.keyMessage && `核心信息：${brief.keyMessage}`,
        brief.targetDurationMs > 0 && `成片目标时长：${brief.targetDurationMs / 1000} 秒；规划镜头时长总和并保留剪辑余量`,
        brief.language && `语言：${brief.language}`,
        brief.tone && `情绪与语气：${brief.tone}`,
        ...brief.constraints.map((value) => `必须遵守：${value}`),
    ]
        .filter(Boolean)
        .join("\n");
}
export function shotIntentionPrompt(narrative?: ShotNarrative, states?: ShotReferenceState[], stage?: "image" | "video"): string[] {
    const lines: string[] = [];
    if (narrative?.purpose) lines.push(`镜头目的：${narrativePurposes.find((item) => item.value === narrative.purpose)?.label || narrative.purpose}`);
    for (const [label, value] of [
        ["观众需要理解", narrative?.information],
        ["情绪变化", narrative?.emotion],
        ["画面重点", narrative?.visualBeat],
        ["前后镜延续", narrative?.continuityNeeds],
    ])
        if (value?.trim()) lines.push(`${label}：${value.trim()}`);
    for (const [index, state] of (states || []).entries()) {
        if (stage && state.stage && state.stage !== stage) continue;
        const details = [
            ["衣着", state.wardrobe],
            ["情绪", state.emotion],
            ["道具状态", state.propState],
            ["接戏说明", state.note],
        ]
            .filter(([, text]) => text?.trim())
            .map(([label, text]) => `${label}：${text}`);
        if (details.length) lines.push(`参考设定 ${index + 1}${state.stage ? `（${state.stage === "image" ? "图片" : "视频"}阶段）` : ""}：${details.join("；")}`);
    }
    return lines;
}
