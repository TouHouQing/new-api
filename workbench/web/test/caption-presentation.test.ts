import { expect, test } from "bun:test";
import { captionPresentation, defaultCaptionPresentation, markCaptionHighlight, validateCaptionPresentation } from "../src/lib/timeline/caption-presentation";
import { createEditorCommandRegistry } from "../src/lib/timeline/editor-commands";
import type { TimelineClip, TimelineProject } from "../src/types/timeline";

const clip = (): TimelineClip => ({ id: "cue", kind: "subtitle", nodeId: "n", trackId: "s", startMs: 0, durationMs: 1000, text: "你好🌟世界" });
test("legacy caption styles resolve without altering original provenance or moving stale highlights", () => {
    const source = clip();
    source.subtitleEntryIndex = 7;
    source.subtitleStyle = { fontSize: 22, color: "#ff0000", position: "top", highlightEnabled: true, highlightAnimation: "wipe" };
    source.subtitleHighlights = [{ entryIndex: 7, start: 2, end: 4, sourceText: source.text!, highlightText: "🌟" }];
    const original = structuredClone(source),
        resolved = captionPresentation(source);
    expect(resolved).toMatchObject({ fontSize: 66, color: "#ff0000", position: "top", backgroundColor: "#00000000" });
    expect(resolved.highlights?.[0]).toMatchObject({ start: 2, end: 4, animation: "wipe" });
    expect(source).toEqual(original);
    expect(captionPresentation({ ...source, text: "后来校正的台词" }).highlights).toEqual([]);
});
test("UTF16 selection keeps a whole emoji, replaces overlaps and rejects malformed native appearance", () => {
    const source = clip(),
        first = markCaptionHighlight(source, 2, 4);
    expect(first.highlights?.[0].sourceText).toBe(source.text!);
    const replacement = markCaptionHighlight({ ...source, captionPresentation: first }, 0, 4);
    expect(replacement.highlights).toHaveLength(1);
    expect(replacement.highlights?.[0].start).toBe(0);
    expect(() => markCaptionHighlight(source, 3, 4)).toThrow();
    for (const value of [
        { ...first, color: "red:enable=1" },
        { ...first, fontSize: Infinity },
        { ...first, fontSzie: 80 },
        { ...first, highlights: [...first.highlights!, ...first.highlights!] },
    ])
        expect(() => validateCaptionPresentation(value, source.text!)).toThrow();
});
test("appearance and text commands change a concrete cue and retain immutable source and other occurrences", () => {
    const source = { ...clip(), captionPresentation: markCaptionHighlight(clip(), 2, 4) },
        other = { ...clip(), id: "other" };
    const initial: TimelineProject = { version: 2, tracks: [{ id: "s", kind: "subtitle", label: "字幕", order: 0 }], clips: [source, other], durationMs: 1000 };
    const registry = createEditorCommandRegistry(),
        edited = registry.apply(initial, { op: "setClipProperty", payload: { id: source.id, patch: { text: "独立校正" } } });
    expect(edited.clips[0].captionPresentation?.highlights).toEqual([]);
    expect(initial.clips[0].captionPresentation?.highlights).toHaveLength(1);
    expect(edited.clips[1]).toEqual(other);
    const styled = registry.apply(edited, { op: "setClipProperty", payload: { id: source.id, patch: { captionPresentation: { ...defaultCaptionPresentation(), color: "#ff0000", position: "top" } } } });
    expect(styled.clips[0].captionPresentation?.color).toBe("#ff0000");
    expect(styled.clips[1]).toEqual(other);
});
