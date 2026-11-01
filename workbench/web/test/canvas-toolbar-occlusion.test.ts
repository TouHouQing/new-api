import { expect, test } from "bun:test";
import { avoidCanvasContent } from "../src/lib/canvas/canvas-overlay-layout";

test("密集图层下工具栏必须优先避让可拖动助手，下载等尾部按钮保持可点", () => {
    const bounds = { left: 312, top: 76, right: 1428, bottom: 944 };
    const launcher = { left: 1190, top: 780, right: 1428, bottom: 988 };
    const nodes = [
        { left: 370, top: 100, right: 680, bottom: 345 },
        { left: 735, top: 100, right: 1045, bottom: 345 },
        { left: 735, top: 368, right: 1045, bottom: 612 },
        { left: 1055, top: 368, right: 1370, bottom: 612 },
        { left: 735, top: 636, right: 1045, bottom: 880 },
    ];
    const size = { width: 1024, height: 44 };
    const anchor = avoidCanvasContent({ left: 916, top: 930 }, size, bounds, [...nodes, launcher], [launcher]);
    const overlap = anchor.left + size.width / 2 > launcher.left && anchor.left - size.width / 2 < launcher.right && anchor.top > launcher.top && anchor.top - size.height < launcher.bottom;
    expect(overlap).toBe(false);
    expect(anchor.left - size.width / 2).toBeGreaterThanOrEqual(bounds.left);
    expect(anchor.left + size.width / 2).toBeLessThanOrEqual(bounds.right);
    expect(avoidCanvasContent(anchor, size, bounds, [...nodes, launcher], [launcher])).toEqual(anchor);
    const dragged = { left: 700, top: 80, right: 938, bottom: 288 };
    const moved = avoidCanvasContent(anchor, size, bounds, [...nodes, dragged], [dragged]);
    expect(moved.top <= dragged.top || moved.top - size.height >= dragged.bottom).toBe(true);
});

test("缩小画布后，快捷工具栏不能覆盖相邻文字节点的全部点击区域", () => {
    const node = { left: 970, top: 88, right: 1030, bottom: 128 };
    const size = { width: 500, height: 44 };
    const bounds = { left: 312, top: 76, right: 1588, bottom: 944 };
    const anchor = avoidCanvasContent({ left: 960, top: 132 }, size, bounds, [node]);
    const overlap = anchor.left + size.width / 2 > node.left && anchor.left - size.width / 2 < node.right && anchor.top > node.top && anchor.top - size.height < node.bottom;
    expect(overlap).toBe(false);
    expect(anchor.left - size.width / 2).toBeGreaterThanOrEqual(bounds.left);
    expect(anchor.top - size.height).toBeGreaterThanOrEqual(bounds.top);
    expect(avoidCanvasContent(anchor, size, bounds, [node])).toEqual(anchor);
});

test("四张图片适应画布后，快捷工具栏避让所选图层组的标题和管理按钮", () => {
    const bounds = { left: 312, top: 76, right: 1428, bottom: 944 };
    const size = { width: 1024, height: 44 };
    const obstacles = [
        { left: 380, top: 268, right: 652, bottom: 488 },
        { left: 790, top: 268, right: 1065, bottom: 488 },
        { left: 1084, top: 268, right: 1358, bottom: 488 },
        { left: 730, top: 505, right: 960, bottom: 678 },
    ];
    const anchor = avoidCanvasContent({ left: 858, top: 537 }, size, bounds, obstacles);
    for (const node of obstacles) {
        const overlaps = anchor.left + size.width / 2 > node.left && anchor.left - size.width / 2 < node.right && anchor.top > node.top && anchor.top - size.height < node.bottom;
        expect(overlaps).toBe(false);
    }
    expect(avoidCanvasContent(anchor, size, bounds, obstacles)).toEqual(anchor);
});
