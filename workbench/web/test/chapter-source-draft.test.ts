import { expect, test } from "bun:test";
import { createChapterSourceDraftSession } from "@/services/chapter-source-draft";
import type { ProjectUnit } from "@/services/api/projects";

const original: ProjectUnit = { id: "chapter-a", projectId: "project-a", kind: "chapter", title: "初稿", sourceText: "<p>初稿正文</p>", wordCount: 4, status: "ready", position: 0, createdAt: "2026-10-30T01:00:00Z", updatedAt: "2026-10-30T01:00:00Z" };
function fixture() {
    const records = new Map<string, string>();
    let fail = false;
    const storage = {
        keys: async () => [...records.keys()],
        getItem: async (key: string) => records.get(key) ?? null,
        setItem: async (key: string, value: string) => {
            if (fail) throw new Error("disk full");
            records.set(key, value);
        },
        removeItem: async (key: string) => {
            if (fail) throw new Error("disk full");
            records.delete(key);
        },
    };
    const session = (id: string, unit = original, isCurrent = () => true) => createChapterSourceDraftSession({ storage, scope: "owner-a", projectId: unit.projectId, unit, editorId: id, isCurrent });
    return {
        records,
        storage,
        session,
        setFail: () => {
            fail = true;
        },
    };
}

test("reopening recovers exact unsaved Chinese title and rich text with its original server version", async () => {
    const f = fixture(),
        first = f.session("first");
    first.setTitle("雨夜重逢");
    first.setHtml("<p><strong>你终于来了。</strong></p>");
    await first.flush();
    const reopened = f.session("reopened"),
        saved = await reopened.recoverable();
    expect(saved).toHaveLength(1);
    reopened.recover(saved[0]);
    await reopened.flush();
    expect(reopened.capture()).toMatchObject({ title: "雨夜重逢", html: "<p><strong>你终于来了。</strong></p>", expectedUpdatedAt: original.updatedAt });
    expect(f.records.size).toBe(2);
});

test("a save acknowledgement preserves text typed after the request and rebases its next save", async () => {
    const f = fixture(),
        editor = f.session("editor");
    editor.setHtml("<p>提交中的正文</p>");
    const submitted = editor.capture();
    editor.setHtml("<p>请求期间继续输入的正文</p>");
    const saved = { ...original, sourceText: submitted.html, updatedAt: "2026-10-30T01:01:00Z" };
    const ack = await editor.acknowledge(submitted, saved);
    expect(ack.unchanged).toBe(false);
    expect(ack.dirty).toBe(true);
    expect(editor.capture()).toMatchObject({ html: "<p>请求期间继续输入的正文</p>", expectedUpdatedAt: saved.updatedAt });
    expect(JSON.parse([...f.records.values()][0]).html).toBe("<p>请求期间继续输入的正文</p>");
});

test("two windows retain separate drafts and a stale draft needs an explicit reviewed rebase", async () => {
    const f = fixture(),
        first = f.session("first"),
        second = f.session("second");
    first.setHtml("<p>窗口一</p>");
    second.setHtml("<p>窗口二</p>");
    await Promise.all([first.flush(), second.flush()]);
    expect(f.records.size).toBe(2);
    const server = { ...original, sourceText: "<p>服务器新版</p>", updatedAt: "2026-10-30T01:02:00Z" };
    expect(second.observeRemote(server).conflict).toBe(true);
    expect(second.capture().expectedUpdatedAt).toBe(original.updatedAt);
    second.rebaseAfterReview(server);
    await second.flush();
    expect(second.capture()).toMatchObject({ html: "<p>窗口二</p>", expectedUpdatedAt: server.updatedAt });
    expect((await f.session("third", server).recoverable()).map((record) => record.draft.html).sort()).toEqual(["<p>窗口一</p>", "<p>窗口二</p>"]);
});

test("cloud success remains cloud success when the local cache becomes unavailable", async () => {
    const f = fixture(),
        editor = f.session("editor");
    editor.setHtml("<p>已保存正文</p>");
    const submitted = editor.capture();
    f.setFail();
    const ack = await editor.acknowledge(submitted, { ...original, sourceText: submitted.html, updatedAt: "2026-10-30T01:03:00Z" });
    expect(ack.unchanged).toBe(true);
    expect(ack.dirty).toBe(false);
});

test("switching chapters flushes the old editor without contaminating the new chapter", async () => {
    const f = fixture(),
        previous = f.session("first"),
        next = f.session("next", { ...original, id: "chapter-b" });
    previous.setHtml("<p>切换前输入</p>");
    next.setHtml("<p>第二章输入</p>");
    await Promise.all([previous.flush(), next.flush()]);
    expect((await f.session("reopen-a").recoverable()).map((row) => row.draft.html)).toEqual(["<p>切换前输入</p>"]);
    expect((await f.session("reopen-b", { ...original, id: "chapter-b" }).recoverable()).map((row) => row.draft.html)).toEqual(["<p>第二章输入</p>"]);
});

test("an account switch blocks pending cache writes, and damaged data is preserved", async () => {
    const f = fixture();
    let owned = true;
    const editor = f.session("editor", original, () => owned);
    editor.setHtml("<p>原账号正文</p>");
    owned = false;
    await editor.flush();
    expect(f.records.size).toBe(0);
    const key = "chapter-source-draft-v1:project-a:chapter-a:damaged";
    f.records.set(key, "{broken");
    await expect(f.session("reopen").recoverable()).rejects.toThrow("本机章节草稿无法读取");
    expect(f.records.get(key)).toBe("{broken");
});
