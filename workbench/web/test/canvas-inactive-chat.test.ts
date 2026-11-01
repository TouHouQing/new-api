import { expect, test } from "bun:test";
import { canvasContentHash, sameCanvasContent } from "../src/lib/canvas/canvas-content";
import type { CanvasProject } from "../src/stores/canvas/use-canvas-store";

const canvas: CanvasProject = {
    id: "native",
    title: "原生画布",
    nodes: [],
    connections: [],
    chatSessions: [],
    activeChatId: null,
    previsScenes: [],
    backgroundMode: "dots",
    showImageInfo: false,
    viewport: { x: 0, y: 0, k: 1 },
    createdAt: "2026-10-24T00:00:00Z",
    updatedAt: "2026-10-24T00:00:00Z",
};

test("inactive chat omitted by native creation and null in the editor share one content identity", async () => {
    const opened = { ...canvas, activeChatId: null };
    const { activeChatId: _inactive, ...nativePayload } = canvas;
    const native = nativePayload as CanvasProject;
    expect(sameCanvasContent(native, opened)).toBe(true);
    expect(await canvasContentHash(native)).toBe(await canvasContentHash(opened));
    expect(sameCanvasContent(opened, { ...canvas, activeChatId: "real-chat" })).toBe(false);
});

test("clearing an active conversation remains a real change", async () => {
    const active = { ...canvas, activeChatId: "real-chat" };
    expect(sameCanvasContent(active, canvas)).toBe(false);
    expect(await canvasContentHash(active)).not.toBe(await canvasContentHash(canvas));
});
