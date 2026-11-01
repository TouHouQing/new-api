import { describe, expect, it } from "bun:test";
import { readLipSyncDraft, validateLipSyncPlan, type LipSyncPlan } from "../src/lib/canvas/canvas-lip-sync";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";
const source: CanvasNodeData = { id: "face", type: CanvasNodeType.Image, title: "Face", position: { x: 0, y: 0 }, width: 320, height: 320, metadata: { storageKey: "resource:source", naturalWidth: 512, naturalHeight: 512 } };
const audio: CanvasNodeData = { ...source, id: "audio", type: CanvasNodeType.Audio, metadata: { storageKey: "resource:audio", durationMs: 2500 } };
const plan = (): LipSyncPlan => ({
    version: 1,
    sourceNodeId: source.id,
    audioNodeId: audio.id,
    sourceStorageKey: "resource:source",
    audioStorageKey: "resource:audio",
    sourceKind: "image",
    selection: { version: 1, startMs: 0, endMs: 2000, audioStartMs: 200, region: { x: 100, y: 50, width: 300, height: 400 } },
    rightsConfirmedFor: ["resource:source", "resource:audio"],
});
describe("native lip-sync drafts", () => {
    it("keeps the exact selected source and manually reviewed pixel region after reload", () => {
        const p = plan(),
            node = { ...source, metadata: { ...source.metadata, lipSyncDraft: p } };
        expect(readLipSyncDraft(node)).toEqual(p);
        const restored = readLipSyncDraft(node)!;
        restored.selection.region!.x = 1;
        expect(p.selection.region!.x).toBe(100);
        expect(() => validateLipSyncPlan(p, source, audio)).not.toThrow();
    });
    it("rejects stale source, another audio and prior authorization after either source changes", () => {
        expect(readLipSyncDraft({ ...source, metadata: { storageKey: "resource:changed", lipSyncDraft: plan() } })).toBeUndefined();
        for (const p of [
            { ...plan(), rightsConfirmedFor: [] },
            { ...plan(), audioStorageKey: "resource:another" },
            { ...plan(), sourceStorageKey: "resource:another" },
        ])
            expect(() => validateLipSyncPlan(p, source, audio)).toThrow();
    });
    it("does not let a missing dialogue or unsafe clock and region start a task", () => {
        for (const change of [{ endMs: 30001 }, { startMs: -1 }, { audioStartMs: 600 }, { endMs: NaN }, { region: { x: 400, y: 0, width: 200, height: 200 } }]) {
            const p = plan();
            Object.assign(p.selection, change);
            expect(() => validateLipSyncPlan(p, source, audio)).toThrow();
        }
        expect(() => validateLipSyncPlan(plan(), source, undefined)).toThrow();
    });
    it("maps independent video and dialogue offsets without touching other occurrences", () => {
        const p = plan();
        p.sourceKind = "video";
        p.selection.startMs = 3000;
        p.selection.endMs = 5000;
        p.selection.audioStartMs = 0;
        const video = { ...source, type: CanvasNodeType.Video, metadata: { ...source.metadata, durationMs: 6000 } };
        expect(() => validateLipSyncPlan(p, video, audio)).not.toThrow();
        p.selection.endMs = 7000;
        expect(() => validateLipSyncPlan(p, video, audio)).toThrow();
    });
});
