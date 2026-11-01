import { expect, test } from "bun:test";
import { reviewCaptureSeconds } from "../src/lib/review-time";

test("capturing an ended review stays on its last valid millisecond", () => {
    expect(reviewCaptureSeconds(4.5, 4500)).toBe(4.499);
    expect(reviewCaptureSeconds(9, 4500)).toBe(4.499);
    expect(reviewCaptureSeconds(0, 4500)).toBe(0);
    expect(reviewCaptureSeconds(-1, 4500)).toBe(0);
    expect(reviewCaptureSeconds(Number.NaN, 4500)).toBe(0);
    expect(reviewCaptureSeconds(1.2349, 4500)).toBe(1.234);
});
