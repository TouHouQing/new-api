import type { CaptionPresentation, CaptionPresentationHighlight, TimelineClip } from "@/types/timeline";

const color = /^#[\da-f]{6}([\da-f]{2})?$/i;
const bounded = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const invalid = () => {
    throw new Error("字幕外观无效，请核对字号、颜色、位置和重点文字范围");
};
export const defaultCaptionPresentation = (): CaptionPresentation => ({ version: 1, fontSize: 44, color: "#ffffff", position: "bottom", backgroundColor: "#00000099", padding: 10 });

export function validateCaptionPresentation(input: unknown, text: string): asserts input is CaptionPresentation {
    if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
    const value = input as CaptionPresentation;
    if (
        Object.keys(value).some((key) => !["version", "fontSize", "color", "position", "backgroundColor", "padding", "marginPercent", "highlights"].includes(key)) ||
        value.version !== 1 ||
        !bounded(value.fontSize, 12, 144) ||
        typeof value.color !== "string" ||
        !color.test(value.color) ||
        typeof value.backgroundColor !== "string" ||
        !color.test(value.backgroundColor) ||
        !["top", "center", "bottom"].includes(value.position) ||
        !bounded(value.padding, 0, 72) ||
        (value.marginPercent !== undefined && !bounded(value.marginPercent, 0, 25))
    )
        invalid();
    if (value.highlights !== undefined && (!Array.isArray(value.highlights) || value.highlights.length > 64)) invalid();
    let previous = 0;
    for (const highlight of value.highlights ?? []) {
        if (
            !highlight ||
            typeof highlight !== "object" ||
            Object.keys(highlight).some((key) => !["start", "end", "sourceText", "color", "backgroundColor", "paddingX", "paddingY", "radius", "animation"].includes(key)) ||
            !Number.isInteger(highlight.start) ||
            !Number.isInteger(highlight.end) ||
            highlight.start < previous ||
            highlight.start < 0 ||
            highlight.end <= highlight.start ||
            highlight.end > text.length ||
            highlight.sourceText !== text ||
            typeof highlight.color !== "string" ||
            !color.test(highlight.color) ||
            typeof highlight.backgroundColor !== "string" ||
            !color.test(highlight.backgroundColor) ||
            !bounded(highlight.paddingX, 0, 72) ||
            !bounded(highlight.paddingY, 0, 72) ||
            !bounded(highlight.radius, 0, 72) ||
            !["none", "pop", "wipe"].includes(highlight.animation)
        )
            invalid();
        const first = text.charCodeAt(highlight.start),
            last = text.charCodeAt(highlight.end - 1);
        if ((first >= 0xdc00 && first <= 0xdfff) || (last >= 0xd800 && last <= 0xdbff)) invalid();
        previous = highlight.end;
    }
}

export function captionPresentation(clip: TimelineClip): CaptionPresentation {
    const text = clip.text ?? "";
    if (clip.captionPresentation != null) {
        validateCaptionPresentation(clip.captionPresentation, text);
        return clip.captionPresentation;
    }
    const style = clip.subtitleStyle ?? clip.captionOrigin?.subtitleStyle;
    const result = defaultCaptionPresentation();
    if (!style) return clip.kind === "text" ? { ...result, position: "center" } : result;
    result.backgroundColor = "#00000000";
    result.padding = 0;
    if (style.fontSize !== undefined) result.fontSize = style.fontSize * 3;
    if (style.color !== undefined) result.color = style.color;
    if (style.position !== undefined) result.position = style.position;
    result.marginPercent = result.position === "bottom" ? 8 : 6;
    const entry = clip.subtitleEntryIndex ?? clip.captionOrigin?.entryIndex;
    if (style.highlightEnabled) {
        result.highlights = (clip.subtitleHighlights ?? clip.captionOrigin?.subtitleHighlights ?? [])
            .filter((row) => row.entryIndex === entry && row.sourceText === text)
            .map((row) => ({
                start: row.start,
                end: row.end,
                sourceText: text,
                color: style.highlightTextColor ?? "#ffd54a",
                backgroundColor: style.highlightBackgroundColor ?? "#111111",
                paddingX: (style.highlightPaddingX ?? 6) * 3,
                paddingY: (style.highlightPaddingY ?? 2) * 3,
                radius: (style.highlightRadius ?? 4) * 3,
                animation: style.highlightAnimation ?? "pop",
            }));
    }
    validateCaptionPresentation(result, text);
    return result;
}

export function markCaptionHighlight(clip: TimelineClip, start: number, end: number): CaptionPresentation {
    const current = captionPresentation(clip),
        text = clip.text ?? "";
    const added: CaptionPresentationHighlight = { start, end, sourceText: text, color: "#ffd54a", backgroundColor: "#111111", paddingX: 8, paddingY: 3, radius: 6, animation: "pop" };
    const result = { ...current, highlights: [...(current.highlights ?? []).filter((row) => row.end <= start || row.start >= end), added].sort((a, b) => a.start - b.start) };
    validateCaptionPresentation(result, text);
    return result;
}

export function captionTextParts(text: string, presentation: CaptionPresentation) {
    const parts: { text: string; highlight?: CaptionPresentationHighlight }[] = [];
    let start = 0;
    for (const highlight of presentation.highlights ?? []) {
        if (highlight.start > start) parts.push({ text: text.slice(start, highlight.start) });
        parts.push({ text: text.slice(highlight.start, highlight.end), highlight });
        start = highlight.end;
    }
    if (start < text.length) parts.push({ text: text.slice(start) });
    return parts;
}
