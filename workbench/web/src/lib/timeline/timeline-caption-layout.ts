import type { TimelineClip } from "@/types/timeline";

export function wrapTimelineCaption(text: string, lineUnits = 76) {
    const lines: string[] = [];
    for (const input of text.trim().replace(/\r\n/g, "\n").split("\n")) {
        let line = "";
        let units = 0;
        for (const character of input) {
            const width = (character.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1;
            if (units + width > lineUnits) {
                lines.push(line);
                line = "";
                units = 0;
            }
            line += character;
            units += width;
        }
        lines.push(line);
    }
    if (lines.length > 3) throw new Error("单条字幕超过三行，请拆分字幕后导出");
    return lines;
}

export function timelineCaptionPlacements(clips: TimelineClip[], lineUnits = 76) {
    const ordered = clips.filter((clip) => clip.kind === "subtitle").sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
    const ends: number[] = [];
    const heights: number[] = [];
    const placements = new Map<string, { text: string; lane: number; offset: number }>();
    for (const clip of ordered) {
        const lines = wrapTimelineCaption(clip.text ?? "", lineUnits);
        let lane = 0;
        while (lane < ends.length && ends[lane] > clip.startMs) lane++;
        if (lane >= 4) throw new Error("同时显示的字幕超过四条，请整理字幕或隐藏多余轨道");
        ends[lane] = clip.startMs + clip.durationMs;
        heights[lane] = Math.max(heights[lane] ?? 0, lines.length * 54 + 14);
        placements.set(clip.id, { text: lines.join("\n"), lane, offset: 64 });
    }
    for (const placement of placements.values()) for (let lane = 0; lane < placement.lane; lane++) placement.offset += heights[lane];
    return placements;
}
