import { describe, expect, test } from "bun:test";
import { ApiError } from "../src/services/api/request";
import { createProjectTimelineSession } from "../src/services/project-timeline-session";
import type { TimelineProject } from "../src/types/timeline";

function storage() {
    const values = new Map<string, string>();
    return {
        values,
        keys: async () => [...values.keys()],
        getItem: async (key: string) => values.get(key) ?? null,
        setItem: async (key: string, value: string) => {
            values.set(key, value);
        },
        removeItem: async (key: string) => {
            values.delete(key);
        },
    };
}
const timeline: TimelineProject = { version: 2, tracks: [], clips: [], durationMs: 0 };

describe("project cut persistence", () => {
    test("server delivery warnings survive load, save and lost-response reconciliation", async () => {
        const notices: (string[] | undefined)[] = [],
            data = storage();
        let lost = false;
        const session = createProjectTimelineSession(
            "p",
            data,
            "warnings",
            {
                load: async () => ({ exists: true, revision: lost ? 3 : 1, timeline, deliveryBlockers: ["regionalVersions.reframes"] }),
                save: async () => {
                    if (lost) throw new ApiError("conflict", { reason: "project_timeline_revision_conflict" });
                    return { exists: true, revision: 2, timeline, deliveryBlockers: ["regionalVersions.reframes"] };
                },
            },
            (view) => notices.push(view.deliveryBlockers),
        );
        await session.load();
        await session.save(timeline);
        lost = true;
        await session.save(timeline);
        expect(notices).toEqual(Array(3).fill(["regionalVersions.reframes"]));
        expect(session.getRevision()).toBe(3);
    });
    test("finds closed-window drafts only for this project and keeps a replacement backup", async () => {
        const cache = storage();
        const recovered: TimelineProject = {
            version: 2,
            tracks: [{ id: "video", kind: "video", label: "视频", order: 0 }],
            clips: [{ id: "restored", nodeId: "asset:image", trackId: "video", kind: "image", startMs: 0, durationMs: 2000, directMedia: { id: "image", kind: "image", title: "原画", storageKey: "resource:image" } }],
            durationMs: 2000,
        };
        cache.values.set("editor-timeline-recovery:p:closed", JSON.stringify({ timeline: recovered, baseRevision: 1, updatedAt: "2026-10-21T00:00:00Z" }));
        cache.values.set("editor-timeline-recovery:other:closed", JSON.stringify({ timeline }));
        const writes: TimelineProject[] = [];
        const session = createProjectTimelineSession("p", cache, "new", {
            load: async () => ({ exists: true, revision: 2, timeline }),
            save: async (_id, cut) => {
                writes.push(cut);
                return { exists: true, revision: 3, timeline: cut };
            },
        });
        expect(session.getRevision()).toBeNull();
        await session.load();
        expect(session.getRevision()).toBe(2);
        const drafts = await session.listRecoveryDrafts();
        expect(drafts.length).toBe(1);
        await session.restoreRecovery(drafts[0]!.key, timeline);
        expect(writes[0]?.durationMs).toBe(2000);
        expect(session.getRevision()).toBe(3);
        expect(cache.values.has("editor-timeline-recovery:p:closed")).toBe(false);
        const backups = await session.listRecoveryDrafts();
        expect(backups.length).toBe(1);
        expect(backups[0]?.timeline?.durationMs).toBe(0);
    });
    test("corrupt drafts remain downloadable and cannot replace the server cut", async () => {
        const cache = storage();
        cache.values.set("editor-timeline-recovery:p:broken", "{broken");
        let writes = 0;
        const session = createProjectTimelineSession("p", cache, "new", {
            load: async () => ({ exists: true, revision: 2, timeline }),
            save: async (_id, cut) => {
                writes++;
                return { exists: true, revision: 3, timeline: cut };
            },
        });
        await session.load();
        const drafts = await session.listRecoveryDrafts();
        expect(drafts[0]?.timeline).toBeNull();
        expect(drafts[0]?.raw).toBe("{broken");
        await expect(session.restoreRecovery(drafts[0]!.key, timeline)).rejects.toThrow();
        expect(writes).toBe(0);
        await expect(session.restoreRecovery("editor-timeline-recovery:other:closed", timeline)).rejects.toThrow("不属于");
    });
    test("does not replace a cut when its recovery backup cannot be written", async () => {
        const cache = storage();
        const key = "editor-timeline-recovery:p:closed";
        cache.values.set(key, JSON.stringify({ timeline }));
        cache.setItem = async () => {
            throw new Error("disk full");
        };
        let writes = 0;
        const session = createProjectTimelineSession("p", cache, "new", {
            load: async () => ({ exists: true, revision: 2, timeline }),
            save: async (_id, cut) => {
                writes++;
                return { exists: true, revision: 3, timeline: cut };
            },
        });
        await session.load();
        await expect(session.restoreRecovery(key, timeline)).rejects.toThrow("disk full");
        expect(writes).toBe(0);
        expect(cache.values.has(key)).toBe(true);
    });
    test("migrates an old browser cut only when the server has none", async () => {
        const cache = storage();
        cache.values.set("editor-timeline:p", JSON.stringify(timeline));
        const revisions: number[] = [];
        const session = createProjectTimelineSession("p", cache, "tab", {
            load: async () => ({ exists: false, revision: 0, timeline }),
            save: async (_id, cut, revision) => {
                revisions.push(revision);
                return { exists: true, revision: 1, timeline: cut };
            },
        });
        await session.load();
        expect(revisions).toEqual([0]);
        await session.save(timeline);
        expect(revisions).toEqual([0, 1]);
        expect(cache.values.has("editor-timeline-recovery:p:tab")).toBe(false);
    });
    test("does not overwrite a remote cut with a stale browser cache", async () => {
        const cache = storage();
        cache.values.set("editor-timeline:p", "broken old cache");
        let saves = 0;
        const session = createProjectTimelineSession("p", cache, "tab", {
            load: async () => ({ exists: true, revision: 4, timeline }),
            save: async (_id, cut) => {
                saves++;
                return { exists: true, revision: 5, timeline: cut };
            },
        });
        await session.load();
        expect(saves).toBe(0);
    });
    test("keeps the recovery draft when another window has a different edit", async () => {
        const cache = storage();
        let loads = 0;
        const newer = { ...timeline, updatedAt: "another-window" };
        const session = createProjectTimelineSession("p", cache, "tab", {
            load: async () => ({ exists: true, revision: ++loads, timeline: loads === 1 ? timeline : newer }),
            save: async () => {
                throw new ApiError("conflict", { status: 409, reason: "project_timeline_revision_conflict" });
            },
        });
        await session.load();
        await expect(session.save(timeline)).rejects.toThrow("conflict");
        expect(cache.values.has("editor-timeline-recovery:p:tab")).toBe(true);
    });
    test("acknowledges an identical committed cut after a lost response", async () => {
        const cache = storage();
        let loads = 0;
        const session = createProjectTimelineSession("p", cache, "tab", {
            load: async () => ({ exists: true, revision: ++loads, timeline }),
            save: async () => {
                throw new ApiError("conflict", { status: 409, reason: "project_timeline_revision_conflict" });
            },
        });
        await session.load();
        await session.save(timeline);
        expect(cache.values.has("editor-timeline-recovery:p:tab")).toBe(false);
        expect(loads).toBe(2);
        expect(session.getRevision()).toBe(2);
    });
});
