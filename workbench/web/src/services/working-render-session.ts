import type { StateStorage } from "zustand/middleware";
import { ApiError } from "./api/request";
import { createProjectCut, createProjectCutRender, readProjectCutRequest, readProjectCutRender, type ProjectCutView } from "./api/project-cuts";

type Intent = { version: 1; projectId: string; requestId: string; expectedRevision: number; title: string };
const defaults = { createCut: createProjectCut, readCut: readProjectCutRequest, render: createProjectCutRender, readRender: readProjectCutRender };

// Save one intent before either native write. An uncertain snapshot or queue
// response always resumes the same immutable cut and the same render task.
export function createWorkingRenderSession(projectId: string, storage: StateStorage, api = defaults) {
    const key = `working-render-v1:${projectId}`;
    async function read(): Promise<Intent | null> {
        const raw = await storage.getItem(key);
        if (!raw) return null;
        let intent: Intent;
        try {
            intent = JSON.parse(raw);
        } catch {
            throw new Error("上次导出编号无法读取，请保留本地数据后检查");
        }
        if (
            intent?.version !== 1 ||
            intent.projectId !== projectId ||
            !Number.isInteger(intent.expectedRevision) ||
            intent.expectedRevision < 0 ||
            typeof intent.requestId !== "string" ||
            !/^[!-~]{16,128}$/.test(intent.requestId) ||
            typeof intent.title !== "string" ||
            !intent.title ||
            intent.title.length > 200
        )
            throw new Error("上次导出记录与当前项目不匹配，请保留原编号后检查");
        return intent;
    }
    async function submit(expectedRevision?: number) {
        let intent = await read();
        if (!intent) {
            if (expectedRevision == null || !Number.isInteger(expectedRevision) || expectedRevision < 0) throw new Error("请先成功保存当前剪辑再导出");
            intent = { version: 1, projectId, requestId: crypto.randomUUID(), expectedRevision, title: `导出快照 · ${new Date().toLocaleString()}` };
            await storage.setItem(key, JSON.stringify(intent));
        }
        let cut: ProjectCutView;
        try {
            cut = await api.createCut(projectId, { requestId: intent.requestId, expectedRevision: intent.expectedRevision, title: intent.title, kind: "snapshot", purpose: "export" });
        } catch (cause) {
            try {
                cut = await api.readCut(projectId, intent.requestId);
            } catch {
                throw cause;
            }
        }
        const input = { requestId: intent.requestId, timelineSha256: cut.cut.timelineSha256 };
        try {
            return { cut, task: await api.render(projectId, cut.cut.id, input) };
        } catch (cause) {
            try {
                return { cut, task: await api.readRender(projectId, cut.cut.id, intent.requestId) };
            } catch {
                throw cause;
            }
        }
    }
    async function prepareAnother() {
        const intent = await read();
        if (!intent) return;
        let cut: ProjectCutView | undefined;
        try {
            cut = await api.readCut(projectId, intent.requestId);
        } catch (cause) {
            if (!(cause instanceof ApiError) || cause.status !== 404) throw cause;
        }
        if (cut) {
            try {
                const task = await api.readRender(projectId, cut.cut.id, intent.requestId);
                if (!["succeeded", "failed", "cancelled"].includes(task.status)) throw new Error("上次导出仍在执行，请先完成或取消后再导出");
            } catch (cause) {
                if (!(cause instanceof ApiError) || cause.status !== 404) throw cause;
            }
        }
        if ((await read())?.requestId !== intent.requestId) throw new Error("其他窗口更新了导出编号，请重新核对");
        await storage.removeItem(key);
    }
    return { read, submit, prepareAnother };
}
