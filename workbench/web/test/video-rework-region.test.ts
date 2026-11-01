import { expect, test } from "bun:test";
import { draggedVideoReworkRegion, updateVideoReworkRegion } from "../src/lib/timeline/video-rework-region";
test("moving a full-frame selection first retains the requested odd-pixel origin and fits its size", () => {
    let region = { x: 0, y: 0, width: 512, height: 512 };
    for (const [field, value] of [
        ["x", 133],
        ["y", 177],
        ["width", 247],
        ["height", 269],
    ] as const)
        region = updateVideoReworkRegion(region, field, value, 512, 512);
    expect(region).toEqual({ x: 133, y: 177, width: 247, height: 269 });
    let resizedFirst = { x: 0, y: 0, width: 512, height: 512 };
    for (const [field, value] of [
        ["width", 247],
        ["height", 269],
        ["x", 133],
        ["y", 177],
    ] as const)
        resizedFirst = updateVideoReworkRegion(resizedFirst, field, value, 512, 512);
    expect(resizedFirst).toEqual(region);
});
test("pointer clicks on every extreme source corner retain a two-pixel region, with symmetric reversed drags", () => {
    for (const point of [
        { x: 0, y: 0 },
        { x: 511, y: 0 },
        { x: 0, y: 511 },
        { x: 511, y: 511 },
    ]) {
        const r = draggedVideoReworkRegion(point, point, 512, 512);
        expect(r.width).toBe(2);
        expect(r.height).toBe(2);
        expect(r.x + r.width).toBeLessThanOrEqual(512);
        expect(r.y + r.height).toBeLessThanOrEqual(512);
    }
    expect(draggedVideoReworkRegion({ x: 133, y: 177 }, { x: 379, y: 445 }, 512, 512)).toEqual({ x: 133, y: 177, width: 247, height: 269 });
    expect(draggedVideoReworkRegion({ x: 379, y: 445 }, { x: 133, y: 177 }, 512, 512)).toEqual({ x: 133, y: 177, width: 247, height: 269 });
});
test("an edge edit keeps a usable bounded region without negative dimensions or NaN", () => {
    const last = updateVideoReworkRegion({ x: 0, y: 0, width: 512, height: 512 }, "x", 512, 512, 512);
    expect(last).toEqual({ x: 510, y: 0, width: 2, height: 512 });
    expect(updateVideoReworkRegion(last, "width", -3, 512, 512).width).toBe(2);
    expect(updateVideoReworkRegion(last, "x", NaN, 512, 512)).toBe(last);
});
