import type { ShotRevisionInput } from "@/services/api/projects";
import { shotIntentionPrompt } from "@/lib/project-creative-brief";

type Fields = Partial<ShotRevisionInput>;

export function workflowShotDescription(values: Fields, mode: "image" | "video"): string {
    const description = values.plotDescription?.trim() || "";
    if (description && description !== "待补充分镜画面") return description;
    return (mode === "image" ? values.imagePrompt : values.videoPrompt)?.trim() || description;
}

export function workflowShotPrompt(stage: "storyboard" | "previz" | "video", values: Fields): string {
    const video = stage === "video";
    return [
        (video ? values.videoPrompt : values.imagePrompt) || values.plotDescription,
        values.action,
        values.shotSize ? `景别：${values.shotSize}` : "",
        values.cameraAngle ? `机位：${values.cameraAngle}` : "",
        video && values.cameraMovement ? `运镜：${values.cameraMovement}` : "",
        stage === "previz" ? "黑白动作预演，清晰动作节拍，电影构图" : !video ? "电影构图，主体清晰，场景层次明确" : "",
        values.continuityNotes,
        ...shotIntentionPrompt(values.narrative, values.referenceStates, video ? "video" : "image"),
        values.negativePrompt?.trim() ? `避免：${values.negativePrompt.trim()}` : "",
    ]
        .filter(Boolean)
        .join("\n");
}
