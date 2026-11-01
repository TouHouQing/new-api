import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button, Input, InputNumber } from "antd";
import { useParams } from "react-router";
import { localForageStorageForScope } from "@/lib/localforage-storage";
import { ReviewPlayer, reviewTime } from "@/components/reviews/review-player";
import { openPublicReview, listPublicReviewComments, addPublicReviewComment, readPublicReviewCommentResult, reviewMediaUrl, reviewStatusLabel, type PublicReview, type GuestReviewCommentRequest } from "@/services/api/project-reviews";
import { ApiError } from "@/services/api/request";
import { reviewCaptureSeconds } from "@/lib/review-time";

export default function SharedReviewPage() {
    const { shareId = "" } = useParams();
    return <SharedReview key={shareId} shareId={shareId} />;
}
function SharedReview({ shareId }: { shareId: string }) {
    const [view, setView] = useState<PublicReview>(),
        [error, setError] = useState(""),
        [loading, setLoading] = useState(true),
        [busy, setBusy] = useState(false);
    const [name, setName] = useState(""),
        [message, setMessage] = useState(""),
        [time, setTime] = useState<number | null>(null),
        [pending, setPending] = useState<GuestReviewCommentRequest>(),
        [ready, setReady] = useState(false);
    const player = useRef<HTMLMediaElement>(null),
        lock = useRef(false),
        alive = useRef(true);
    const storage = useMemo(() => localForageStorageForScope(`public-review:${shareId}`), [shareId]);
    const comments = useInfiniteQuery({
        queryKey: ["public-review-comments", shareId],
        queryFn: ({ pageParam }) => listPublicReviewComments(shareId, pageParam),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (page) => page.nextCursor,
        enabled: !!view,
        refetchInterval: 20000,
    });
    const load = async () => {
        setLoading(true);
        setError("");
        try {
            const fragment = new URLSearchParams(location.hash.slice(1)),
                token = fragment.get("token") || undefined;
            const result = await openPublicReview(shareId, token);
            if (!alive.current) return;
            setView(result);
            if (token) history.replaceState(history.state, "", location.pathname + location.search);
            const raw = await storage.getItem("pending-comment");
            if (raw) {
                let prior: GuestReviewCommentRequest;
                try {
                    prior = JSON.parse(raw);
                    if (raw.length > 32768 || !prior || !/^[A-Za-z0-9._:-]{16,128}$/.test(prior.requestId) || typeof prior.message !== "string" || typeof prior.authorName !== "string" || prior.targetSha256 !== result.targetSha256 || !prior.location)
                        throw new Error();
                } catch {
                    throw new Error("上次留言记录无法校验，请保留本机数据并联系项目所有者。");
                }
                setPending(prior);
                setName(prior.authorName);
                setMessage(prior.message);
                setTime(prior.location.timeMs !== undefined ? prior.location.timeMs / 1000 : null);
            } else {
                const draftRaw = await storage.getItem("comment-draft");
                if (draftRaw) {
                    try {
                        const draft = JSON.parse(draftRaw);
                        if (draft.target === result.targetSha256 && typeof draft.name === "string" && typeof draft.message === "string" && draft.name.length <= 160 && draft.message.length <= 8000) {
                            setName(draft.name);
                            setMessage(draft.message);
                        }
                    } catch {
                        throw new Error("留言草稿无法读取，请保留本机数据后检查。");
                    }
                }
            }
            if (alive.current) setReady(true);
        } catch (cause) {
            if (alive.current) setError(cause instanceof Error ? cause.message : "审片链接暂时不可用");
        } finally {
            if (alive.current) setLoading(false);
        }
    };
    useEffect(() => {
        alive.current = true;
        void load();
        return () => {
            alive.current = false;
            player.current?.pause();
        };
    }, [shareId]);
    useEffect(() => {
        if (!ready || !view || pending) return;
        const timer = window.setTimeout(() => {
            void Promise.resolve(storage.setItem("comment-draft", JSON.stringify({ target: view.targetSha256, name, message }))).catch(() => setError("本机草稿保存失败，请保留输入后重试。"));
        }, 250);
        return () => clearTimeout(timer);
    }, [ready, view?.targetSha256, name, message, pending, storage]);
    const submit = async () => {
        if (!view || !ready || lock.current) return;
        lock.current = true;
        setBusy(true);
        setError("");
        const input = pending || { requestId: crypto.randomUUID(), targetSha256: view.targetSha256, authorName: name.trim(), message: message.trim(), location: time !== null ? { timeMs: Math.round(time * 1000) } : {} };
        try {
            await storage.setItem("pending-comment", JSON.stringify(input));
            setPending(input);
            try {
                await addPublicReviewComment(shareId, input);
            } catch (cause) {
                try {
                    await readPublicReviewCommentResult(shareId, input.requestId);
                } catch (lookup) {
                    if (cause instanceof ApiError && [400, 409, 413, 429].includes(cause.status ?? 0) && lookup instanceof ApiError && lookup.status === 404) {
                        await storage.removeItem("pending-comment");
                        if (alive.current) setPending(undefined);
                    }
                    throw cause;
                }
            }
            const page = await comments.refetch();
            if (page.error) throw page.error;
            await storage.removeItem("pending-comment");
            await storage.removeItem("comment-draft");
            if (alive.current) {
                setPending(undefined);
                setMessage("");
                setTime(null);
            }
        } catch (cause) {
            if (alive.current) setError(cause instanceof Error ? cause.message : "留言结果尚未确认，请沿用原编号核对。");
        } finally {
            lock.current = false;
            if (alive.current) setBusy(false);
        }
    };
    return (
        <main className="thin-scrollbar h-dvh overflow-y-auto bg-background text-foreground">
            <div className="mx-auto max-w-5xl space-y-5 px-4 py-8 sm:px-8">
                <header>
                    <p className="text-sm text-muted-foreground">影策 · 固定版本审片</p>
                    <h1 className="mt-2 break-words text-2xl font-semibold">{view?.title || "打开审片"}</h1>
                    {view && (
                        <p className="mt-2 text-sm text-muted-foreground">
                            {view.projectName} · {reviewStatusLabel(view.status)} · 链接于 {new Date(view.expiresAt).toLocaleString("zh-CN")} 到期
                        </p>
                    )}
                </header>
                {loading && <p role="status">正在核对链接和固定原片…</p>}
                {error && <p role="alert">{error}</p>}
                {!view && !loading && <Button onClick={() => void load()}>重新打开审片</Button>}
                {view && (
                    <>
                        <ReviewPlayer ref={player} kind={view.resourceKind} src={reviewMediaUrl(shareId, true)} title={view.title} />
                        {view.allowComments ? (
                            <section className="space-y-3 border-t border-border pt-4">
                                <h2 className="font-semibold">给这版原片提建议</h2>
                                <p className="text-sm text-muted-foreground">称呼由访客填写。请具体描述问题和期望效果，制作人员会核对并处理。</p>
                                <Input aria-label="访客称呼" placeholder="你的称呼" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} disabled={!ready || busy || !!pending} />
                                {view.resourceKind !== "image" && (
                                    <div className="flex flex-wrap items-center gap-3">
                                        <Button
                                            disabled={!ready || busy || !!pending}
                                            onClick={() => {
                                                player.current?.pause();
                                                setTime(reviewCaptureSeconds(player.current?.currentTime || 0, view.durationMs));
                                            }}
                                        >
                                            定位当前画面
                                        </Button>
                                        <label>
                                            位置（秒）
                                            <InputNumber aria-label="访客意见位置秒数" min={0} max={Math.max(0, (view.durationMs - 1) / 1000)} step={0.001} value={time} onChange={setTime} disabled={!ready || busy || !!pending} />
                                        </label>
                                        <Button disabled={busy || !!pending} onClick={() => setTime(null)}>
                                            整片建议
                                        </Button>
                                    </div>
                                )}
                                <Input.TextArea aria-label="访客审片意见" autoSize={{ minRows: 3, maxRows: 8 }} maxLength={4000} value={message} onChange={(event) => setMessage(event.target.value)} disabled={!ready || busy || !!pending} />
                                <Button type="primary" loading={busy} disabled={!ready || !name.trim() || !message.trim()} onClick={() => void submit()}>
                                    {pending ? "核对上次留言" : "提交建议"}
                                </Button>
                                {pending && <p className="text-sm">上次留言正在等待确认，沿用原编号核对可避免重复。</p>}
                            </section>
                        ) : (
                            <p className="text-sm text-muted-foreground">本链接仅供查看，留言功能由项目所有者控制。</p>
                        )}
                        <section className="space-y-3 border-t border-border pt-4">
                            <h2 className="font-semibold">本轮意见</h2>
                            {comments.isError && <Button onClick={() => void comments.refetch()}>重新读取意见</Button>}
                            <ul className="divide-y divide-border">
                                {comments.data?.pages
                                    .flatMap((page) => page.comments)
                                    .map((comment) => (
                                        <li key={comment.id} className="space-y-2 py-4">
                                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                <strong>
                                                    {comment.authorName}
                                                    {comment.guest ? "（访客）" : ""}
                                                </strong>
                                                <span>{comment.resolved ? "已处理" : "待处理"}</span>
                                                {comment.timeMs !== undefined && (
                                                    <Button
                                                        size="small"
                                                        onClick={() => {
                                                            if (player.current) {
                                                                player.current.pause();
                                                                player.current.currentTime = comment.timeMs! / 1000;
                                                            }
                                                        }}
                                                    >
                                                        {reviewTime(comment.timeMs)}
                                                    </Button>
                                                )}
                                            </div>
                                            <p className="whitespace-pre-wrap break-words text-sm">{comment.message}</p>
                                        </li>
                                    ))}
                            </ul>
                            {comments.hasNextPage && (
                                <Button loading={comments.isFetchingNextPage} onClick={() => void comments.fetchNextPage()}>
                                    更早的意见
                                </Button>
                            )}
                        </section>
                        <details className="text-xs text-muted-foreground">
                            <summary>原片校验信息</summary>
                            <p className="break-all pt-2">SHA256：{view.resourceSha256}</p>
                        </details>
                    </>
                )}
            </div>
        </main>
    );
}
