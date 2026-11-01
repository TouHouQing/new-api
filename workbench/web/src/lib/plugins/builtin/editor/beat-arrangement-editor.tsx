import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Select, Space } from "antd";
import { useEditorHostContext, useEditorStoreApi, useEditorStoreContext } from "@/components/editor/editor-context";
import { getActiveUserScope } from "@/lib/user-scope";
import { localForageStorageForScope } from "@/lib/localforage-storage";
import { createBeatArrangementSession } from "@/services/video-rework-adoption-session";
import { getProjectTimeline } from "@/services/api/project-timeline";
import type { MediaAnalysisView } from "@/services/api/project-media-analysis";
import { normalizeTimelineProject } from "@/lib/timeline/timeline-tracks";
import { timelineContentSignature } from "@/lib/timeline/transcript-cut-command";
import { formatTimelineTime } from "@/lib/timeline/timeline-view";

type Session = ReturnType<typeof createBeatArrangementSession>;
type Intent = NonNullable<Awaited<ReturnType<Session["read"]>>>;

export function BeatArrangementEditor({ view, sourceClipId, disabled, onBusy, onDraftDirty }: { view: MediaAnalysisView; sourceClipId: string; disabled: boolean; onBusy: (busy: boolean) => void; onDraftDirty: (dirty: boolean) => void }) {
    const host = useEditorHostContext(),
        store = useEditorStoreApi(),
        state = useEditorStoreContext();
    const [scope] = useState(getActiveUserScope);
    const session = useMemo(() => createBeatArrangementSession(host.projectId, sourceClipId, localForageStorageForScope(scope)), [host.projectId, sourceClipId, scope]);
    const [intent, setIntent] = useState<Intent>(),
        [ids, setIDs] = useState<string[]>([]),
        [checking, setChecking] = useState(true);
    const [error, setError] = useState(""),
        [notice, setNotice] = useState("");
    const alive = useRef(false),
        submitting = useRef(false),
        lock = useRef(false);
    const owned = () => alive.current && getActiveUserScope() === scope;
    useEffect(() => {
        alive.current = true;
        void session
            .read()
            .then((value) => {
                if (owned()) setIntent(value ?? undefined);
            })
            .catch((failure) => {
                if (owned()) setError(failure instanceof Error ? failure.message : "排镜头记录无法读取");
            })
            .finally(() => {
                if (owned()) setChecking(false);
            });
        return () => {
            alive.current = false;
            if (lock.current) {
                store.getState().setEditingBlocked(false);
                lock.current = false;
            }
        };
    }, [session]);
    useEffect(() => {
        onDraftDirty(!!intent);
        return () => onDraftDirty(false);
    }, [intent, onDraftDirty]);
    const blocked = disabled || checking || submitting.current || state.inPreview || state.saving || state.isDirty;
    async function action(run: () => Promise<void>) {
        if (submitting.current || !owned()) return;
        submitting.current = true;
        onBusy(true);
        setError("");
        try {
            await run();
        } catch (failure) {
            if (owned()) setError(failure instanceof Error ? failure.message : "排镜头失败，请保留原记录");
        } finally {
            try {
                const value = await session.read();
                if (owned()) setIntent(value ?? undefined);
            } catch (failure) {
                if (owned()) setError(failure instanceof Error ? failure.message : "记录无法读取");
            }
            submitting.current = false;
            if (owned()) onBusy(false);
        }
    }
    async function prepare() {
        const local = store.getState();
        if (local.isDirty || local.saving || local.editingBlocked || local.inPreview) throw new Error("请先保存当前剪辑并退出预览");
        const current = await getProjectTimeline(host.projectId);
        if (!owned()) return;
        if (timelineContentSignature(normalizeTimelineProject(current.timeline)) !== timelineContentSignature(store.getState().project!)) throw new Error("当前剪辑与服务端不同，请返回剪辑重新载入后预览");
        const prepared = await session.prepare({ op: "arrangeToBeats", analysisId: view.analysis.id, analysisRevisionId: view.currentVersion.id, sourceClipId, clipIds: ids }, current.revision);
        if (owned()) setIntent(prepared);
    }
    async function apply(verify = false) {
        if (!intent) return;
        const local = store.getState();
        if (local.isDirty || local.saving || local.editingBlocked || local.inPreview) throw new Error("剪辑有未保存变化，请先保存后再核对原排镜头记录");
        local.setEditingBlocked(true);
        lock.current = true;
        try {
            const receipt = verify ? await session.verify() : await session.apply(intent.request.requestId);
            if (!receipt || !owned()) return;
            setNotice("排镜头已保存，修改前后版本和原编号回执已保留。当前工作剪辑会重新载入；后续修改不会被旧回执覆盖。");
            if (!host.reloadTimeline) throw new Error("编辑已保存，请重新打开剪辑读取当前结果");
            await host.reloadTimeline();
            if (!owned()) return;
            await session.clear(intent.request.requestId);
            if (owned()) setIntent(undefined);
        } finally {
            if (lock.current) {
                store.getState().setEditingBlocked(false);
                lock.current = false;
            }
        }
    }
    const clips = (state.project?.clips ?? []).filter((clip) => clip.kind === "video" || clip.kind === "image");
    const chosen = intent?.request.commands[0];
    const order = chosen?.op === "arrangeToBeats" ? chosen.clipIds : ids;
    const selectedClips = intent?.preview.timeline?.clips.filter((clip) => order.includes(clip.id)).sort((a, b) => a.startMs - b.startMs) ?? [];
    return (
        <section aria-label="按音乐节拍排镜头" className="mt-4 min-w-0 border-t border-border pt-3">
            <h3 className="text-sm font-medium">按音乐节拍排镜头</h3>
            <p className="my-2 text-xs text-muted-foreground">选择同一画面轨的镜头并排序，按已核对的真实节拍裁剪排列到当前音乐范围。保留原片、音乐与独立声音；素材不足时会提示。确认后保留前后版本，可在成片版本中恢复。</p>
            {error && <Alert className="mb-2" type="error" title={error} />}
            {notice && <Alert className="mb-2" type="success" title={notice} />}
            {!intent && (
                <Select
                    aria-label="选择按节拍排列的镜头"
                    mode="multiple"
                    showSearch
                    optionFilterProp="label"
                    className="mb-2 w-full"
                    value={ids}
                    disabled={blocked}
                    placeholder="按作品顺序选择2个以上镜头"
                    options={clips.map((clip) => ({ value: clip.id, label: `${clip.title || clip.id} · ${formatTimelineTime(clip.durationMs)}` }))}
                    onChange={setIDs}
                />
            )}
            <ol className="my-2 space-y-1 text-sm">
                {order.map((id, index) => (
                    <li key={id} className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 break-words">
                            {index + 1}. {clips.find((clip) => clip.id === id)?.title || id}
                        </span>
                        {!intent && (
                            <>
                                <Button
                                    size="small"
                                    aria-label={`镜头${index + 1}上移`}
                                    disabled={blocked || index === 0}
                                    onClick={() =>
                                        setIDs((previous) => {
                                            const next = [...previous];
                                            [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                            return next;
                                        })
                                    }
                                >
                                    上移
                                </Button>
                                <Button
                                    size="small"
                                    aria-label={`镜头${index + 1}下移`}
                                    disabled={blocked || index === order.length - 1}
                                    onClick={() =>
                                        setIDs((previous) => {
                                            const next = [...previous];
                                            [next[index], next[index + 1]] = [next[index + 1], next[index]];
                                            return next;
                                        })
                                    }
                                >
                                    下移
                                </Button>
                            </>
                        )}
                    </li>
                ))}
            </ol>
            {!intent ? (
                <Button disabled={blocked || ids.length < 2 || ids.length > 128 || !sourceClipId} onClick={() => void action(prepare)}>
                    预览按节拍排镜头
                </Button>
            ) : (
                <>
                    <p className="my-2 text-sm">
                        音乐范围内 {selectedClips.length} 个镜头；共影响 {intent.preview.changes.length} 个片段（包含跟随字幕或声音）。
                    </p>
                    <ul className="my-2 space-y-1 text-xs">
                        {selectedClips.map((clip) => (
                            <li key={clip.id}>
                                {clip.title || clip.id} · {formatTimelineTime(clip.startMs)}–{formatTimelineTime(clip.startMs + clip.durationMs)}
                            </li>
                        ))}
                    </ul>
                    <Space wrap>
                        <Button type="primary" disabled={blocked} onClick={() => void action(() => apply())}>
                            {intent.phase === "submitted" ? "沿用原编号重试排镜头" : "确认按节拍排镜头"}
                        </Button>
                        <Button disabled={blocked} onClick={() => void action(() => apply(true))}>
                            核对原保存结果
                        </Button>
                        {intent.phase !== "submitted" && (
                            <Button
                                disabled={blocked}
                                onClick={() =>
                                    void action(async () => {
                                        await session.clear(intent.request.requestId);
                                        if (owned()) setIntent(undefined);
                                    })
                                }
                            >
                                返回调整镜头顺序
                            </Button>
                        )}
                    </Space>
                </>
            )}
        </section>
    );
}
