import { test, expect } from "bun:test";
import { projectRenderResult, projectRenderCutId } from "@/services/project-render-history";
import type { GenerationTask } from "@/services/api/task-center";
const base = {
    id: "render",
    projectId: "project",
    type: "timeline_render",
    provider: "local",
    model: "ffmpeg",
    status: "succeeded",
    operation: "cut-render:exact-cut",
    resultJson: JSON.stringify({ resourceId: "owned-resource", fileName: "作品.mp4", width: 640, height: 360, fps: 24, durationMs: 10000, size: 12000 }),
} as GenerationTask;
test("existing project exports retain their exact original resource and fixed source", () => {
    expect(projectRenderResult(base, "project")).toEqual(JSON.parse(base.resultJson!));
    expect(projectRenderCutId(base)).toBe("exact-cut");
    expect(projectRenderCutId({ ...base, operation: "", inputJson: JSON.stringify({ cutId: "original-cut" }) })).toBe("original-cut");
    expect(projectRenderCutId({ ...base, operation: "", inputJson: "{" })).toBeUndefined();
});
test("unfinished foreign and non-native tasks cannot be shown as completed project films", () => {
    for (const patch of [{ projectId: "other" }, { type: "canvas_video" }, { status: "running" }, { status: "failed" }, { provider: "external" }, { model: "other" }])
        expect(() => projectRenderResult({ ...base, ...patch } as GenerationTask, "project")).toThrow();
});
test("missing malformed or remote resource pointers cannot become a download link", () => {
    for (const result of [
        "{",
        "null",
        "[]",
        JSON.stringify({}),
        JSON.stringify({ resourceId: "https://untrusted.example/video.mp4" }),
        JSON.stringify({ resourceId: "../other" }),
        JSON.stringify({ resourceId: "owned", width: -1 }),
        JSON.stringify({ resourceId: "owned", fps: "24" }),
    ])
        expect(() => projectRenderResult({ ...base, resultJson: result }, "project")).toThrow();
    expect(projectRenderCutId({ ...base, operation: "cut-render:../other" })).toBeUndefined();
});
