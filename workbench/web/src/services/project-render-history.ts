import { listGenerationTaskPage, type GenerationTask } from "./api/task-center";
import type { TimelineRenderResult } from "./api/timeline-tasks";

export async function projectRenderPage(projectId: string, cursor?: string, signal?: AbortSignal) {
    const page = await listGenerationTaskPage({ projectId, type: "timeline_render", limit: 10, activeOnly: false, cursor }, signal);
    if (page.tasks.some((task) => task.projectId !== projectId || task.type !== "timeline_render")) throw new Error("成片记录与当前项目不匹配，请重新读取");
    return page;
}
export function projectRenderResult(task: GenerationTask, projectId: string): TimelineRenderResult {
    if (task.projectId !== projectId || task.type !== "timeline_render" || task.provider !== "local" || task.model !== "ffmpeg" || task.status !== "succeeded") throw new Error("这条记录尚不是已完成的项目成片");
    let value: TimelineRenderResult;
    try {
        value = JSON.parse(task.resultJson || "");
    } catch {
        throw new Error("成片文件记录无法读取，请到任务记录核对");
    }
    if (!value || Array.isArray(value) || typeof value !== "object" || typeof value.resourceId !== "string" || !/^[-A-Za-z0-9_]{1,128}$/.test(value.resourceId)) throw new Error("成片缺少有效的原文件记录，请到任务记录核对");
    for (const key of ["width", "height", "fps", "durationMs", "size"] as const) {
        const dimension = value[key];
        if (dimension !== undefined && (typeof dimension !== "number" || !Number.isFinite(dimension) || dimension <= 0)) throw new Error("成片规格无法核对，请保留原任务记录");
    }
    return { resourceId: value.resourceId, fileName: typeof value.fileName === "string" ? value.fileName : "成片.mp4", width: value.width, height: value.height, fps: value.fps, durationMs: value.durationMs, size: value.size };
}
export function projectRenderCutId(task: GenerationTask) {
    const operation = task.operation || "";
    let id = operation.startsWith("cut-render:") ? operation.slice(11) : "";
    if (!id)
        try {
            id = JSON.parse(task.inputJson || "{}").cutId || "";
        } catch {
            return undefined;
        }
    return typeof id === "string" && /^[-A-Za-z0-9_]{1,128}$/.test(id) ? id : undefined;
}
