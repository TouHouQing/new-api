import type { StateStorage } from "zustand/middleware";
import type { ProjectUnit } from "./api/projects";

type Storage = StateStorage & { keys(): Promise<string[]> };
type Base = Pick<ProjectUnit, "updatedAt" | "title" | "sourceText" | "status">;
export type ChapterSourceDraft = { version: 1; projectId: string; unitId: string; editorId: string; base: Base; title: string; html: string; editVersion: number; changedAt: number };
export type ChapterSourceSubmission = { unitId: string; title: string; html: string; version: number; expectedUpdatedAt: string; status: ProjectUnit["status"] };
export type RecoverableChapterDraft = { key: string; raw: string; draft: ChapterSourceDraft };

const localQueues = new Map<string, Promise<unknown>>();
const prefix = (projectId: string, unitId: string) => `chapter-source-draft-v1:${encodeURIComponent(projectId)}:${encodeURIComponent(unitId)}:`;
async function locked<T>(scope: string, key: string, run: () => Promise<T>): Promise<T> {
    const name = `yingce:chapter-draft:${scope}:${key}`;
    if (globalThis.navigator?.locks) return navigator.locks.request(name, run);
    const previous = localQueues.get(name) ?? Promise.resolve();
    const pending = previous.catch(() => undefined).then(run);
    localQueues.set(name, pending);
    try {
        return await pending;
    } finally {
        if (localQueues.get(name) === pending) localQueues.delete(name);
    }
}
function parse(raw: string, projectId: string, unitId: string): ChapterSourceDraft {
    let draft: ChapterSourceDraft;
    try {
        draft = JSON.parse(raw);
    } catch {
        throw new Error("本机章节草稿无法读取，请保留本机数据后重试");
    }
    if (
        draft?.version !== 1 ||
        draft.projectId !== projectId ||
        draft.unitId !== unitId ||
        typeof draft.editorId !== "string" ||
        !draft.editorId ||
        !draft.base ||
        !Number.isFinite(Date.parse(draft.base.updatedAt)) ||
        ![draft.base.title, draft.base.sourceText, draft.base.status, draft.title, draft.html].every((value) => typeof value === "string") ||
        !Number.isSafeInteger(draft.editVersion) ||
        draft.editVersion < 0 ||
        !Number.isFinite(draft.changedAt)
    )
        throw new Error("本机章节草稿格式不完整，请保留本机数据后检查");
    return draft;
}
const baseline = (unit: Base): Base => ({ updatedAt: unit.updatedAt, title: unit.title, sourceText: unit.sourceText || "", status: unit.status });

/** One editor owns one record. Recovering another window's draft copies it;
 * saving removes that older copy only under a shared lock if it is unchanged. */
export function createChapterSourceDraftSession(options: { storage: Storage; scope: string; projectId: string; unit: ProjectUnit; editorId: string; isCurrent: () => boolean; onPersist?: (error?: unknown, version?: number) => void }) {
    const { storage, scope, projectId, unit, editorId, isCurrent } = options;
    const key = prefix(projectId, unit.id) + editorId;
    let base = baseline(unit),
        remote = baseline(unit),
        title = unit.title,
        html = unit.sourceText || "",
        version = 0,
        dirty = false;
    let origin: RecoverableChapterDraft | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    let pending: Promise<void> = Promise.resolve();
    const snapshot = (): ChapterSourceDraft => ({ version: 1, projectId, unitId: unit.id, editorId, base: { ...base }, title, html, editVersion: version, changedAt: Date.now() });
    const state = () => ({ unitId: unit.id, title, html, version, dirty, base: { ...base }, remote: { ...remote }, conflict: dirty && base.updatedAt !== remote.updatedAt });
    function persist() {
        if (timer) {
            clearTimeout(timer);
            timer = undefined;
        }
        let writtenVersion: number | undefined;
        pending = pending
            .catch(() => undefined)
            .then(() =>
                locked(scope, key, async () => {
                    if (!isCurrent()) return;
                    const draft = snapshot();
                    writtenVersion = draft.editVersion;
                    if (dirty) await storage.setItem(key, JSON.stringify(draft));
                    else await storage.removeItem(key);
                }),
            )
            .then(
                () => {
                    if (isCurrent()) options.onPersist?.(undefined, writtenVersion);
                },
                (error) => {
                    if (isCurrent()) options.onPersist?.(error);
                    throw error;
                },
            );
        return pending;
    }
    function schedule() {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            void persist().catch(() => undefined);
        }, 200);
    }
    async function removeOriginIfUnchanged() {
        const previous = origin;
        // Without a cross-window lock, preserve the other editor's record.
        if (!previous || !globalThis.navigator?.locks || !isCurrent()) return;
        await locked(scope, previous.key, async () => {
            if ((await storage.getItem(previous.key)) === previous.raw) await storage.removeItem(previous.key);
        });
        if (origin === previous) origin = undefined;
    }
    return {
        state,
        setTitle(value: string) {
            title = value;
            version++;
            dirty = true;
            schedule();
        },
        setHtml(value: string) {
            html = value;
            version++;
            dirty = true;
            schedule();
        },
        capture(): ChapterSourceSubmission {
            return { unitId: unit.id, title: title.trim(), html, version, expectedUpdatedAt: base.updatedAt, status: html === base.sourceText ? base.status : "ready" };
        },
        async recoverable(): Promise<RecoverableChapterDraft[]> {
            const keys = (await storage.keys()).filter((value) => value.startsWith(prefix(projectId, unit.id)) && value !== key),
                records: RecoverableChapterDraft[] = [];
            for (const candidate of keys) {
                const raw = await storage.getItem(candidate);
                if (!raw) continue;
                const draft = parse(raw, projectId, unit.id);
                if (draft.title === remote.title && draft.html === remote.sourceText) continue;
                records.push({ key: candidate, raw, draft });
            }
            return records.sort((a, b) => b.draft.changedAt - a.draft.changedAt);
        },
        recover(record: RecoverableChapterDraft) {
            if (!record.key.startsWith(prefix(projectId, unit.id))) throw new Error("草稿不属于当前章节");
            const draft = parse(record.raw, projectId, unit.id);
            origin = record;
            base = { ...draft.base };
            title = draft.title;
            html = draft.html;
            version++;
            dirty = true;
            schedule();
            return state();
        },
        observeRemote(value: ProjectUnit) {
            if (value.id !== unit.id) throw new Error("服务器章节身份不一致");
            remote = baseline(value);
            return state();
        },
        rebaseAfterReview(value: ProjectUnit) {
            if (value.id !== unit.id) throw new Error("服务器章节身份不一致");
            remote = baseline(value);
            base = { ...remote };
            dirty = true;
            schedule();
            return state();
        },
        async adoptRemote(value: ProjectUnit) {
            if (value.id !== unit.id) throw new Error("服务器章节身份不一致");
            base = remote = baseline(value);
            title = value.title;
            html = value.sourceText;
            version++;
            dirty = false;
            try {
                await persist();
                await removeOriginIfUnchanged();
            } catch (error) {
                if (isCurrent()) options.onPersist?.(error);
            }
            return state();
        },
        async acknowledge(submitted: ChapterSourceSubmission, value: ProjectUnit) {
            if (value.id !== unit.id || submitted.unitId !== unit.id) throw new Error("保存回执不属于当前章节");
            base = remote = baseline(value);
            const unchanged = version === submitted.version;
            if (unchanged) {
                title = value.title;
                html = value.sourceText;
                dirty = false;
            }
            try {
                await persist();
                await removeOriginIfUnchanged();
            } catch (error) {
                if (isCurrent()) options.onPersist?.(error);
            }
            return { ...state(), unchanged: version === submitted.version && !dirty };
        },
        flush: persist,
    };
}
export type ChapterSourceDraftSession = ReturnType<typeof createChapterSourceDraftSession>;
