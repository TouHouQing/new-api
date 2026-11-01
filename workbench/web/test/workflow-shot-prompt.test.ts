import { expect, test } from "bun:test";
import { workflowShotDescription, workflowShotPrompt } from "@/pages/production/detail/workflow-shot-prompt";

test("image generation uses the visible image prompt rather than a video draft or placeholder", () => {
    const prompt = workflowShotPrompt("storyboard", { imagePrompt: "阳光下的玻璃杯与绿植", videoPrompt: "镜头向前推进", plotDescription: "待补充分镜画面" });
    expect(prompt).toContain("阳光下的玻璃杯与绿植");
    expect(prompt).not.toContain("镜头向前推进");
    expect(prompt).not.toContain("待补充");
    expect(prompt).not.toContain("黑白");
});

test("video generation carries lens, movement, continuity and exclusion instructions", () => {
    const prompt = workflowShotPrompt("video", { videoPrompt: "轻风吹动叶片", imagePrompt: "静态草稿", shotSize: "近景", cameraAngle: "平视", cameraMovement: "推镜", continuityNotes: "保持蓝色花盆", negativePrompt: "画面闪烁" });
    for (const text of ["轻风吹动叶片", "近景", "平视", "推镜", "蓝色花盆", "避免：画面闪烁"]) expect(prompt).toContain(text);
    expect(prompt).not.toContain("静态草稿");
});

test("black-and-white is confined to the explicit previs stage", () => {
    expect(workflowShotPrompt("previz", { imagePrompt: "人物从门口走入" })).toContain("黑白动作预演");
    expect(workflowShotPrompt("storyboard", { imagePrompt: "人物从门口走入" })).not.toContain("黑白");
});

test("the first real description replaces the new-shot placeholder using the active input", () => {
    expect(workflowShotDescription({ plotDescription: "待补充分镜画面", imagePrompt: "玻璃杯中的绿植", videoPrompt: "推镜" }, "image")).toBe("玻璃杯中的绿植");
    expect(workflowShotDescription({ plotDescription: "", videoPrompt: "叶片缓缓摆动" }, "video")).toBe("叶片缓缓摆动");
});

test("a deliberate narrative description survives a prompt revision", () => {
    expect(workflowShotDescription({ plotDescription: "交代主人公的生活环境", imagePrompt: "新的画面指令" }, "image")).toBe("交代主人公的生活环境");
});
