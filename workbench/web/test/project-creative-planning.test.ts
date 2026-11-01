import { expect, test } from "bun:test";
import { creativeBriefPrompt, emptyCreativeBrief, parseCreativeBrief, shotIntentionsFromRevision, shotIntentionPrompt } from "@/lib/project-creative-brief";
import { projectSettingsSource } from "@/pages/production/detail/project-settings-draft";
import { shotPlanIntentFromTask } from "@/pages/production/detail/shot-plan-adoption";
import type { Project, ShotRevision } from "@/services/api/projects";
import type { GenerationTask } from "@/services/api/task-center";

test("a persisted production brief carries audience, duration and constraints into planning", () => {
    const brief = { ...emptyCreativeBrief(), goal: "product" as const, audience: "第一次养猫的人", keyMessage: "正确饮水", targetDurationMs: 15000, constraints: ["保留商品原外观"] };
    const saved = parseCreativeBrief(JSON.stringify(brief));
    expect(saved).toEqual(brief);
    const prompt = creativeBriefPrompt(saved);
    for (const text of ["商品 / 广告", "第一次养猫的人", "15 秒", "正确饮水", "保留商品原外观"]) expect(prompt).toContain(text);
    for (const raw of ["{", "null", JSON.stringify({ ...brief, version: 2 }), JSON.stringify({ ...brief, targetDurationMs: NaN }), JSON.stringify({ ...brief, constraints: [123] })]) expect(parseCreativeBrief(raw)).toBeNull();
});
test("shot intention and fixed reference states survive revision rehydration", () => {
    const narrative = { purpose: "emotion" as const, information: "发现钥匙不见了", emotion: "紧张", visualBeat: "空口袋", continuityNeeds: "雨伞仍在左手" };
    const states = [{ assetVersionId: "fixed-version", wardrobe: "湿外套", emotion: "紧张", propState: "雨伞打开", note: "左手持伞", referenceResourceIds: ["fixed-image"] }];
    const result = shotIntentionsFromRevision({ narrativeJson: JSON.stringify(narrative), referenceStatesJson: JSON.stringify(states) } as ShotRevision);
    expect(result).toEqual({ narrative, referenceStates: states });
    const prompt = shotIntentionPrompt(result.narrative, result.referenceStates).join("\n");
    for (const value of ["表达情绪", "空口袋", "湿外套", "左手持伞"]) expect(prompt).toContain(value);
    expect(() => shotIntentionsFromRevision({ narrativeJson: "{" } as ShotRevision)).toThrow();
});
test("settings can rebase task progress without rebasing another editor's changes", () => {
    const base = { id: "project", name: "作品", description: "原简介", revision: 1, status: "active" } as Project;
    expect(projectSettingsSource({ ...base, revision: 8, coverResourceId: "new-cover" })).toBe(projectSettingsSource(base));
    for (const changed of [{ name: "新标题" }, { description: "另一个页面的简介" }, { creativeBriefJson: "{}" }, { defaultImageModel: "new-model" }, { status: "archived" }])
        expect(projectSettingsSource({ ...base, ...changed })).not.toBe(projectSettingsSource(base));
});
test("completed storyboard tasks retain their original adoption identity and fixed asset mapping", () => {
    const intent = {
        version: 1,
        requestId: "stable-confirmed-request",
        projectId: "project",
        unitId: "chapter",
        scope: "owner",
        expectedSourceSha256: "a".repeat(64),
        expectedShotIds: ["original-shot"],
        assetVersions: { prop: "version-1" },
        assetLabels: { prop: { title: "原道具", category: "prop" } },
    };
    const task = { inputJson: JSON.stringify({ metadata: { shotPlanIntent: intent } }) } as GenerationTask;
    expect(shotPlanIntentFromTask(task)).toEqual(intent);
    expect(shotPlanIntentFromTask({} as GenerationTask)).toBeNull();
    expect(() => shotPlanIntentFromTask({ inputJson: JSON.stringify({ metadata: { shotPlanIntent: { ...intent, expectedSourceSha256: "wrong" } } }) } as GenerationTask)).toThrow();
});

test("image and video intentions keep their own fixed reference stage", () => {
    const common = { assetVersionId: "version", wardrobe: "", emotion: "", propState: "", referenceResourceIds: [] };
    const states = [
        { ...common, stage: "image" as const, note: "图片阶段的参考" },
        { ...common, stage: "video" as const, note: "视频阶段的参考" },
    ];
    expect(shotIntentionPrompt(undefined, states, "image").join("\n")).toContain("图片阶段的参考");
    expect(shotIntentionPrompt(undefined, states, "image").join("\n")).not.toContain("视频阶段的参考");
    expect(shotIntentionPrompt(undefined, states, "video").join("\n")).not.toContain("图片阶段的参考");
    for (const value of [null, {}, [null], [{ ...common, stage: "unknown" }], [{ ...common, referenceResourceIds: [{}] }]]) expect(() => shotIntentionsFromRevision({ referenceStatesJson: JSON.stringify(value) } as ShotRevision)).toThrow();
});
