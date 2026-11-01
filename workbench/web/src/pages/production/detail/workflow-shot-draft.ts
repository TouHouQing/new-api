export function shotDraftSignature(values: Record<string, unknown>): string {
    return JSON.stringify(
        Object.entries(values)
            .filter(([, value]) => value !== undefined)
            .sort(([left], [right]) => left.localeCompare(right)),
    );
}

export function shotDraftText(values: Record<string, unknown>): string {
    const labels: Record<string, string> = {
        title: "镜头名称",
        plotDescription: "剧情说明",
        action: "表演与动作",
        dialogue: "对白 / 旁白",
        shotSize: "景别",
        cameraAngle: "机位角度",
        cameraMovement: "运镜",
        durationSeconds: "时长（秒）",
        imagePrompt: "镜头画面",
        videoPrompt: "画面与运动",
        negativePrompt: "排除内容",
        continuityNotes: "接戏备注",
        actionBeats: "动作节拍",
        narrative: "镜头意图",
        referenceStates: "角色、场景与道具接戏状态",
    };
    return Object.entries(values)
        .filter(([, value]) => value !== undefined && value !== "")
        .map(([key, value]) => `${labels[key] || key}\n${typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}`)
        .join("\n\n");
}
