import { ApiError } from "@/services/api/request";
import { applyCanvasCut, previewCanvasCut, type CanvasCutConvertPreview, type CanvasCutConvertRequest } from "@/services/api/canvas-timeline-cut";
import { readProjectCutRequest, type ProjectCutView } from "@/services/api/project-cuts";
import type { StateStorage } from "zustand/middleware";

type Pending = { version: 1; projectId: string; input: CanvasCutConvertRequest; submitted: boolean; plan?: CanvasCutConvertPreview };
export type CanvasCutConversionState = { state: "draft" | "ready"; pending: Pending } | { state: "complete"; cut: ProjectCutView; pending: Pending };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const opaque = (value: unknown) => typeof value === "string" && /^[\p{L}\p{N}_:.-]{1,128}$/u.test(value);
const digest = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function validInput(input: CanvasCutConvertRequest | undefined) {
    return (
        input &&
        typeof input.requestId === "string" &&
        /^[!-~]{16,128}$/.test(input.requestId) &&
        opaque(input.canvasId) &&
        Number.isSafeInteger(input.canvasRevision) &&
        input.canvasRevision > 0 &&
        Number.isSafeInteger(input.expectedProjectRevision) &&
        input.expectedProjectRevision > 0 &&
        Number.isSafeInteger(input.expectedTimelineRevision) &&
        input.expectedTimelineRevision >= 0 &&
        digest(input.sourceSha256) &&
        typeof input.title === "string" &&
        input.title.trim().length > 0 &&
        input.title.length <= 200 &&
        !/\p{Surrogate}/u.test(input.title) &&
        Array.isArray(input.mappings) &&
        input.mappings.length <= 5000 &&
        input.mappings.every((row) => row && opaque(row.clipId) && opaque(row.resourceId)) &&
        Array.isArray(input.texts) &&
        input.texts.length <= 5000 &&
        input.texts.every((row) => row && opaque(row.clipId) && typeof row.text === "string" && row.text.trim().length > 0 && row.text.length <= 2000 && !/\p{Surrogate}/u.test(row.text)) &&
        (input.previewToken === undefined || digest(input.previewToken))
    );
}
function validPlan(input: CanvasCutConvertRequest, plan: CanvasCutConvertPreview) {
    return (
        plan &&
        opaque(plan.cutId) &&
        digest(plan.previewToken) &&
        digest(plan.summary?.sha256) &&
        plan.title === input.title &&
        plan.canvasId === input.canvasId &&
        plan.sourceSha256 === input.sourceSha256 &&
        plan.expectedProjectRevision === input.expectedProjectRevision &&
        plan.expectedTimelineRevision === input.expectedTimelineRevision
    );
}

/** Persist the exact intent before preview and submission. Unknown replies use
 * the original request receipt, including after a browser restart. */
export function createCanvasCutConversion(projectId: string, storage: StateStorage, api = { preview: previewCanvasCut, apply: applyCanvasCut, read: readProjectCutRequest }) {
    const key = `canvas-cut-conversion-v1:${projectId}`;
    const save = (value: Pending) => storage.setItem(key, JSON.stringify(value));
    async function pending(): Promise<Pending | null> {
        const raw = await storage.getItem(key);
        if (raw === null) return null;
        let value: Pending;
        try {
            value = JSON.parse(raw) as Pending;
        } catch {
            throw new Error("保存的转换输入无法读取，请保留浏览器数据后检查");
        }
        if (
            !value ||
            value.version !== 1 ||
            value.projectId !== projectId ||
            !validInput(value.input) ||
            typeof value.submitted !== "boolean" ||
            (value.plan && (!validPlan(value.input, value.plan) || value.plan.previewToken !== value.input.previewToken)) ||
            (value.submitted && !value.plan)
        )
            throw new Error("保存的转换输入无法读取，请保留浏览器数据后检查");
        return value;
    }
    function verified(value: Pending, cut: ProjectCutView) {
        const source = cut.metadata?.source as { canvasId?: string; canvasRevision?: number; sourceSha256?: string } | undefined;
        const origins = cut.metadata?.media as { clipId: string; resourceId: string; resolution: string }[] | undefined;
        const matchesSource = source && source.canvasId === value.input.canvasId && source.canvasRevision === value.input.canvasRevision && source.sourceSha256 === value.input.sourceSha256;
        const matchesMedia = Array.isArray(origins) && value.input.mappings.every((mapping) => origins.some((origin) => origin.clipId === mapping.clipId && origin.resourceId === mapping.resourceId && origin.resolution === "explicit"));
        const matchesCut = value.plan && cut.cut.projectId === projectId && cut.cut.id === value.plan.cutId && cut.cut.timelineSha256 === value.plan.summary.sha256 && cut.cut.title === value.input.title;
        if (!matchesCut || !matchesSource || !matchesMedia || cut.metadata?.kind !== "canvas-timeline-cut-v1" || cut.metadata?.requestId !== value.input.requestId || !same(cut.metadata?.supplementedTexts, value.input.texts))
            throw new Error("转换回执与已确认选择不一致，请保留原编号并检查；尚未载入工作剪辑");
        return { state: "complete" as const, cut, pending: value };
    }
    async function receipt(value: Pending) {
        try {
            return verified(value, await api.read(projectId, value.input.requestId));
        } catch (cause) {
            if (cause instanceof ApiError && cause.status === 404) return null;
            throw cause;
        }
    }
    async function restore(): Promise<CanvasCutConversionState | null> {
        const value = await pending();
        if (!value) return null;
        if (value.submitted) {
            const result = await receipt(value);
            if (result) return result;
        }
        return { state: value.plan ? "ready" : "draft", pending: value };
    }
    async function prepare(input: Omit<CanvasCutConvertRequest, "requestId" | "previewToken">): Promise<CanvasCutConversionState> {
        const previous = await pending();
        if (previous?.submitted) {
            const complete = await receipt(previous);
            if (complete) return complete;
            throw new Error("上一次转换已提交，结果尚未确认；请使用原编号核对或重试，再开始另一份转换");
        }
        const oldInput = previous && { ...previous.input, requestId: undefined, previewToken: undefined };
        const value: Pending = previous && same(oldInput, input) ? previous : { version: 1, projectId, submitted: false, input: { ...input, requestId: crypto.randomUUID() } };
        if (!validInput(value.input)) throw new Error("转换选择或文字无效，请核对后重新预览");
        await save(value);
        const plan = await api.preview(projectId, value.input);
        if (!validPlan(value.input, plan)) throw new Error("转换预览与当前选择不一致，请保留输入并重新读取");
        value.plan = plan;
        value.input.previewToken = plan.previewToken;
        await save(value);
        return { state: "ready", pending: value };
    }
    async function apply(confirmed: Pick<CanvasCutConvertPreview, "cutId" | "previewToken">): Promise<CanvasCutConversionState> {
        const value = await pending();
        if (!value?.plan || !value.input.previewToken) throw new Error("请先完成转换预览");
        if (value.plan.cutId !== confirmed.cutId || value.plan.previewToken !== confirmed.previewToken) throw new Error("另一个窗口更新了待转换输入，请重新读取并核对，尚未提交");
        const complete = await receipt(value);
        if (complete) return complete;
        value.submitted = true;
        await save(value);
        try {
            return verified(value, await api.apply(projectId, value.input));
        } catch (cause) {
            const recovered = await receipt(value);
            if (recovered) return recovered;
            if (cause instanceof ApiError && [400, 403, 404, 409, 413, 422].includes(cause.status ?? 0)) {
                // Native validation/quota conflicts commit no cut. Release the
                // form only after its original receipt also reports absent.
                value.submitted = false;
                value.plan = undefined;
                delete value.input.previewToken;
                await save(value);
            }
            throw cause;
        }
    }
    async function clearCompleted() {
        const value = await pending();
        if (value?.submitted && !(await receipt(value))) throw new Error("上一次提交尚未确认，请保留原编号继续核对");
        await storage.removeItem(key);
    }
    return { restore, prepare, apply, clearCompleted };
}
