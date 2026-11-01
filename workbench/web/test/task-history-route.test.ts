import { describe, expect, test } from "bun:test";
import { DEFAULT_TASK_HISTORY_ROUTE, readTaskHistoryRoute, writeTaskHistoryRoute } from "@/pages/tasks/task-history-route";

describe("任务历史的可恢复查询位置", () => {
    test("空地址保持新用户的默认列表", () => {
        expect(readTaskHistoryRoute(new URLSearchParams())).toEqual(DEFAULT_TASK_HISTORY_ROUTE);
    });
    test("重开地址恢复搜索、画布、类型、模型、状态和页码", () => {
        expect(readTaskHistoryRoute(new URLSearchParams("q=原对话&canvas=owned&kind=text&model=local&status=recorded&page=3&pageSize=50"))).toEqual({
            keyword: "原对话",
            projectFilter: "owned",
            kindFilter: "text",
            modelFilter: "local",
            statusFilter: "recorded",
            page: 3,
            pageSize: 50,
        });
    });
    test("无效的筛选和超限页码不会进入请求", () => {
        for (const page of ["-1", "0", "1.5", "NaN", "1000001"]) {
            const state = readTaskHistoryRoute(new URLSearchParams({ status: "unknown", kind: "all-records", page, pageSize: "999" }));
            expect(state.page).toBe(1);
            expect(state.pageSize).toBe(20);
            expect(state.kindFilter).toBe("all");
            expect(state.statusFilter).toBe("all");
        }
    });
    test("中文和查询符号往返完整，同时保留其他路由字段", () => {
        const params = new URLSearchParams("extra=keep");
        const next = writeTaskHistoryRoute(params, { keyword: "窗边 100%_ & ?=中文", modelFilter: "CHANNEL::model", statusFilter: "recorded" });
        expect(params.toString()).toBe("extra=keep");
        expect(next.get("extra")).toBe("keep");
        expect(readTaskHistoryRoute(next).keyword).toBe("窗边 100%_ & ?=中文");
        expect(readTaskHistoryRoute(next).modelFilter).toBe("CHANNEL::model");
    });
    test("切换筛选一次重置页码并保留其他查询及每页数量", () => {
        const next = writeTaskHistoryRoute(new URLSearchParams("q=keep&status=recorded&page=5&pageSize=100"), { kindFilter: "text" });
        expect(readTaskHistoryRoute(next)).toMatchObject({ keyword: "keep", statusFilter: "recorded", kindFilter: "text", page: 1, pageSize: 100 });
    });
    test("原子更新分页不丢失筛选，也不重置为第一页", () => {
        const next = writeTaskHistoryRoute(new URLSearchParams("q=keep&status=recorded"), { page: 2, pageSize: 50 });
        expect(readTaskHistoryRoute(next)).toMatchObject({ keyword: "keep", statusFilter: "recorded", page: 2, pageSize: 50 });
    });
    test("重置只移除本页面的默认条件", () => {
        const next = writeTaskHistoryRoute(new URLSearchParams("extra=keep&q=old&canvas=c&kind=image&model=m&status=recorded&page=4&pageSize=100"), DEFAULT_TASK_HISTORY_ROUTE);
        expect(next.toString()).toBe("extra=keep");
    });
});
