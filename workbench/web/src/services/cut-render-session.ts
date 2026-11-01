import type { StateStorage } from "zustand/middleware";
import { createProjectCutRender, readProjectCutRender, type ProjectCut } from "@/services/api/project-cuts";

type Intent = { version: 1; projectId: string; cutId: string; timelineSha256: string; requestId: string };

/** Store intent before submission. Retrying after an unknown reply creates or
 * reads the same server task; a new export requires an explicit fresh intent. */
export function createCutRenderSession(projectId: string, cut: Pick<ProjectCut, "id" | "timelineSha256">, storage: StateStorage, api = { create: createProjectCutRender, read: readProjectCutRender }) {
    const key = `cut-render-v1:${projectId}:${cut.id}`;
    async function read(): Promise<Intent | null> {
        const raw = await storage.getItem(key);
        if (!raw) return null;
        let value: Intent;
        try {
            value = JSON.parse(raw);
        } catch {
            throw new Error("导出编号无法读取，请保留本地数据后检查");
        }
        if (
            value?.version !== 1 ||
            value.projectId !== projectId ||
            value.cutId !== cut.id ||
            value.timelineSha256 !== cut.timelineSha256 ||
            !/^[a-f0-9]{64}$/.test(value.timelineSha256) ||
            typeof value.requestId !== "string" ||
            !/^[!-~]{16,128}$/.test(value.requestId)
        )
            throw new Error("保存的导出意图与此版本不匹配，请保留原编号后检查");
        return value;
    }
    async function submit() {
        let intent = await read();
        if (!intent) {
            intent = { version: 1, projectId, cutId: cut.id, timelineSha256: cut.timelineSha256, requestId: crypto.randomUUID() };
            await storage.setItem(key, JSON.stringify(intent));
        }
        return api.create(projectId, cut.id, { requestId: intent.requestId, timelineSha256: intent.timelineSha256 });
    }
    async function prepareAnother() {
        const intent = await read();
        if (!intent) return;
        const task = await api.read(projectId, cut.id, intent.requestId);
        if (!["succeeded", "failed", "cancelled"].includes(task.status)) throw new Error("上次导出仍在执行，请先完成或取消后再导出一份");
        if ((await read())?.requestId !== intent.requestId) throw new Error("另一个窗口更新了导出编号，请重新核对");
        await storage.removeItem(key);
    }
    return { read, submit, prepareAnother };
}
