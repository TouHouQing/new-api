import { compactApiParams, http } from "./request";
import type { GenerationTask } from "./task-center";

export type TaskHistoryStats = { total: number; today: number; active: number; succeeded: number; failed: number; recorded: number };
export type TaskHistoryCanvas = { id: string; title: string; projectId?: string };
export type TaskHistoryRequest = {
    page: number;
    pageSize: number;
    projectId?: string;
    q?: string;
    kind?: "text" | "image" | "video" | "audio";
    model?: string;
    status?: "active" | "succeeded" | "failed" | "recorded";
    timeZone: string;
};
export type TaskHistoryPage = { tasks: GenerationTask[]; page: number; pageSize: number; total: number; stats: TaskHistoryStats; canvases: TaskHistoryCanvas[]; models: string[] };

export function listTaskHistory(query: TaskHistoryRequest, signal?: AbortSignal): Promise<TaskHistoryPage> {
    return http.get<TaskHistoryPage>("/tasks/history", { params: compactApiParams(query), signal });
}
