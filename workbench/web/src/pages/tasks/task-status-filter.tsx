import { useTranslation } from "react-i18next";
import { SegmentedControl } from "@/components/ui/base/segmented-control";
import { useLayoutEffect, useRef } from "react";

export type TaskStatusFilter = "all" | "failed" | "active" | "succeeded" | "recorded";

export type TaskStats = { total: number; today: number; active: number; succeeded: number; failed: number; recorded?: number };

export function TaskStatusFilterBar({ stats, value, onChange }: { stats: TaskStats; value: TaskStatusFilter; onChange: (value: TaskStatusFilter) => void }) {
    const { t } = useTranslation();
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
        { value: "all", label: t("library.tasks.filter.all"), count: stats.total },
        { value: "active", label: t("library.tasks.filter.active"), count: stats.active },
        { value: "succeeded", label: t("library.tasks.filter.succeeded"), count: stats.succeeded },
        { value: "failed", label: t("library.tasks.filter.failed"), count: stats.failed },
    ];
    if (stats.recorded || value === "recorded") options.push({ value: "recorded", label: "对话记录", count: stats.recorded || 0 });

    return (
        <div ref={scroller} className="task-status-options min-w-0 max-w-full overflow-x-auto [scrollbar-width:thin]">
            <SegmentedControl<TaskStatusFilter>
                className="task-center-status-filter"
                ariaLabel={t("library.tasks.detail.status")}
                value={value}
                options={options.map((option) => ({
                    value: option.value,
                    label: (
                        <>
                            <span>{option.label}</span>
                            <span className="app-segmented-count" data-tone={option.value === "failed" && option.count > 0 ? "failed" : option.value === "active" && option.count > 0 ? "active" : undefined}>
                                {option.count}
                            </span>
                        </>
                    ),
                }))}
                onChange={onChange}
            />
        </div>
    );
}
