import { useCallback, useRef } from "react";
import { useSearchParams } from "react-router";
import { readTaskHistoryRoute, writeTaskHistoryRoute, type TaskHistoryRoute } from "./task-history-route";

export function useTaskHistoryRoute() {
    const [params, setParams] = useSearchParams();
    const current = useRef({ params, setParams });
    current.current = { params, setParams };
    // Polling can finish after a new search starts. Its page correction must
    // use the current address rather than an earlier callback's filters.
    const update = useCallback((patch: Partial<TaskHistoryRoute>) => {
        const { params, setParams } = current.current;
        setParams(writeTaskHistoryRoute(params, patch), { replace: true });
    }, []);
    return [readTaskHistoryRoute(params), update] as const;
}
