import { expect, test } from "bun:test";
import { imageEditRetryContext } from "../src/lib/canvas/canvas-image-edit-retry";
import { CanvasNodeType } from "../src/types/canvas";

const source = { id: "original", type: CanvasNodeType.Image, title: "原图", position: { x: 0, y: 0 }, width: 320, height: 200, metadata: { storageKey: "resource:source", content: "/original.png" } };
const edit = { version: 1, sourceNodeId: "original", resourceId: "source", expectedSourceSha256: "a".repeat(64), mask: { width: 100, height: 100, mode: "keep", strokes: [] } };
const input = JSON.stringify({ metadata: { edit: "mask", nativeImageEdit: edit, canvasTaskDraft: { stale: true } } });

test("retry retains the sealed selection and actual original without replaying the old target draft", () => {
    const retry = imageEditRetryContext(input, [source]);
    expect(retry.metadata).toEqual({ edit: "mask", sourceNodeId: "original", nativeImageEdit: edit });
    expect(retry.referenceImages?.map((item) => item.storageKey)).toEqual(["resource:source"]);
    expect(retry.metadata).not.toHaveProperty("canvasTaskDraft");
});

test("retry refuses deleted or replaced originals rather than applying a selection to another frame", () => {
    expect(() => imageEditRetryContext(input, [])).toThrow();
    expect(() => imageEditRetryContext(input, [{ ...source, metadata: { storageKey: "resource:replacement" } }])).toThrow();
    expect(() => imageEditRetryContext(JSON.stringify({ metadata: { edit: "mask" } }), [source])).toThrow();
});

test("annotation retry preserves original lineage and ordinary creation adds no edit fields", () => {
    expect(imageEditRetryContext(JSON.stringify({ metadata: { edit: "annotation", sourceNodeId: "original", sourceResourceId: "source" } }), []).metadata).toEqual({
        edit: "annotation",
        annotationReference: true,
        sourceNodeId: "original",
        sourceResourceId: "source",
    });
    expect(imageEditRetryContext(undefined, [])).toEqual({ metadata: {} });
});
