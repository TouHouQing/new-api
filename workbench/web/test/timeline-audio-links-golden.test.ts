import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createEditorCommandRegistry } from "../src/lib/timeline/editor-commands";
import type { TimelineProject } from "../src/types/timeline";

const fixture = JSON.parse(readFileSync(new URL("../../backend/internal/production/testdata/audio_links.golden.json", import.meta.url), "utf8")) as {
    base: TimelineProject;
    cases: {
        name: string;
        mode?: "clip";
        audioRate?: number;
        videoRate?: number;
        audioStartMs?: number;
        linkAnchorMs?: number;
        unlink?: boolean;
        voiceLocked?: boolean;
        commands: { op: string; id: string }[];
        error?: string;
        expected: { startMs: number; durationMs: number; sourceStartMs: number; playbackRate: number; anchorMs: number; sourceClipId: string }[];
    }[];
};
for (const item of fixture.cases)
    test(`原生与网页共用声音联动合同：${item.name}`, () => {
        const before = structuredClone(fixture.base);
        if (item.mode) before.clips[2].audioLink = { ...before.clips[2].audioLink!, mode: item.mode, anchorMs: 500 };
        if (item.audioRate) before.clips[2].playbackRate = item.audioRate;
        if (item.videoRate) before.clips[0].playbackRate = item.videoRate;
        if (item.audioStartMs !== undefined) before.clips[2].startMs = item.audioStartMs;
        if (item.linkAnchorMs !== undefined) before.clips[2].audioLink!.anchorMs = item.linkAnchorMs;
        if (item.unlink) delete before.clips[2].audioLink;
        if (item.voiceLocked) before.tracks[1].locked = true;
        const snapshot = structuredClone(before),
            registry = createEditorCommandRegistry();
        const run = () => item.commands.reduce((state, command) => registry.apply(state, { op: command.op, payload: command }), before);
        if (item.error) expect(run).toThrow(new RegExp(item.error));
        else {
            const result = run();
            expect(
                result.clips
                    .filter((clip) => clip.audioLink)
                    .map((clip) => ({ startMs: clip.startMs, durationMs: clip.durationMs, sourceStartMs: clip.sourceStartMs, playbackRate: clip.playbackRate, anchorMs: clip.audioLink!.anchorMs, sourceClipId: clip.audioLink!.sourceClipId })),
            ).toEqual(item.expected);
            for (const id of ["music", "caption", "repeated-source"]) expect(result.clips.find((clip) => clip.id === id)).toEqual(before.clips.find((clip) => clip.id === id));
            expect(run()).toEqual(result);
        }
        expect(before).toEqual(snapshot);
    });
