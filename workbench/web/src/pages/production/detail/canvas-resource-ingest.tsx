import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "antd";
import { useSearchParams } from "react-router";
import { getActiveUserScope } from "@/lib/user-scope";
import { localForageStorageForScope } from "@/lib/localforage-storage";
import { getResource, type RemoteResource } from "@/services/api/resources";
import { resolveMediaUrl } from "@/services/file-storage";
import { createTimelineResourceIngest, type PreparedResourceIngest } from "@/services/timeline-resource-ingest";

/** Mount before the editing store, so its autosave cannot race the append. */
export function CanvasResourceIngestGate({ projectId, resourceId, requestId, canvasId, nodeId }: { projectId: string; resourceId: string; requestId: string; canvasId?: string; nodeId?: string }) {
    const [params, setParams] = useSearchParams();
    const scope = getActiveUserScope();
    const owner = `${scope}:${projectId}:${resourceId}:${requestId}:${canvasId}:${nodeId}`;
    const active = useRef(owner);
    active.current = owner;
    const ingest = useMemo(
        () => createTimelineResourceIngest(projectId, resourceId, requestId, localForageStorageForScope(scope), undefined, nodeId !== undefined ? { canvasId: canvasId ?? "", nodeId } : undefined),
        [projectId, resourceId, requestId, scope, canvasId, nodeId],
    );
    const [prepared, setPrepared] = useState<PreparedResourceIngest | null>(null);
    const [media, setMedia] = useState<RemoteResource | null>(null);
    const [url, setUrl] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const working = useRef(false);
    const current = () => active.current === owner && getActiveUserScope() === scope;
    async function prepare(refresh = false) {
        if (working.current) return;
        working.current = true;
        setBusy(true);
        setError(null);
        setPrepared(null);
        try {
            const plan = await ingest.prepare(refresh);
            if (current()) setPrepared(plan);
        } catch (error) {
            if (current()) setError(error instanceof Error ? error.message : "读取加入预览失败");
        } finally {
            working.current = false;
            if (current()) setBusy(false);
        }
    }
    useEffect(() => {
        let disposed = false;
        active.current = owner;
        void prepare();
        void Promise.all([getResource(resourceId), resolveMediaUrl(`resource:${resourceId}`)])
            .then(([resource, preview]) => {
                if (!disposed && current()) {
                    setMedia(resource);
                    setUrl(preview ?? "");
                }
            })
            .catch(() => {
                /* The server preview is authoritative; playback can be retried in the editor. */
            });
        return () => {
            disposed = true;
            active.current = "";
        };
    }, [ingest]);
    const enter = (clipId?: string) => {
        const next = new URLSearchParams(params);
        next.delete("addResource");
        next.delete("addRequestId");
        next.delete("sourceCanvas");
        next.delete("sourceNode");
        if (clipId) next.set("focusClip", clipId);
        setParams(next, { replace: true });
    };
    async function apply() {
        if (working.current || prepared?.state !== "ready" || !current()) return;
        working.current = true;
        setBusy(true);
        setError(null);
        try {
            const done = await ingest.apply(prepared.input);
            if (current()) setPrepared(done);
        } catch (error) {
            if (current()) {
                setPrepared(null);
                setError(error instanceof Error ? error.message : "加入结果尚未核对，请重新检查");
            }
        } finally {
            working.current = false;
            if (current()) setBusy(false);
        }
    }
    const complete = prepared?.state === "complete";
    const kind = media?.mimeType?.split("/")[0];
    return (
        <section className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-8" aria-label="画布素材加入剪辑">
            <div>
                <h2 className="text-xl font-semibold">{complete ? "素材已加入剪辑" : "把这份素材加入剪辑？"}</h2>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">{complete ? "已核对服务端保存结果，可以继续编辑。" : "确认后放到对应轨道末尾，并保存加入前的剪辑版本。"}</p>
            </div>
            {url && (
                <div className="flex max-h-80 justify-center overflow-hidden rounded-lg bg-[var(--previs-sequencer-surface)]">
                    {kind === "image" ? (
                        <img src={url} alt="待加入的画布图片" className="max-h-80 object-contain" />
                    ) : kind === "audio" ? (
                        <audio src={url} controls preload="metadata" aria-label="待加入的画布声音" />
                    ) : kind === "video" ? (
                        <video src={url} controls preload="metadata" className="max-h-80" aria-label="待加入的画布视频" />
                    ) : null}
                </div>
            )}
            {prepared?.state === "ready" && (
                <p role="status">
                    加入后共 {prepared.plan.after.clips} 个片段 · 总时长 {(prepared.plan.after.durationMs / 1000).toFixed(1)} 秒
                </p>
            )}
            {prepared?.captions && (
                <div aria-label="随素材带入的字幕">
                    <h3 className="font-medium">
                        {prepared.captions.title} · {prepared.captions.captionCount} 条字幕
                    </h3>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">字幕将跟随这次使用的素材，文字可单独编辑；以后修改画布不会自动覆盖这里。</p>
                    {prepared.captions.previewCues.length > 0 && (
                        <ul className="mt-2 list-inside list-disc text-sm">
                            {prepared.captions.previewCues.map((text, index) => (
                                <li key={index}>{text}</li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
            {error && (
                <p role="alert" className="text-[var(--previs-danger)]">
                    {error}
                </p>
            )}
            <div className="flex flex-wrap gap-3">
                {complete ? (
                    <Button type="primary" aria-label="继续剪辑" onClick={() => enter(prepared.clipId)}>
                        继续剪辑
                    </Button>
                ) : (
                    <Button type="primary" aria-label="确认加入剪辑" loading={busy} disabled={prepared?.state !== "ready"} onClick={() => void apply()}>
                        确认加入剪辑
                    </Button>
                )}
                {!complete && (
                    <Button disabled={busy} onClick={() => void prepare(true)}>
                        重新检查
                    </Button>
                )}
                <Button disabled={busy} onClick={() => enter()}>
                    {complete ? "打开项目剪辑" : "暂不加入，打开剪辑"}
                </Button>
            </div>
        </section>
    );
}
