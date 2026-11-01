import type { TimelineOutput } from "@/types/timeline";

const outputSizes: Record<string, readonly [number, number]> = {
    "16:9": [1920, 1080],
    "9:16": [1080, 1920],
    "1:1": [1080, 1080],
    "4:3": [1440, 1080],
    "3:4": [1080, 1440],
    "3:2": [1620, 1080],
    "2:3": [1080, 1620],
    "21:9": [2520, 1080],
    "9:21": [1080, 2520],
};

export function timelineOutputFormat(aspectRatio?: string, stored?: TimelineOutput): TimelineOutput {
    if (stored !== undefined) {
        if (
            !stored ||
            ![stored.width, stored.height, stored.fps].every(Number.isInteger) ||
            stored.width < 64 ||
            stored.width > 4096 ||
            stored.height < 64 ||
            stored.height > 4096 ||
            stored.width % 2 ||
            stored.height % 2 ||
            stored.fps < 12 ||
            stored.fps > 60 ||
            (stored.fit !== undefined && !["letterbox", "crop", "blur"].includes(stored.fit))
        )
            throw new Error("剪辑的画幅、帧率或画面适配设置无效，请重新设置");
        return { ...stored };
    }
    const ratio = aspectRatio?.trim() || "16:9";
    const size = outputSizes[ratio];
    if (!size) throw new Error(`暂不支持导出画幅 ${ratio}，请在项目设置中选择常用画幅`);
    return { width: size[0], height: size[1], fps: 30 };
}

export function timelineCaptionLineUnits(width: number) {
    return Math.min(76, Math.max(2, Math.floor((width * 0.9) / 22)));
}
