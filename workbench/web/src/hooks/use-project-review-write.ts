import { useEffect, useMemo, useRef, useState } from "react";
import { getActiveUserScope } from "@/lib/user-scope";
import { localForageStorageForScope } from "@/lib/localforage-storage";
import { createProjectReviewSession } from "@/services/project-review-session";
import { performReviewOperation, readReviewReceipt, type ReviewOperation, type ReviewReceipt } from "@/services/api/project-reviews";

export function useProjectReviewWrite(projectId: string) {
    const scope = getActiveUserScope();
    const session = useMemo(
        () =>
            createProjectReviewSession(
                projectId,
                localForageStorageForScope(scope),
                {
                    write: (id, operation) => {
                        if (getActiveUserScope() !== scope) throw new Error("账号已切换，请返回当前账号的审片后重试");
                        return performReviewOperation(id, operation);
                    },
                    result: (id, requestId) => {
                        if (getActiveUserScope() !== scope) throw new Error("账号已切换，请重新核对当前账号的操作");
                        return readReviewReceipt(id, requestId);
                    },
                },
                `${scope}:${projectId}`,
            ),
        [projectId, scope],
    );
    const [busy, setBusy] = useState(false),
        [pending, setPending] = useState(false),
        [error, setError] = useState("");
    const alive = useRef(false),
        lock = useRef(false);
    useEffect(() => {
        alive.current = true;
        void session
            .read()
            .then((value) => {
                if (alive.current) setPending(!!value);
            })
            .catch((cause) => {
                if (alive.current) {
                    setPending(true);
                    setError(cause.message);
                }
            });
        return () => {
            alive.current = false;
        };
    }, [session]);
    const run = async (operation: ReviewOperation | null, confirmed: (result: ReviewReceipt) => Promise<void> | void) => {
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        setError("");
        try {
            const result = operation ? await session.submit(operation) : await session.recover();
            if (getActiveUserScope() !== scope || !alive.current) return;
            await confirmed(result);
            await session.complete();
            if (alive.current) setPending(false);
        } catch (cause) {
            if (alive.current && getActiveUserScope() === scope) {
                setError(cause instanceof Error ? cause.message : "结果尚未确认，请核对原操作");
                try {
                    setPending(!!(await session.read()));
                } catch {
                    setPending(true);
                }
            }
        } finally {
            lock.current = false;
            if (alive.current) setBusy(false);
        }
    };
    return { busy, pending, error, run };
}
