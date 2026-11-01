import { expect, test } from "bun:test";
import { createLyricsDraftStore } from "../src/services/lyrics-draft";
import type { LyricsRequest } from "../src/services/api/project-transcripts";
import type { ScopedStateStorage } from "../src/lib/localforage-storage";

const request: LyricsRequest = { requestId: "lyrics-intent-00000001", expectedRevision: 3, sourceRevisionId: "original", lyrics: "雨夜重逢", anchors: [{ line: 0, startMs: 500, endMs: 1800, reviewed: true }], previewToken: "a".repeat(64) };
function memory(): ScopedStateStorage {
    const values = new Map<string, string>();
    return {
        getItem: async (key) => values.get(key) ?? null,
        setItem: async (key, value) => {
            values.set(key, value);
        },
        removeItem: async (key) => {
            values.delete(key);
        },
        keys: async () => [...values.keys()],
    };
}
test("歌词待核对请求在重开时保留完整参数与原编号；不覆盖其他窗口或项目", async () => {
    const storage = memory();
    const first = createLyricsDraftStore(storage, "project", "transcript", "first");
    const other = createLyricsDraftStore(storage, "project", "transcript", "other");
    const unrelated = createLyricsDraftStore(storage, "different", "transcript", "another");
    await first.write(request, request);
    await other.write({ ...request, requestId: "different-request-0001", lyrics: "另一份" });
    await unrelated.write(request);
    const reopened = createLyricsDraftStore(storage, "project", "transcript", "reopened");
    const found = await reopened.recover();
    expect(found).toHaveLength(2);
    expect(found.find((row) => row.draft.submitted)?.draft.submitted).toEqual(request);
    await reopened.write(request, request);
    await reopened.clear();
    expect(await reopened.recover()).toHaveLength(2);
    expect(await unrelated.recover()).toHaveLength(0);
});
test("草稿顺序写入和清理；损坏记录不会静默替换为新请求", async () => {
    const storage = memory(),
        editor = createLyricsDraftStore(storage, "p", "t", "one");
    const initial = editor.write(request);
    const latest = editor.write({ ...request, lyrics: "后写入" });
    await Promise.all([initial, latest]);
    const reader = createLyricsDraftStore(storage, "p", "t", "two");
    expect((await reader.recover())[0].draft.request.lyrics).toBe("后写入");
    const queued = editor.write(request, request);
    const cleared = editor.clear();
    await Promise.all([queued, cleared]);
    expect(await reader.recover()).toEqual([]);
    await editor.write(request);
    const key = (await storage.keys())[0];
    await storage.setItem(key, "{bad");
    await expect(reader.recover()).rejects.toThrow("无法读取");
    expect(await storage.getItem(key)).toBe("{bad");
});
