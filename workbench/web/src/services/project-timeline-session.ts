import { canonicalize } from "json-canonicalize";

import { ApiError } from "@/services/api/request";
import { getProjectTimeline, saveProjectTimeline, type ProjectTimelineView } from "@/services/api/project-timeline";
import { normalizeTimelineProject } from "@/lib/timeline/timeline-tracks";
import type { TimelineProject } from "@/types/timeline";
import type { StateStorage } from "zustand/middleware";

type DraftStorage = StateStorage & { keys?: () => Promise<string[]> };

export type TimelineRecoveryDraft = { key: string; updatedAt: string; baseRevision: number | null; timeline: TimelineProject | null; raw: string; error?: string };

function readRecovery(key: string, raw: string): TimelineRecoveryDraft {
    try {
        if (raw.length > 8 * 1024 * 1024) throw new Error("草稿超过编辑器大小限制，可下载后检查");
        const value = JSON.parse(raw);
        if (!value || !value.timeline || !Array.isArray(value.timeline.clips) || !Array.isArray(value.timeline.tracks)) throw new Error("草稿结构不完整，可下载后检查");
        return { key, raw, updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "", baseRevision: Number.isSafeInteger(value.baseRevision) ? value.baseRevision : null, timeline: normalizeTimelineProject(value.timeline) };
    } catch (error) {
        return { key, raw, updatedAt: "", baseRevision: null, timeline: null, error: error instanceof Error ? error.message : "无法读取草稿" };
    }
}

/** One mounted editor owns a save cursor and its own recovery draft. Requests
 * serialize in editor-store; a different window cannot reuse this cursor. */
export function createProjectTimelineSession(projectId: string, storage: DraftStorage, draftId = crypto.randomUUID(), api = { load: getProjectTimeline, save: saveProjectTimeline }, onServerState?: (view: ProjectTimelineView) => void) {
    let revision: number | null = null;
    const legacyKey = `editor-timeline:${projectId}`;
    const recoveryKey = `editor-timeline-recovery:${projectId}:${draftId}`;
    const recoveryPrefix = `editor-timeline-recovery:${projectId}:`;
    return {
        getRevision: () => revision,
        async listRecoveryDrafts(): Promise<TimelineRecoveryDraft[]> {
            const keys = storage.keys ? await storage.keys() : [recoveryKey];
            const drafts: TimelineRecoveryDraft[] = [];
            for (const key of keys.filter((key) => key.startsWith(recoveryPrefix))) {
                const raw = await storage.getItem(key);
                if (raw) drafts.push(readRecovery(key, raw));
            }
            return drafts.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        },
        async restoreRecovery(key: string, current: TimelineProject): Promise<TimelineProject> {
            if (!key.startsWith(recoveryPrefix) || revision === null) throw new Error("草稿不属于当前项目，或服务端时间线尚未读取");
            const raw = await storage.getItem(key);
            if (!raw) throw new Error("草稿已被移除，请刷新恢复列表");
            const draft = readRecovery(key, raw);
            if (!draft.timeline) throw new Error(draft.error || "草稿不可恢复，请先下载检查");
            // Preserve the current cut before intentional replacement. Unlike
            // a routine cache write, failure here must stop the replacement.
            await storage.setItem(`${recoveryKey}:before-${crypto.randomUUID()}`, JSON.stringify({ timeline: current, baseRevision: revision, updatedAt: new Date().toISOString() }));
            await this.save(draft.timeline);
            await Promise.resolve(storage.removeItem(key)).catch((error) => console.warn("已恢复的草稿清理失败", error));
            return draft.timeline;
        },
        async removeRecovery(key: string): Promise<void> {
            if (!key.startsWith(recoveryPrefix)) throw new Error("草稿不属于当前项目");
            await storage.removeItem(key);
        },
        async load(signal?: AbortSignal): Promise<TimelineProject> {
            const current = await api.load(projectId, signal);
            if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
            revision = current.revision;
            onServerState?.(current);
            if (!current.exists) {
                const local = await Promise.resolve(storage.getItem(legacyKey)).catch(() => null);
                if (local) {
                    const timeline = normalizeTimelineProject(JSON.parse(local));
                    const migrated = await api.save(projectId, timeline, revision);
                    revision = migrated.revision;
                    onServerState?.(migrated);
                    return normalizeTimelineProject(migrated.timeline);
                }
            }
            return normalizeTimelineProject(current.timeline);
        },
        async save(timeline: TimelineProject) {
            if (revision === null) throw new Error("请先成功读取服务端时间线，再继续编辑");
            // A recovery draft is useful even when the server is unavailable;
            // browser storage failure must not prevent a server save.
            await Promise.resolve(storage.setItem(recoveryKey, JSON.stringify({ timeline, baseRevision: revision, updatedAt: new Date().toISOString() }))).catch((error) => console.warn("时间线恢复草稿写入失败", error));
            try {
                const saved = await api.save(projectId, timeline, revision);
                revision = saved.revision;
                onServerState?.(saved);
            } catch (error) {
                if (!(error instanceof ApiError) || error.reason !== "project_timeline_revision_conflict") throw error;
                const current = await api.load(projectId);
                // A lost successful response can be acknowledged by content;
                // a different edit remains a visible conflict.
                if (canonicalize(current.timeline) !== canonicalize(timeline)) throw error;
                revision = current.revision;
                onServerState?.(current);
            }
            await Promise.resolve(storage.setItem(legacyKey, JSON.stringify(timeline))).catch((error) => console.warn("时间线本地缓存写入失败", error));
            await Promise.resolve(storage.removeItem(recoveryKey)).catch((error) => console.warn("时间线恢复草稿清理失败", error));
        },
    };
}
