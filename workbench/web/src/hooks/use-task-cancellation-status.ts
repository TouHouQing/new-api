import { useEffect, useRef } from "react";
import { getActiveUserScope } from "@/lib/user-scope";
import { queryGenerationTask, type GenerationTask } from "@/services/api/task-center";
import { ApiError } from "@/services/api/request";

/** Cancellation reconciliation continues after the generation becomes terminal. */
export function useTaskCancellationStatus(task: GenerationTask | null, onUpdate: (task: GenerationTask) => void, onError: (message: string) => void) {
    const latest = useRef({ onUpdate, onError });
    latest.current = { onUpdate, onError };
    const scope = getActiveUserScope();
    useEffect(() => {
        if (!task || task.providerCancelStatus !== "requested") return;
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined,
            reported = false;
        const poll = async () => {
            try {
                const result = await queryGenerationTask(task.id, { signal: controller.signal });
                if (controller.signal.aborted || getActiveUserScope() !== scope) return;
                latest.current.onUpdate(result);
                reported = false;
                if (result.providerCancelStatus !== "requested") return;
            } catch (failure) {
                if (controller.signal.aborted || getActiveUserScope() !== scope) return;
                if (failure instanceof ApiError && failure.status !== undefined && [401, 403, 404].includes(failure.status)) {
                    latest.current.onError("任务已无法读取，请刷新任务列表确认权限与状态");
                    return;
                }
                if (!reported) {
                    latest.current.onError("暂时无法读取取消结果，仍将继续核对；可稍后刷新任务");
                    reported = true;
                }
            }
            timer = setTimeout(() => void poll(), 5000);
        };
        void poll();
        return () => {
            controller.abort();
            if (timer) clearTimeout(timer);
        };
    }, [task?.id, task?.providerCancelStatus, scope]);
}
