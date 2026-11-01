import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createEditorCommandRegistry, type EditCommand } from "../src/lib/timeline/editor-commands";
import { setTimelineCaptionLink, validateTimelineCaptionLinks } from "../src/lib/timeline/timeline-caption-links";
import type { TimelineProject } from "../src/types/timeline";

const fixture = JSON.parse(readFileSync(new URL("../../backend/internal/production/testdata/caption_links.golden.json", import.meta.url), "utf8"));
const audio = JSON.parse(readFileSync(new URL("../../backend/internal/production/testdata/audio_links.golden.json", import.meta.url), "utf8"));
const nested = () => ({ ...structuredClone(audio.base), clips: [...structuredClone(audio.base.clips), structuredClone(fixture.nestedCaption)] }) as TimelineProject;
for (const [group, base, cases] of [
    ["fractional", fixture.fractionalBase, fixture.fractionalCases],
    ["nested", nested(), fixture.nestedCases],
] as const) {
    for (const entry of cases)
        test(`manual caption clock · ${group} · ${entry.name}`, () => {
            const registry = createEditorCommandRegistry();
            let current = structuredClone(base) as TimelineProject;
            for (const { op, ...payload } of entry.commands) current = registry.apply(current, { op, payload } as EditCommand);
            const cues = current.clips.filter((clip) => clip.captionLink).sort((left, right) => left.startMs - right.startMs);
            expect(cues.map((clip) => [clip.startMs, clip.durationMs, clip.captionLink!.sourceStartMs, clip.captionLink!.sourceEndMs])).toEqual(entry.captions);
            expect(validateTimelineCaptionLinks(current)).toBe(current);
            expect(cues.every((cue) => current.clips.some((clip) => clip.id === cue.captionLink!.sourceClipId))).toBe(true);
            if (group === "nested") for (const id of ["music", "repeated-source", "caption"]) expect(current.clips.find((clip) => clip.id === id)).toEqual((base as TimelineProject).clips.find((clip) => clip.id === id));
        });
}
test("manual caption attachment is explicit, bounded and independent of transcript provenance", () => {
    const base = nested();
    const detached = setTimelineCaptionLink(base, { id: "manual-voice-cue" });
    expect(detached.clips.find((clip) => clip.id === "manual-voice-cue")?.captionLink).toBeUndefined();
    const attached = setTimelineCaptionLink(detached, { id: "manual-voice-cue", sourceClipId: "video" });
    expect(attached.clips.find((clip) => clip.id === "manual-voice-cue")?.captionLink).toEqual({ sourceClipId: "video", sourceStartMs: 2500, sourceEndMs: 4500 });
    expect(() => setTimelineCaptionLink(base, { id: "manual-voice-cue", sourceClipId: "missing" })).toThrow();
    expect(() => setTimelineCaptionLink(base, { id: "manual-voice-cue", sourceClipId: "repeated-source" })).toThrow();
    const transcript = structuredClone(base);
    transcript.clips.find((clip) => clip.id === "manual-voice-cue")!.productionBinding = { sourceClipId: "a", transcriptId: "text", transcriptRevisionId: "v1", transcriptSegmentId: "s1" };
    expect(() => validateTimelineCaptionLinks(transcript)).toThrow("文字稿来源");
    const locked = structuredClone(base);
    locked.tracks.find((track) => track.id === "captions")!.locked = true;
    expect(() => createEditorCommandRegistry().apply(locked, { op: "moveClip", payload: { id: "video", startMs: 3000 } })).toThrow("锁定");
});
