import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Checkbox } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { useEditorHostContext, useEditorStoreApi } from "@/components/editor/editor-context";
import { previewProjectCutReview, type CutReviewPreview, type CutReviewRequest, type CutReviewResult } from "@/services/api/project-timeline";
import { legacyImportFieldLabel } from "@/lib/legacy-import-fields";
import { createLegacySettingsReviewSession } from "@/services/legacy-settings-review-session";
import { localForageStorageForScope } from "@/lib/localforage-storage";
import { getActiveUserScope } from "@/lib/user-scope";
import { ApiError } from "@/services/api/request";

export function EditorLegacyReview() {
    const host = useEditorHostContext(),
        store = useEditorStoreApi();
    const [open, setOpen] = useState(false),
        [busy, setBusy] = useState(false),
        [error, setError] = useState("");
    const [plan, setPlan] = useState<CutReviewPreview>(),
        [result, setResult] = useState<CutReviewResult>(),
        [confirmed, setConfirmed] = useState(false);
    const intent = useRef<CutReviewRequest | undefined>(undefined),
        lock = useRef(false),
        alive = useRef(true);
    const [pending, setPending] = useState(false),
        [reading, setReading] = useState(true);
    const scope = getActiveUserScope();
    const session = useMemo(() => createLegacySettingsReviewSession(host.projectId, localForageStorageForScope(scope)), [host.projectId, scope]);
    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
            if (lock.current) store.getState().setEditingBlocked(false);
            store.getState().setPanelDraftDirty("legacy-settings-review", false);
        };
    }, [store]);
    useEffect(() => {
        let current = true;
        setReading(true);
        void session
            .read()
            .then((value) => {
                if (current) {
                    setPending(!!value);
                    if (value) store.getState().setPanelDraftDirty("legacy-settings-review", true);
                }
            })
            .catch((cause) => {
                if (current) setError(cause instanceof Error ? cause.message : "读取上次核对记录失败");
            })
            .finally(() => {
                if (current) setReading(false);
            });
        return () => {
            current = false;
        };
    }, [session, store]);
    const resume = async () => {
        if (busy || store.getState().inPreview || store.getState().editingBlocked) return;
        setBusy(true);
        setError("");
        try {
            const value = await session.read();
            if (!value) throw new Error("核对记录不存在，请重新读取项目");
            if (!alive.current) return;
            intent.current = value.request;
            setPlan(value.plan);
            setConfirmed(false);
            setOpen(true);
            store.getState().pausePlayback();
            store.getState().setEditingBlocked(true);
            lock.current = true;
            try {
                const receipt = await session.result();
                if (alive.current) setResult(receipt);
            } catch {
                if (alive.current) setError("尚未取得完成回执。可核对原预览后沿用同一编号重试，不会重复放弃设置。");
            }
        } catch (cause) {
            if (alive.current) setError(cause instanceof Error ? cause.message : "读取核对记录失败");
        } finally {
            if (alive.current) setBusy(false);
        }
    };
    const enter = async () => {
        const state = store.getState();
        if (reading || pending || state.editingBlocked || state.inPreview || state.hasPendingPanelEdits) return;
        state.setEditingBlocked(true);
        lock.current = true;
        state.pausePlayback();
        setOpen(true);
        setBusy(true);
        setError("");
        setPlan(undefined);
        setResult(undefined);
        setConfirmed(false);
        try {
            await state.flushSave();
            const saved = store.getState(),
                revision = host.getTimelineRevision?.();
            if (saved.isDirty || saved.saving || revision == null) throw new Error("请先成功保存当前剪辑");
            const request = { requestId: crypto.randomUUID(), expectedRevision: revision, discardFields: [...(host.deliveryBlockers ?? [])] };
            const preview = await previewProjectCutReview(host.projectId, request);
            if (alive.current) {
                intent.current = { ...request, previewToken: preview.previewToken };
                setPlan(preview);
            }
        } catch (cause) {
            if (alive.current) setError(cause instanceof Error ? cause.message : "无法核对旧版设置");
        } finally {
            if (alive.current) setBusy(false);
        }
    };
    const leave = () => {
        if (busy || result || pending) return;
        setOpen(false);
        intent.current = undefined;
        setPlan(undefined);
        store.getState().setPanelDraftDirty("legacy-settings-review", false);
        if (lock.current) store.getState().setEditingBlocked(false);
        lock.current = false;
    };
    const reload = async () => {
        setBusy(true);
        setError("");
        try {
            if (!host.reloadTimeline) throw new Error("当前编辑器不能重新读取剪辑，请重新进入项目");
            if (store.getState().isDirty || store.getState().saving) throw new Error("请先保留当前草稿，再读取核对结果");
            await host.reloadTimeline();
            await session.complete();
            if (!alive.current) return;
            setPending(false);
            setOpen(false);
            setResult(undefined);
            setPlan(undefined);
            intent.current = undefined;
            store.getState().setPanelDraftDirty("legacy-settings-review", false);
            store.getState().setEditingBlocked(false);
            lock.current = false;
        } catch (cause) {
            if (alive.current) setError(cause instanceof Error ? cause.message : "读取已核对的剪辑失败，请重试");
        } finally {
            if (alive.current) setBusy(false);
        }
    };
    const apply = async () => {
        if (!intent.current || !plan || !confirmed || busy) return;
        setBusy(true);
        setError("");
        store.getState().setPanelDraftDirty("legacy-settings-review", true);
        try {
            const receipt = await session.submit({ request: intent.current, plan });
            if (alive.current) setPending(true);
            if (alive.current) setResult(receipt);
        } catch (cause) {
            if (alive.current) {
                let retained = true;
                try {
                    retained = !!(await session.read());
                } catch {
                    /* Keep an unreadable confirmation for recovery. */
                }
                setPending(retained);
                setError(
                    cause instanceof ApiError && cause.status && cause.status < 500
                        ? cause.message
                        : retained
                          ? "核对结果尚未确认，请沿用原编号重试。恢复网络后也可重新进入此项目核对。"
                          : "本次核对未完成，请保留当前剪辑并重试；若本机存储已满，请先释放空间。",
                );
            }
        } finally {
            if (alive.current) setBusy(false);
        }
    };
    const fields = host.deliveryBlockers ?? [];
    if (!fields.length && !open && !pending && !error) return null;
    return (
        <>
            <div role="alert" className="mb-3 rounded-md border border-[var(--previs-sequencer-border)] p-2.5 text-xs text-[var(--previs-dock-fg)]">
                <p className="font-medium">{pending ? "上次核对结果需要确认" : `还有 ${fields.length} 项旧版设置需要处理`}</p>
                <ul className="my-2 list-inside list-disc">
                    {fields.map((field) => (
                        <li key={field}>{legacyImportFieldLabel(field)}</li>
                    ))}
                </ul>
                <p className="mb-2 leading-relaxed">{pending ? "请先读取上次确认的完成回执，系统会沿用原操作编号。" : "请到“剪辑版本”更新原版转换。若决定采用目前的画面，也可核对后放弃未转换的设置。"}</p>
                {pending ? (
                    <Button size="small" loading={busy} onClick={() => void resume()}>
                        核对上次处理结果
                    </Button>
                ) : (
                    <Button
                        size="small"
                        disabled={
                            reading ||
                            store.getState().editingBlocked ||
                            store.getState().inPreview ||
                            store.getState().hasPendingPanelEdits ||
                            fields.some((field) => field.startsWith("delivery.") || field.includes(".source-") || field.endsWith(".converter-mismatch"))
                        }
                        onClick={() => void enter()}
                    >
                        核对旧版设置
                    </Button>
                )}
                {!open && error && (
                    <p role="alert" className="mt-2 text-[var(--previs-danger)]">
                        {error}
                    </p>
                )}
            </div>
            <AppModal open={open} title="核对未转换的旧版设置" onCancel={leave} closable={!busy && !result && !pending} maskClosable={false} keyboard={!busy && !result && !pending} footer={null}>
                {busy && !plan && <p role="status">正在读取已保存的画面与来源…</p>}
                {plan && !result && (
                    <div className="space-y-3">
                        <p>确认后将采用目前剪辑中的画面，并放弃以下旧版设置：</p>
                        <ul className="list-inside list-disc">
                            {plan.discardFields.map((field) => (
                                <li key={field}>{legacyImportFieldLabel(field)}</li>
                            ))}
                        </ul>
                        <p>
                            {plan.before.clips} 个片段 · {(plan.before.durationMs / 1000).toFixed(1)} 秒。系统会保存“放弃旧版设置前”的恢复版本。
                        </p>
                        <Checkbox checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)}>
                            我已检查当前画面，确认不再使用上述旧版设置
                        </Checkbox>
                        <div className="flex justify-end gap-2">
                            <Button disabled={busy || pending} onClick={leave}>
                                返回继续编辑
                            </Button>
                            <Button type="primary" aria-label={pending ? "沿用原编号重试确认" : "确认放弃并保存恢复版本"} aria-busy={busy} disabled={!confirmed} loading={busy} onClick={() => void apply()}>
                                {pending ? "沿用原编号重试确认" : "确认放弃并保存恢复版本"}
                            </Button>
                        </div>
                    </div>
                )}
                {result && (
                    <div className="space-y-3">
                        <p role="status">已保存核对结果与恢复版本。原始工程和旧成片仍保留。</p>
                        <Button type="primary" loading={busy} onClick={() => void reload()}>
                            读取已核对的剪辑
                        </Button>
                    </div>
                )}
                {error && (
                    <p role="alert" className="mt-3 text-[var(--previs-danger)]">
                        {error}
                    </p>
                )}
            </AppModal>
        </>
    );
}
