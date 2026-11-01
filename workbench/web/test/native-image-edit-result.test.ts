import { describe, expect, test } from "bun:test";
import { hasNativeImageEditResult } from "../src/lib/canvas/native-image-edit-result";

const intent = { resourceId: "original", expectedSourceSha256: "a".repeat(64), emotion: { region: {} } };
const receipt = { kind: "emotion" as const, sourceResourceId: "original", sourceSha256: "a".repeat(64), recipeSha256: "b".repeat(64) };

describe("native image edit result", () => {
    test("uses the saved server composite directly", () => {
        expect(hasNativeImageEditResult(intent, receipt, "resource:derived")).toBe(true);
        expect(hasNativeImageEditResult({ ...intent, emotion: undefined }, { ...receipt, kind: "mask" }, "resource:derived")).toBe(true);
    });
    test("rejects missing, unrelated or incomplete server receipts", () => {
        for (const invalid of [undefined, { ...receipt, kind: "mask" as const }, { ...receipt, sourceResourceId: "other" }, { ...receipt, sourceSha256: "c".repeat(64) }, { ...receipt, recipeSha256: "unfinished" }])
            expect(() => hasNativeImageEditResult(intent, invalid, "resource:derived")).toThrow();
        expect(() => hasNativeImageEditResult(intent, receipt, "https://example.test/raw-crop.png")).toThrow();
        expect(() => hasNativeImageEditResult(undefined, receipt, "resource:derived")).toThrow();
    });
    test("ordinary generation has no native composition receipt", () => {
        expect(hasNativeImageEditResult(undefined, undefined, "resource:ordinary")).toBe(false);
    });
});
