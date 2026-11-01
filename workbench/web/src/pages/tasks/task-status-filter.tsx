import { SegmentedControl } from "@/components/ui/base/segmented-control";
import { useLayoutEffect, useRef } from "react";

export type TaskStatusFilter = "all" | "failed" | "active" | "succeeded" | "recorded";

export type TaskStats = { total: number; today: number; active: number; succeeded: number; failed: number; recorded?: number };

export function TaskStatusFilterBar({ stats, value, onChange }: { stats: TaskStats; value: TaskStatusFilter; onChange: (value: TaskStatusFilter) => void }) {
    const scroller = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const container = scroller.current;
        if (!container) return;
        const revealSelection = () => {
            const selected = container.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]');
            if (!selected) return;
            const bounds = container.getBoundingClientRect(),
                item = selected.getBoundingClientRect();
            if (item.left < bounds.left) container.scrollLeft += item.left - bounds.left;
            else if (item.right > bounds.left + container.clientWidth) container.scrollLeft += item.right - bounds.left - container.clientWidth;
        };
        revealSelection();
        const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(revealSelection);
        observer?.observe(container);
        return () => observer?.disconnect();
    }, [value, stats.total, stats.active, stats.succeeded, stats.failed, stats.recorded]);
    const options: Array<{ value: TaskStatusFilter; label: string; count: number }> = [
        { value: "all", label: "全部", count: stats.total },
        { value: "active", label: "运行中", count: stats.active },
        { value: "succeeded", label: "已完成", count: stats.succeeded },
        { value: "failed", label: "失败/取消", count: stats.failed },
    ];
    if (stats.recorded || value === "recorded") options.push({ value: "recorded", label: "对话记录", count: stats.recorded || 0 });

    return (
        <div className="task-status-filter">
            <span className="task-status-today">
                今日新增 <strong>{stats.today}</strong>
            </span>
            <div ref={scroller} className="task-status-options min-w-0 max-w-full overflow-x-auto [scrollbar-width:thin]">
                <SegmentedControl<TaskStatusFilter>
                    ariaLabel="任务状态"
                    size="sm"
                    value={value}
                    options={options.map((option) => ({
                        value: option.value,
                        label: (
                            <>
                                <span>{option.label}</span>
                                <span className="app-segmented-count">{option.count}</span>
                            </>
                        ),
                    }))}
                    onChange={onChange}
                />
            </div>
        </div>
    );
}
