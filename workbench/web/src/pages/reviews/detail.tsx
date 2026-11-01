import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Button, Checkbox, Input, InputNumber, Popconfirm } from "antd";
import { Link, useParams } from "react-router";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceErrorState, WorkspaceLoadingState } from "@/components/layout/workspace-state";
import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { Select } from "@/components/ui/base/select";
import { ReviewPlayer, reviewTime } from "@/components/reviews/review-player";
import { ReviewSharing } from "@/components/reviews/review-sharing";
import { ReviewRework } from "@/components/reviews/review-rework";
import { ReviewWriteNotice } from "@/components/reviews/send-for-review";
import { useProjectReviewWrite } from "@/hooks/use-project-review-write";
import { useUserStore } from "@/stores/use-user-store";
import { getActiveUserScope } from "@/lib/user-scope";
import { localForageStorageForScope } from "@/lib/localforage-storage";
import { reviewCaptureSeconds } from "@/lib/review-time";
import { getReview, listReviewComments, listReviewMembers, reviewMediaUrl, reviewStatusLabel, type ReviewComment, type ReviewOperation, type ReviewView, type ReviewReceipt } from "@/services/api/project-reviews";

export default function ReviewDetailPage() {
    const { reviewId = "" } = useParams();
    const actor = useUserStore((state) => state.user?.id || "");
    const query = useQuery({ queryKey: ["review", actor, reviewId], queryFn: () => getReview(reviewId), refetchInterval: 15000 });
    if (query.isLoading)
        return (
            <WorkspacePage>
                <WorkspaceLoadingState label="正在打开固定原片" />
            </WorkspacePage>
        );
    if (query.isError || !query.data)
        return (
            <WorkspacePage>
                <WorkspaceErrorState title="审片暂时不可用" description="请检查登录状态、项目授权或原片记录。" onRetry={() => void query.refetch()} />
                <Link to="/reviews">返回审片列表</Link>
            </WorkspacePage>
        );
    return (
        <WorkspacePage>
            <ReviewDetail
                key={`${actor}:${reviewId}`}
                view={query.data}
                refresh={async () => {
                    const result = await query.refetch();
                    if (result.error) throw result.error;
                }}
            />
        </WorkspacePage>
    );
}
type Action = { kind: "resolve" | "edit" | "assign"; comment: ReviewComment } | { kind: "changes" | "rename" };
function ReviewDetail({ view, refresh }: { view: ReviewView; refresh: () => Promise<void> }) {
    const { review } = view,
        projectId = review.projectId;
    const user = useUserStore((state) => state.user);
    const write = useProjectReviewWrite(projectId);
    const comments = useInfiniteQuery({
        queryKey: ["review-comments", user?.id, review.id],
        queryFn: ({ pageParam }) => listReviewComments(projectId, review.id, pageParam),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (page) => page.nextCursor,
        refetchInterval: 15000,
    });
    const members = useQuery({ queryKey: ["review-members", user?.id, projectId], queryFn: () => listReviewMembers(projectId), enabled: view.canManage });
    const player = useRef<HTMLMediaElement>(null);
    const [message, setMessage] = useState(""),
        [blocking, setBlocking] = useState(false),
        [time, setTime] = useState<number | null>(null),
        [end, setEnd] = useState<number | null>(null),
        [clip, setClip] = useState<string>();
    const [action, setAction] = useState<Action>(),
        [text, setText] = useState(""),
        [resolution, setResolution] = useState("dismissed"),
        [fixed, setFixed] = useState<string>(),
        [assignee, setAssignee] = useState<string>("");
    const scope = getActiveUserScope(),
        storage = useMemo(() => localForageStorageForScope(scope), [scope]),
        draftKey = `review-comment-draft:${review.id}`;
    const [draftReady, setDraftReady] = useState(false),
        [draftError, setDraftError] = useState("");
    useEffect(() => {
        let alive = true;
        void (async () => {
            const raw = await storage.getItem(draftKey);
            if (raw) {
                const draft = JSON.parse(raw);
                if (
                    raw.length > 32768 ||
                    draft.target !== review.targetSha256 ||
                    typeof draft.message !== "string" ||
                    draft.message.length > 8000 ||
                    typeof draft.blocking !== "boolean" ||
                    (draft.time !== null && (!Number.isFinite(draft.time) || draft.time < 0 || draft.time * 1000 >= review.durationMs)) ||
                    (draft.end !== null && (!Number.isFinite(draft.end) || draft.end < 0 || draft.end * 1000 > review.durationMs)) ||
                    (draft.clip !== undefined && typeof draft.clip !== "string")
                )
                    throw new Error("意见草稿无法校验，请保留本机数据后检查。");
                if (alive) {
                    setMessage(draft.message);
                    setBlocking(draft.blocking);
                    setTime(draft.time);
                    setEnd(draft.end);
                    setClip(draft.clip);
                }
            }
            if (alive) setDraftReady(true);
        })().catch((cause) => {
            if (alive) setDraftError(cause instanceof Error ? cause.message : "意见草稿读取失败");
        });
        return () => {
            alive = false;
        };
    }, [storage, draftKey, review.targetSha256]);
    useEffect(() => {
        if (!draftReady) return;
        const timer = setTimeout(() => {
            void Promise.resolve(storage.setItem(draftKey, JSON.stringify({ target: review.targetSha256, message, blocking, time, end, clip }))).catch(() => setDraftError("意见草稿保存失败，请保留输入后重试。"));
        }, 250);
        return () => clearTimeout(timer);
    }, [storage, draftKey, draftReady, review.targetSha256, message, blocking, time, end, clip]);
    const busy = write.busy || write.pending || !draftReady;
    const rows = comments.data?.pages.flatMap((page) => page.comments) || [];
    const complete = async (receipt?: ReviewReceipt) => {
        await refresh();
        const result = await comments.refetch();
        if (result.error) throw result.error;
        if (receipt?.result.kind === "review-comment-create") setMessage("");
        setAction(undefined);
    };
    const state = (input: Partial<Extract<ReviewOperation, { kind: "state" }>["input"]>) => void write.run({ kind: "state", reviewId: review.id, input: { requestId: crypto.randomUUID(), expectedRevision: review.revision, ...input } }, complete);
    const patch = (comment: ReviewComment, input: Partial<Extract<ReviewOperation, { kind: "comment-patch" }>["input"]>) =>
        void write.run({ kind: "comment-patch", reviewId: review.id, commentId: comment.id, input: { requestId: crypto.randomUUID(), expectedRevision: comment.revision!, targetSha256: review.targetSha256, ...input } }, complete);
    const seek = (ms?: number) => {
        if (ms !== undefined && player.current) {
            player.current.pause();
            player.current.currentTime = ms / 1000;
            player.current.focus();
        }
    };
    const openAction = (value: Action) => {
        setAction(value);
        setText(value.kind === "edit" ? value.comment.message : value.kind === "rename" ? review.title : "");
        setResolution(value.kind === "resolve" && !value.comment.blocking ? "acknowledged" : "dismissed");
        setFixed(undefined);
        setAssignee("");
    };
    const activeMembers = members.data?.filter((member) => member.active && member.role !== "viewer") || [];
    return (
        <div className="space-y-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <Link to="/reviews" className="text-sm text-muted-foreground">
                        返回审片列表
                    </Link>
                    <h1 className="mt-2 break-words text-xl font-semibold">{review.title}</h1>
                    <p className="mt-1 text-sm">
                        {reviewStatusLabel(review.status)}
                        {review.archived ? " · 已归档" : ""} · {view.openIssues} 项问题待处理
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {view.role === "owner" && (
                        <Link className="self-center text-sm underline" to={`/projects/${projectId}/reviews`}>
                            项目审片
                        </Link>
                    )}
                    {view.canManage && <ReviewSharing view={view} />}
                </div>
            </header>
            {review.parentReviewId && (
                <p className="text-sm">
                    这是修复版。
                    <Link to={`/reviews/${review.parentReviewId}`} className="underline">
                        查看上一轮原片和意见
                    </Link>
                </p>
            )}
            {!!view.nextReviews.length && (
                <div className="space-y-2 text-sm">
                    <p>已有后续审片。请在新版本检查修复效果并提交结论。</p>
                    <ul>
                        {view.nextReviews.map((next) => (
                            <li key={next.id}>
                                <Link className="underline" to={`/reviews/${next.id}`}>
                                    {next.title} · {reviewStatusLabel(next.status)}
                                    {next.archived ? " · 已归档" : ""}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <ReviewPlayer ref={player} src={reviewMediaUrl(review.id)} kind={review.resourceKind} title={review.title} />
            <div className="flex flex-wrap items-center gap-2">
                {view.canDecide && (
                    <>
                        <Button type="primary" disabled={busy || view.openIssues > 0} onClick={() => state({ status: "approved" })}>
                            通过这一版
                        </Button>
                        <Button disabled={busy} onClick={() => openAction({ kind: "changes" })}>
                            需要修改
                        </Button>
                    </>
                )}
                {view.canManage && (
                    <>
                        <Button disabled={busy} onClick={() => openAction({ kind: "rename" })}>
                            修改审片名称
                        </Button>
                        <Popconfirm
                            title={review.archived ? "恢复这个审片？" : "归档这个审片？"}
                            description={review.archived ? "原分享链接保持撤销状态，可重新创建链接。" : "已保存的原片和意见保留，所有分享链接将撤销。"}
                            okText={review.archived ? "恢复" : "归档"}
                            cancelText="返回"
                            onConfirm={() => state({ archived: !review.archived })}
                        >
                            <Button disabled={busy}>{review.archived ? "恢复审片" : "归档审片"}</Button>
                        </Popconfirm>
                    </>
                )}
                {view.openIssues > 0 && <span className="text-xs text-muted-foreground">处理需要修改的问题后，才能通过。</span>}
            </div>
            <ReviewWriteNotice write={write} onRecovered={complete} />
            {draftError && <p role="alert">{draftError}</p>}
            {(view.role === "owner" || view.role === "editor") && !review.archived && (
                <Popconfirm
                    title="把同一原片重新送审？"
                    description="建立新的审片轮次，原片、旧意见与结论都保留。请在新一轮重新检查。"
                    okText="创建新一轮"
                    cancelText="返回"
                    onConfirm={() =>
                        write.run(
                            {
                                kind: "create",
                                input: { requestId: crypto.randomUUID(), title: `${review.title.slice(0, 220)} · 再审`, parentReviewId: review.id, target: { kind: "snapshot", reviewId: review.id, reviewTargetSha256: review.targetSha256 } },
                            },
                            complete,
                        )
                    }
                >
                    <Button disabled={busy}>重新审这份原片</Button>
                </Popconfirm>
            )}
            {view.canComment && (
                <section aria-label="添加审片意见" className="space-y-3 border-t border-border pt-4">
                    <h2 className="font-semibold">留下意见</h2>
                    {review.resourceKind !== "image" && (
                        <div className="flex flex-wrap items-center gap-3">
                            <Button
                                disabled={busy}
                                onClick={() => {
                                    player.current?.pause();
                                    setTime(reviewCaptureSeconds(player.current?.currentTime || 0, review.durationMs));
                                    setEnd(null);
                                }}
                            >
                                定位当前画面
                            </Button>
                            <label>
                                开始（秒）
                                <InputNumber aria-label="意见开始秒数" min={0} max={Math.max(0, (review.durationMs - 1) / 1000)} step={0.001} value={time} onChange={setTime} disabled={busy} />
                            </label>
                            <label>
                                结束（可选）
                                <InputNumber aria-label="意见结束秒数" min={0} max={review.durationMs / 1000} step={0.001} value={end} onChange={setEnd} disabled={busy} />
                            </label>
                            <Button
                                disabled={busy}
                                onClick={() => {
                                    setTime(null);
                                    setEnd(null);
                                    setClip(undefined);
                                }}
                            >
                                改为整片意见
                            </Button>
                        </div>
                    )}
                    {!!view.source.clips?.length && (
                        <Select
                            aria-label="意见对应片段"
                            className="w-full"
                            allowClear
                            placeholder="整片，或选择具体片段"
                            value={clip}
                            onChange={(value) => {
                                setClip(value);
                                setTime(null);
                                setEnd(null);
                            }}
                            disabled={busy}
                            options={view.source.clips.map((item) => ({ value: item.id, label: `${item.title || "片段"} · ${reviewTime(item.startMs)}–${reviewTime(item.startMs + item.durationMs)}` }))}
                        />
                    )}
                    <Input.TextArea
                        aria-label="审片意见"
                        autoSize={{ minRows: 3, maxRows: 8 }}
                        maxLength={4000}
                        value={message}
                        disabled={busy}
                        onChange={(event) => setMessage(event.target.value)}
                        placeholder="描述看到的问题和希望达到的效果，例如：这段角色外套变色，请与上一镜头保持一致。"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                        <Checkbox checked={blocking} disabled={busy} onChange={(e) => setBlocking(e.target.checked)}>
                            需要修改后才能通过
                        </Checkbox>
                        <Button
                            type="primary"
                            disabled={busy || !message.trim() || (end !== null && (time === null || end <= time))}
                            loading={write.busy}
                            onClick={() =>
                                void write.run(
                                    {
                                        kind: "comment",
                                        reviewId: review.id,
                                        input: {
                                            requestId: crypto.randomUUID(),
                                            targetSha256: review.targetSha256,
                                            message: message.trim(),
                                            blocking,
                                            location: { ...(time !== null ? { timeMs: Math.round(time * 1000) } : {}), ...(end !== null ? { endMs: Math.round(end * 1000) } : {}), ...(clip ? { clipId: clip } : {}) },
                                        },
                                    },
                                    complete,
                                )
                            }
                        >
                            提交意见
                        </Button>
                    </div>
                </section>
            )}
            <section aria-label="审片意见列表" className="space-y-3 border-t border-border pt-4">
                <h2 className="font-semibold">意见与处理</h2>
                {comments.isError && <Button onClick={() => void comments.refetch()}>重新读取意见</Button>}
                {comments.isLoading && <p>正在读取意见…</p>}
                {!comments.isLoading && !rows.length && <p className="text-muted-foreground">还没有意见。</p>}
                <ul className="divide-y divide-border">
                    {rows.map((comment) => (
                        <li key={comment.id} className="space-y-2 py-4">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <strong>
                                    {comment.authorName}
                                    {!comment.authorUserId ? "（访客）" : ""}
                                </strong>
                                <span>{new Date(comment.createdAt).toLocaleString("zh-CN")}</span>
                                <span>{comment.resolved ? "已处理" : comment.blocking ? "需要修改" : "建议"}</span>
                                <Button size="small" type="text" disabled={comment.timeMs === undefined && !comment.clipId} onClick={() => seek(comment.timeMs ?? view.source.clips?.find((item) => item.id === comment.clipId)?.startMs)}>
                                    {comment.timeMs !== undefined ? `${reviewTime(comment.timeMs)}${comment.endMs !== undefined ? `–${reviewTime(comment.endMs)}` : ""}` : comment.clipId ? "定位片段" : "整片"}
                                </Button>
                            </div>
                            <p className="whitespace-pre-wrap break-words text-sm">{comment.message}</p>
                            {comment.assignedUserId && (
                                <p className="text-xs text-muted-foreground">处理人：{comment.assignedUserId === user?.id ? "我" : members.data?.find((member) => member.userId === comment.assignedUserId)?.username || "项目协作者"}</p>
                            )}
                            <ReviewRework view={view} commentId={comment.id} />
                            {comment.resolutionKind && (
                                <p className="text-sm">
                                    {{ fixed: "已提交修复版本", dismissed: "不采纳", acknowledged: "建议已阅" }[comment.resolutionKind] || comment.resolutionKind}
                                    {comment.resolutionNote ? `：${comment.resolutionNote}` : ""}
                                    {comment.resolutionReviewId && (
                                        <Link className="ml-2 underline" to={`/reviews/${comment.resolutionReviewId}`}>
                                            检查修复版本
                                        </Link>
                                    )}
                                </p>
                            )}
                            {view.canComment && (
                                <div className="flex flex-wrap gap-2">
                                    {comment.authorUserId === user?.id && (
                                        <Button size="small" disabled={busy} onClick={() => openAction({ kind: "edit", comment })}>
                                            编辑文字
                                        </Button>
                                    )}
                                    {!comment.resolved ? (
                                        <>
                                            <Button size="small" disabled={busy} onClick={() => patch(comment, { assignedUserId: user?.id })}>
                                                {comment.assignedUserId === user?.id ? "我在处理" : "我来处理"}
                                            </Button>
                                            {view.canManage && (
                                                <Button size="small" disabled={busy || members.isError} onClick={() => openAction({ kind: "assign", comment })}>
                                                    指派处理
                                                </Button>
                                            )}
                                            <Button size="small" disabled={busy} onClick={() => openAction({ kind: "resolve", comment })}>
                                                处理意见
                                            </Button>
                                            {!comment.blocking && (
                                                <Button size="small" disabled={busy} onClick={() => patch(comment, { blocking: true })}>
                                                    标为需修改
                                                </Button>
                                            )}
                                        </>
                                    ) : (
                                        <Button size="small" disabled={busy} onClick={() => patch(comment, { resolved: false })}>
                                            重新打开
                                        </Button>
                                    )}
                                </div>
                            )}
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
                <summary>固定版本与来源</summary>
                <p className="break-all pt-2">原片 SHA256：{review.resourceSha256}</p>
                <p>审片记录：{review.id}</p>
                <p>源类型：{{ cut: "固定剪辑成片", artifact: "固定镜头候选", asset: "固定资产表现" }[view.source.kind] || view.source.kind}</p>
            </details>
            <AppModal
                title={action?.kind === "resolve" ? "处理这条意见" : action?.kind === "assign" ? "指派处理" : action?.kind === "edit" ? "编辑我的意见" : action?.kind === "rename" ? "修改审片名称" : "说明修改要求"}
                open={!!action}
                onCancel={write.busy ? undefined : () => setAction(undefined)}
                footer={
                    <>
                        <Button disabled={write.busy} onClick={() => setAction(undefined)}>
                            返回
                        </Button>
                        <Button
                            type="primary"
                            disabled={busy || (action?.kind !== "assign" && action?.kind !== "resolve" && !text.trim()) || (action?.kind === "resolve" && (resolution === "fixed" ? !fixed : resolution === "dismissed" && !text.trim()))}
                            loading={write.busy}
                            onClick={() => {
                                if (!action) return;
                                if (action.kind === "rename") state({ title: text.trim() });
                                else if (action.kind === "changes") state({ status: "changes_requested", note: text.trim() });
                                else if (action.kind === "edit") patch(action.comment, { message: text.trim() });
                                else if (action.kind === "assign") patch(action.comment, { assignedUserId: assignee });
                                else if (action.kind === "resolve") patch(action.comment, { resolved: true, resolutionKind: resolution, resolutionNote: text.trim(), ...(resolution === "fixed" ? { resolutionReviewId: fixed } : {}) });
                            }}
                        >
                            保存
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    {action?.kind === "resolve" && (
                        <>
                            <p className="text-sm">已修复的问题需要关联实际变化的新原片，并在新一轮审片中检查效果。</p>
                            <Select
                                aria-label="意见处理方式"
                                className="w-full"
                                value={resolution}
                                onChange={setResolution}
                                disabled={busy}
                                options={[{ value: "fixed", label: "已修复 · 关联新一轮审片" }, { value: "dismissed", label: "不采纳 · 说明原因" }, ...(!action.comment.blocking ? [{ value: "acknowledged", label: "建议已阅" }] : [])]}
                            />
                            {resolution === "fixed" && (
                                <Select
                                    aria-label="修复版本"
                                    className="w-full"
                                    placeholder="先从修改后的原片送审，并关联本轮"
                                    value={fixed}
                                    onChange={setFixed}
                                    disabled={busy}
                                    options={view.nextReviews.filter((row) => !row.archived).map((row) => ({ value: row.id, label: row.title }))}
                                />
                            )}
                        </>
                    )}
                    {action?.kind === "assign" ? (
                        <Select
                            aria-label="处理人"
                            className="w-full"
                            value={assignee}
                            onChange={setAssignee}
                            disabled={busy}
                            options={[{ value: "", label: "取消指派" }, ...(user ? [{ value: user.id, label: `${user.displayName || user.username}（我）` }] : []), ...activeMembers.map((member) => ({ value: member.userId, label: member.username }))]}
                        />
                    ) : (
                        <Input.TextArea
                            aria-label={action?.kind === "rename" ? "新的审片名称" : "意见处理说明"}
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            disabled={busy}
                            maxLength={action?.kind === "rename" ? 240 : action?.kind === "edit" ? 4000 : 2000}
                            autoSize={{ minRows: 3, maxRows: 8 }}
                        />
                    )}
                    {action?.kind === "changes" && <p className="text-sm text-muted-foreground">说明会保存为一条需要处理的整片意见，协作者都能看到。</p>}
                    {write.error && <p role="alert">{write.error}</p>}
                </div>
            </AppModal>
        </div>
    );
}
