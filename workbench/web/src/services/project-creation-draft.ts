import type { ScopedStateStorage } from "@/lib/localforage-storage";
import type { ProjectCreationInput } from "./api/projects";

export type ProjectCreationDraft = { version: 1; changedAt: number; input: ProjectCreationInput; submitted?: ProjectCreationInput; uploadName?: string };

/** Separate window records; recovering a record never overwrites its owner. */
export function createProjectCreationDraftStore(storage: ScopedStateStorage, editorId: string) {
    const prefix = "project-creation-draft-v1:",
        key = prefix + editorId;
    let queue: Promise<unknown> = Promise.resolve();
    const serial = <T>(run: () => Promise<T>) => {
        const next = queue.catch(() => undefined).then(run);
        queue = next;
        return next;
    };
    const decode = (raw: string): ProjectCreationDraft => {
        let value: ProjectCreationDraft;
        try {
            value = JSON.parse(raw);
        } catch {
            throw new Error("创建草稿无法读取，请保留本机数据并重新打开");
        }
        if (
            raw.length > 600000 ||
            value.version !== 1 ||
            !Number.isFinite(value.changedAt) ||
            typeof value.input?.name !== "string" ||
            !/^[!-~]{16,128}$/.test(value.input.idempotencyKey || "") ||
            !["idea", "upload", "template"].includes(value.input.starter?.entry || "") ||
            !value.input.creativeBrief ||
            (value.submitted && JSON.stringify(value.submitted) !== JSON.stringify(value.input))
        )
            throw new Error("创建草稿或待核对请求不完整，请保留原记录");
        return value;
    };
    return {
        key,
        write: async (input: ProjectCreationInput, submitted?: ProjectCreationInput, uploadName?: string) => {
            const raw = JSON.stringify({ version: 1, changedAt: Date.now(), input, ...(submitted ? { submitted } : {}), ...(uploadName ? { uploadName } : {}) } satisfies ProjectCreationDraft);
            decode(raw);
            return serial(async () => {
                await storage.setItem(key, raw);
                if ((await storage.getItem(key)) !== raw) throw new Error("创建草稿尚未保存，请重试");
            });
        },
        clear: () =>
            serial(async () => {
                await storage.removeItem(key);
            }),
        recover: async () => {
            const rows: { key: string; draft: ProjectCreationDraft }[] = [];
            for (const found of (await storage.keys()).filter((item) => item.startsWith(prefix))) {
                const raw = await storage.getItem(found);
                if (raw) rows.push({ key: found, draft: decode(raw) });
            }
            return rows.sort((a, b) => b.draft.changedAt - a.draft.changedAt);
        },
    };
}
