import type { ScopedStateStorage } from "@/lib/localforage-storage";
import type { LyricsRequest } from "./api/project-transcripts";

export type LyricsDraft = { version: 1; projectId: string; transcriptId: string; changedAt: number; request: LyricsRequest; submitted?: LyricsRequest };
export function createLyricsDraftStore(storage: ScopedStateStorage, projectId: string, transcriptId: string, editorId: string) {
    const prefix = `lyrics-draft-v1:${encodeURIComponent(projectId)}:${encodeURIComponent(transcriptId)}:`;
    const key = prefix + editorId;
    let queue: Promise<unknown> = Promise.resolve();
    const serial = <T>(run: () => Promise<T>): Promise<T> => {
        const next = queue.catch(() => undefined).then(run);
        queue = next;
        return next;
    };
    return {
        write: (request: LyricsRequest, submitted?: LyricsRequest) => {
            const raw = JSON.stringify({ version: 1, projectId, transcriptId, changedAt: Date.now(), request, ...(submitted ? { submitted } : {}) } satisfies LyricsDraft);
            return serial(async () => {
                await storage.setItem(key, raw);
            });
        },
        clear: () =>
            serial(async () => {
                await storage.removeItem(key);
            }),
        recover: async () => {
            const rows: { key: string; draft: LyricsDraft }[] = [];
            for (const found of (await storage.keys()).filter((value) => value.startsWith(prefix) && value !== key)) {
                const raw = await storage.getItem(found);
                if (!raw) continue;
                let draft: LyricsDraft;
                try {
                    draft = JSON.parse(raw);
                } catch {
                    throw new Error("本机歌词草稿无法读取，请保留本机数据并导出备份");
                }
                if (
                    draft.version !== 1 ||
                    draft.projectId !== projectId ||
                    draft.transcriptId !== transcriptId ||
                    !Number.isFinite(draft.changedAt) ||
                    typeof draft.request?.lyrics !== "string" ||
                    !Array.isArray(draft.request.anchors) ||
                    typeof draft.request.sourceRevisionId !== "string" ||
                    !Number.isSafeInteger(draft.request.expectedRevision) ||
                    !/^[!-~]{16,128}$/.test(draft.request.requestId) ||
                    (draft.submitted && (draft.submitted.requestId !== draft.request.requestId || JSON.stringify(draft.submitted) !== JSON.stringify(draft.request)))
                )
                    throw new Error("本机歌词草稿或待核对请求不完整，请保留原记录");
                rows.push({ key: found, draft });
            }
            return rows.sort((a, b) => b.draft.changedAt - a.draft.changedAt);
        },
    };
}
