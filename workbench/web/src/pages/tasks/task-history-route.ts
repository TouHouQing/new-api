import type { TaskStatusFilter } from "./task-status-filter";

export type TaskKindFilter = "all" | "text" | "image" | "video" | "audio";
export type TaskHistoryRoute = {
    keyword: string;
    projectFilter: string;
    kindFilter: TaskKindFilter;
    modelFilter: string;
    statusFilter: TaskStatusFilter;
    page: number;
    pageSize: number;
};

export const DEFAULT_TASK_HISTORY_ROUTE: TaskHistoryRoute = { keyword: "", projectFilter: "all", kindFilter: "all", modelFilter: "all", statusFilter: "all", page: 1, pageSize: 20 };
const routeKeys = { keyword: "q", projectFilter: "canvas", kindFilter: "kind", modelFilter: "model", statusFilter: "status", page: "page", pageSize: "pageSize" } as const;

export function readTaskHistoryRoute(params: URLSearchParams): TaskHistoryRoute {
    const status = params.get("status"),
        kind = params.get("kind"),
        page = Number(params.get("page")),
        size = Number(params.get("pageSize"));
    return {
        keyword: params.get("q") || "",
        projectFilter: params.get("canvas") || "all",
        kindFilter: kind === "text" || kind === "image" || kind === "video" || kind === "audio" ? kind : "all",
        modelFilter: params.get("model") || "all",
        statusFilter: status === "failed" || status === "active" || status === "succeeded" || status === "recorded" ? status : "all",
        page: Number.isSafeInteger(page) && page >= 1 && page <= 1_000_000 ? page : 1,
        pageSize: size === 20 || size === 50 || size === 100 ? size : 20,
    };
}

export function writeTaskHistoryRoute(params: URLSearchParams, patch: Partial<TaskHistoryRoute>): URLSearchParams {
    const previous = readTaskHistoryRoute(params),
        state = { ...previous, ...patch },
        next = new URLSearchParams(params);
    if (patch.page === undefined && (Object.keys(patch).some((key) => key !== "pageSize") || (patch.pageSize !== undefined && patch.pageSize !== previous.pageSize))) state.page = 1;
    for (const field of Object.keys(routeKeys) as Array<keyof TaskHistoryRoute>) {
        if (state[field] === DEFAULT_TASK_HISTORY_ROUTE[field]) next.delete(routeKeys[field]);
        else next.set(routeKeys[field], String(state[field]));
    }
    return next;
}
