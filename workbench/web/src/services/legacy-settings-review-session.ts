import { canonicalize } from "json-canonicalize";
import type { StateStorage } from "zustand/middleware";
import { applyProjectCutReview, readProjectCutReview, type CutReviewPreview, type CutReviewRequest } from "@/services/api/project-timeline";
import { ApiError } from "@/services/api/request";

type Intent = { request: CutReviewRequest; plan: CutReviewPreview };
/** The confirmation identity is durable before a write. A missing response
 * keeps that identity until the resulting working cut is successfully read. */
export function createLegacySettingsReviewSession(projectId: string, storage: StateStorage, api = { apply: applyProjectCutReview, result: readProjectCutReview }) {
    const key = `legacy-settings-review:${projectId}`;
    const read = async (): Promise<Intent | null> => {
        const raw = await storage.getItem(key);
        if (!raw) return null;
        try {
            if (raw.length > 65536) throw new Error();
            const value = JSON.parse(raw) as Intent,
                { request, plan } = value;
            if (
                !request ||
                !plan ||
                typeof request.requestId !== "string" ||
                request.requestId.length < 16 ||
                request.requestId.length > 128 ||
                !Number.isSafeInteger(request.expectedRevision) ||
                request.expectedRevision < 0 ||
                typeof request.previewToken !== "string" ||
                !/^[a-f0-9]{64}$/.test(request.previewToken) ||
                request.previewToken !== plan.previewToken ||
                plan.expectedRevision !== request.expectedRevision ||
                !Array.isArray(request.discardFields) ||
                !request.discardFields.length ||
                request.discardFields.length > 128 ||
                request.discardFields.some((field) => typeof field !== "string" || field.length > 512) ||
                canonicalize(request.discardFields) !== canonicalize(plan.discardFields) ||
                typeof plan.cutId !== "string" ||
                !plan.cutId ||
                typeof plan.backupCutId !== "string" ||
                !plan.backupCutId ||
                !plan.before ||
                !/^[a-f0-9]{64}$/.test(plan.before.sha256)
            )
                throw new Error();
            return value;
        } catch {
            throw new Error("上次核对记录无法校验，请保留本机数据并检查备份");
        }
    };
    return {
        read,
        async submit(intent: Intent) {
            const prior = await read();
            if (prior && canonicalize(prior) !== canonicalize(intent)) throw new Error("仍有一项核对结果待确认，请先沿用原编号核对");
            await storage.setItem(key, JSON.stringify(intent));
            try {
                return await api.apply(projectId, intent.request);
            } catch (cause) {
                try {
                    return await api.result(projectId, intent.request.requestId);
                } catch (lookup) {
                    // A definite rejection plus no committed receipt can be
                    // left for a new preview. Network/5xx replies stay pending.
                    if (cause instanceof ApiError && [400, 404, 409].includes(cause.status ?? 0) && lookup instanceof ApiError && lookup.status === 404) await storage.removeItem(key);
                    throw cause;
                }
            }
        },
        async result() {
            const intent = await read();
            if (!intent) throw new Error("没有待确认的核对记录");
            return api.result(projectId, intent.request.requestId);
        },
        async complete() {
            await storage.removeItem(key);
        },
    };
}
