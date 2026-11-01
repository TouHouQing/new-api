// SPDX-License-Identifier: AGPL-3.0-or-later
// Formulas adapted from New API, Copyright (C) 2023-2026 QuantumNous.
import type { TimelineClip, TimelineMotionGraphic, TimelineProject } from "@/types/timeline";

const keys = new Set(["version", "kind", "x", "y", "size", "color", "fontFamily", "icon", "shape", "resourceId", "animation", "bpm", "phaseOffsetMs", "phaseDurationMs"]);
export function validateMotionGraphic(value: unknown): asserts value is TimelineMotionGraphic {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !keys.has(key))) throw new Error("叠层设置包含未知字段");
    const g = value as TimelineMotionGraphic;
    if (
        g.version !== 1 ||
        !["text", "icon", "shape", "image"].includes(g.kind) ||
        !Number.isFinite(g.x) ||
        g.x < 0 ||
        g.x > 1 ||
        !Number.isFinite(g.y) ||
        g.y < 0 ||
        g.y > 1 ||
        !Number.isInteger(g.size) ||
        g.size < 12 ||
        g.size > 300 ||
        !/^#[a-f0-9]{6}$/i.test(g.color) ||
        !Number.isInteger(g.bpm) ||
        g.bpm < 30 ||
        g.bpm > 240 ||
        !Number.isInteger(g.phaseDurationMs) ||
        g.phaseDurationMs < 1 ||
        g.phaseDurationMs > 3600000 ||
        (g.phaseOffsetMs !== undefined && (!Number.isInteger(g.phaseOffsetMs) || g.phaseOffsetMs < 0 || g.phaseOffsetMs > 3600000))
    )
        throw new Error("叠层的类型、位置、大小、颜色或时间设置无效");
    if ((g.fontFamily !== undefined && !["sans", "serif"].includes(g.fontFamily)) || (g.icon !== undefined && !["spark", "play", "heart", "check", "arrow"].includes(g.icon)) || (g.shape !== undefined && !["square", "circle"].includes(g.shape)))
        throw new Error("叠层的字体或图形类型无效");
    if (!(["none", "fade", "slide", "pulse", "bounce", "rotate", "morph"] as string[]).includes(g.animation) || (g.animation === "morph" && g.kind !== "shape")) throw new Error("变形动画需要形状叠层");
    if (g.kind === "image" ? typeof g.resourceId !== "string" || !g.resourceId || g.resourceId.length > 80 || /[\x00-\x1f]/.test(g.resourceId) : g.resourceId !== undefined && g.resourceId !== "") throw new Error("图片叠层需要固定的素材编号");
}

export function validateTimelineGraphics(project: TimelineProject) {
    for (const clip of project.clips) {
        if (clip.graphic === undefined) continue;
        validateMotionGraphic(clip.graphic);
        if (
            clip.kind !== "text" ||
            typeof clip.text !== "string" ||
            Array.from(clip.text).length > 2000 ||
            (clip.graphic.kind === "text" && !clip.text) ||
            clip.captionPresentation !== undefined ||
            clip.subtitleStyle !== undefined ||
            clip.subtitleHighlights !== undefined ||
            clip.captionOrigin !== undefined ||
            clip.captionLink !== undefined
        )
            throw new Error("标题叠层与字幕设置不能混用");
    }
    return project;
}

export function addTimelineGraphic(project: TimelineProject, payload: unknown): TimelineProject {
    if (!payload || typeof payload !== "object") throw new Error("请提供叠层内容");
    const value = payload as { id: string; startMs: number; durationMs: number; text: string; graphic: TimelineMotionGraphic; trackId?: string };
    if (
        Object.keys(value).some((key) => !["id", "startMs", "durationMs", "text", "graphic", "trackId"].includes(key)) ||
        typeof value.id !== "string" ||
        !value.id ||
        value.id.length > 128 ||
        project.clips.some((clip) => clip.id === value.id) ||
        !Number.isSafeInteger(value.startMs) ||
        value.startMs < 0 ||
        !Number.isSafeInteger(value.durationMs) ||
        value.durationMs <= 0 ||
        value.startMs + value.durationMs > 86400000
    )
        throw new Error("叠层编号或时间范围无效");
    validateMotionGraphic(value.graphic);
    let tracks = project.tracks,
        track = value.trackId ? tracks.find((track) => track.id === value.trackId) : tracks.find((track) => track.kind === "text" && !track.locked);
    if (value.trackId && (!track || track.kind !== "text" || track.locked)) throw new Error("请选择未锁定的标题轨道");
    if (!track) {
        if (tracks.length >= 64) throw new Error("轨道数量已达上限，请先整理轨道");
        let id = "graphic-track",
            suffix = 2;
        while (tracks.some((track) => track.id === id)) id = `graphic-track-${suffix++}`;
        track = { id, kind: "text", label: "标题与叠层", order: Math.min(0, ...tracks.map((track) => track.order)) - 1 };
        tracks = [...tracks, track];
    }
    const clip: TimelineClip = {
        id: value.id,
        kind: "text",
        trackId: track.id,
        nodeId: `graphic:${value.id}`,
        startMs: value.startMs,
        durationMs: value.durationMs,
        text: value.text,
        title: Array.from(value.text || "叠层")
            .slice(0, 40)
            .join(""),
        graphic: { ...value.graphic },
    };
    return validateTimelineGraphics({ ...project, tracks, clips: [...project.clips, clip], durationMs: Math.max(project.durationMs, clip.startMs + clip.durationMs) });
}

export function setTimelineGraphic(project: TimelineProject, payload: unknown): TimelineProject {
    if (!payload || typeof payload !== "object") throw new Error("请选择叠层");
    const value = payload as { id: string; graphic: TimelineMotionGraphic; restart?: boolean };
    if (Object.keys(value).some((key) => !["id", "graphic", "restart"].includes(key)) || (value.restart !== undefined && typeof value.restart !== "boolean")) throw new Error("叠层编辑参数无效");
    const clip = project.clips.find((clip) => clip.id === value.id);
    if (!clip?.graphic || clip.kind !== "text") throw new Error("请选择现有的标题或图形叠层");
    if (project.tracks.find((track) => track.id === clip.trackId)?.locked) throw new Error("叠层轨道已锁定，请先解锁");
    validateMotionGraphic(value.graphic);
    const graphic = value.restart ? { ...value.graphic, phaseOffsetMs: 0, phaseDurationMs: clip.durationMs } : { ...value.graphic };
    return validateTimelineGraphics({ ...project, clips: project.clips.map((row) => (row.id === clip.id ? { ...row, graphic, ...(value.restart ? { sourceStartMs: 0 } : {}) } : row)) });
}

export function sampleTimelineGraphic(graphic: TimelineMotionGraphic, clip: Pick<TimelineClip, "startMs" | "durationMs" | "sourceStartMs">, programMs: number, width: number, height: number) {
    const visible = programMs >= clip.startMs && programMs < clip.startMs + clip.durationMs;
    let x = graphic.x * width,
        y = graphic.y * height,
        opacity = 0,
        scale = 1,
        rotation = 0,
        radius = 0;
    if (!visible) return { visible, x, y, opacity, scale, rotation, radius };
    const t = (programMs - clip.startMs + (clip.sourceStartMs || 0) + (graphic.phaseOffsetMs || 0)) / 1000,
        beat = ((2 * Math.PI * graphic.bpm) / 60) * t;
    opacity = Math.max(0, Math.min(1, t / 0.4, (graphic.phaseDurationMs / 1000 - t) / 0.4));
    if (graphic.shape === "circle") radius = graphic.size / 2;
    if (graphic.animation === "none") opacity = 1;
    if (graphic.animation === "slide") x -= width * (1 - Math.min(1, t / 0.6));
    if (graphic.animation === "pulse") {
        scale = 0.85 + 0.15 * Math.sin(beat);
        opacity = 0.6 + 0.4 * Math.sin(beat);
    }
    if (graphic.animation === "bounce") y -= height * 0.08 * Math.abs(Math.sin(beat));
    if (graphic.animation === "rotate") rotation = t * graphic.bpm * 6;
    if (graphic.animation === "morph") radius = (graphic.size / 4) * (1 + Math.sin(beat));
    return { visible, x, y, opacity, scale, rotation, radius };
}
