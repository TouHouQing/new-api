import { ApiError } from "@/services/api/request";

export class TaskAdmissionUnconfirmedError extends Error {
    constructor(readonly cause: unknown) {
        super("提交结果暂未确认。请到创作历史查询原任务，或继续原提交；请勿重新创建生成。");
        this.name = "TaskAdmissionUnconfirmedError";
    }
}

/** Replays the exact native operation identity, never a newly priced request. */
export async function admitStableGenerationTask<T>(submit: () => Promise<T>, hasStableIntent: boolean, pause: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await submit();
        } catch (error) {
            const uncertain = hasStableIntent && error instanceof ApiError && (error.status === undefined || error.status >= 500);
            if (!uncertain) throw error;
            if (attempt >= 2) throw new TaskAdmissionUnconfirmedError(error);
            await pause(Math.min(2000, Math.max(250 * 2 ** attempt, error.retryAfterMs || 0)));
        }
    }
}
