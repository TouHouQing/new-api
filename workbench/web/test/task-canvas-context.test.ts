import { describe, expect, test } from "bun:test";
import { getTaskCanvasContext, taskCanvasProjectOptions, taskWithCanvasContext } from "@/pages/tasks/task-shared";
import type { GenerationTask } from "@/services/api/task-center";

const task = (context?: GenerationTask["canvasContext"]): GenerationTask => ({ id: "task", projectId: "native-canvas", type: "canvas_image", status: "succeeded", prompt: "窗边绿植", attempts: 1, createdAt: "", updatedAt: "", canvasContext: context });

describe("task history native canvas context", () => {
    test("a fresh browser shows the real native canvas title and parent project", () => {
        const value = task({ status: "available", title: "另一设备的新画布", projectId: "film" });
        expect(getTaskCanvasContext(value, new Map(), new Map([["film", "我的作品"]]))).toEqual({ canvasName: "另一设备的新画布", projectName: "我的作品" });
    });
    test("authoritative unavailable context overrides a stale browser cache without claiming deletion", () => {
        expect(getTaskCanvasContext(task({ status: "unavailable" }), new Map([["native-canvas", { title: "旧缓存" }]]), new Map())).toEqual({ canvasName: "画布暂不可用", projectName: "" });
        expect(getTaskCanvasContext(task({ status: "unavailable" }), new Map(), new Map([["native-canvas", "项目任务"]]))).toEqual({ canvasName: "项目级任务", projectName: "项目任务" });
    });
    test("an absent cache without an authoritative answer means not loaded", () => {
        expect(getTaskCanvasContext(task(), new Map(), new Map()).canvasName).toBe("未加载画布");
    });
    test("fresh browser filtering includes native canvases and deduplicates renamed cached entries", () => {
        const value = task({ status: "available", title: "新名称", projectId: "film" });
        expect(taskCanvasProjectOptions([value, value], [], new Map([["film", "作品"]]))).toEqual([{ label: "新名称 · 作品", value: "native-canvas" }]);
        expect(taskCanvasProjectOptions([value], [{ id: "native-canvas", title: "旧名称" }], new Map())).toEqual([{ label: "新名称", value: "native-canvas" }]);
    });
    test("detail replies keep only the same binding's context and accept a newer server answer", () => {
        const previous = task({ status: "available", title: "原生画布" });
        expect(taskWithCanvasContext(task(), previous).canvasContext).toEqual(previous.canvasContext);
        expect(taskWithCanvasContext(task({ status: "unavailable" }), previous).canvasContext).toEqual({ status: "unavailable" });
        expect(taskWithCanvasContext({ ...task(), id: "other" }, previous).canvasContext).toBeUndefined();
        expect(taskWithCanvasContext({ ...task(), projectId: "other" }, previous).canvasContext).toBeUndefined();
    });
});
