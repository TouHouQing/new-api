import { expect, test } from "bun:test";
import { annotationGeneration } from "../src/lib/canvas/canvas-annotation-generation";

const source = { id: "source", name: "original.png", type: "image/png", dataUrl: "/original.png", storageKey: "resource:original" };
const payload = { annotatedDataUrl: "data:image/png;base64,overlay", annotatedReferenceDataUrl: "data:image/png;base64,original-and-overlay", prompt: "  把红圈里的花盆改为蓝色  " };

test("one-reference annotation submits the original plus marks in a single image", () => {
    const plan = annotationGeneration(source, payload, 1);
    expect(plan.references).toHaveLength(1);
    expect(plan.references[0].dataUrl).toBe(payload.annotatedReferenceDataUrl);
    expect(plan.prompt).toContain("把红圈里的花盆改为蓝色");
    expect(plan.prompt).not.toContain("第二张");
});

test("multi-reference annotation preserves the separate original and overlay", () => {
    const plan = annotationGeneration(source, payload, 2);
    expect(plan.references).toHaveLength(2);
    expect(plan.references[0]).toBe(source);
    expect(plan.references[1].dataUrl).toBe(payload.annotatedDataUrl);
});

test("annotation requires a supported model, explicit goal and complete reference", () => {
    expect(() => annotationGeneration(source, payload, 0)).toThrow();
    expect(() => annotationGeneration(source, { ...payload, prompt: " " }, 1)).toThrow();
    expect(() => annotationGeneration(source, { ...payload, annotatedReferenceDataUrl: "" }, 1)).toThrow();
});
