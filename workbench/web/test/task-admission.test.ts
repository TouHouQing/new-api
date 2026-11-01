import { describe, expect, test } from "bun:test";
import { ApiError } from "@/services/api/request";
import { admitStableGenerationTask, TaskAdmissionUnconfirmedError } from "@/services/api/task-admission";

describe("native task admission under a lost response", () => {
    test("replays the same operation when the committed response is lost", async () => {
        const records = new Map<string, string>(),
            reservations: number[] = [];
        let attempts = 0;
        const submit = async () => {
            attempts++;
            if (!records.has("original-intent")) {
                records.set("original-intent", "native-task");
                reservations.push(100);
            }
            if (attempts === 1) throw new ApiError("连接已断开");
            return records.get("original-intent");
        };
        expect(await admitStableGenerationTask(submit, true, async () => {})).toBe("native-task");
        expect(attempts).toBe(2);
        expect(reservations).toEqual([100]);
    });
    test("definitive permission, intent and rate limit failures never retry", async () => {
        for (const status of [400, 401, 403, 409, 429]) {
            let attempts = 0;
            const error = new ApiError("服务已拒绝", { status });
            await expect(
                admitStableGenerationTask(
                    async () => {
                        attempts++;
                        throw error;
                    },
                    true,
                    async () => {},
                ),
            ).rejects.toBe(error);
            expect(attempts).toBe(1);
        }
    });
    test("persistent uncertainty is visible after bounded retries", async () => {
        let attempts = 0;
        await expect(
            admitStableGenerationTask(
                async () => {
                    attempts++;
                    throw new ApiError("请求超时", { status: 504 });
                },
                true,
                async () => {},
            ),
        ).rejects.toBeInstanceOf(TaskAdmissionUnconfirmedError);
        expect(attempts).toBe(3);
    });
    test("a legacy request with no stable intent cannot be automatically replayed", async () => {
        let attempts = 0;
        await expect(
            admitStableGenerationTask(
                async () => {
                    attempts++;
                    throw new ApiError("断网");
                },
                false,
                async () => {},
            ),
        ).rejects.toBeInstanceOf(ApiError);
        expect(attempts).toBe(1);
    });
});
