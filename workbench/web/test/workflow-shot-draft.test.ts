import { expect, test } from "bun:test";
import { shotDraftSignature, shotDraftText } from "@/pages/production/detail/workflow-shot-draft";

test("draft export preserves Chinese text, timing, inactive prompts and action beats", () => {
    const values = { title: "雨中重逢", dialogue: "你终于来了。\n嗯。", durationSeconds: 0, imagePrompt: "雨巷", videoPrompt: "缓慢推近", actionBeats: [{ time: 0.5, action: "回头" }], negativePrompt: "", cameraAngle: undefined };
    const exported = shotDraftText(values);
    for (const text of ["镜头名称\n雨中重逢", "对白 / 旁白\n你终于来了。\n嗯。", "时长（秒）\n0", "镜头画面\n雨巷", "画面与运动\n缓慢推近", '"action": "回头"']) expect(exported).toContain(text);
    expect(exported).not.toContain("undefined");
    expect(exported).not.toContain("排除内容");
});

test("a field registration order change does not dirty a saved draft, but new input does", () => {
    const submitted = { title: "窗边植物", videoPrompt: "叶片晃动", cameraAngle: undefined };
    expect(shotDraftSignature({ videoPrompt: "叶片晃动", title: "窗边植物" })).toBe(shotDraftSignature(submitted));
    expect(shotDraftSignature({ ...submitted, videoPrompt: "叶片微微晃动" })).not.toBe(shotDraftSignature(submitted));
});
