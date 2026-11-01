import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button, Input } from "antd";
import { useNavigate } from "react-router";
import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { Select } from "@/components/ui/base/select";
import { useProjectReviewWrite } from "@/hooks/use-project-review-write";
import { listReviews, type ReviewTarget } from "@/services/api/project-reviews";
import { useReviewActor } from "@/hooks/use-review-actor";

export function ReviewWriteNotice({ write, onRecovered }: { write: ReturnType<typeof useProjectReviewWrite>; onRecovered: Parameters<ReturnType<typeof useProjectReviewWrite>["run"]>[1] }) {
    return (
        <>
            {write.error && (
                <p role="alert" className="text-sm">
                    {write.error}
                </p>
            )}
            {write.pending && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span>有一项操作结果待核对，原输入已保留。</span>
                    <Button loading={write.busy} aria-label="核对上次审片操作" onClick={() => void write.run(null, onRecovered)}>
                        核对上次操作
                    </Button>
                </div>
            )}
        </>
    );
}
export function SendForReview({ projectId, title, target, disabled = false }: { projectId: string; title: string; target: ReviewTarget; disabled?: boolean }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button disabled={disabled} onClick={() => setOpen(true)}>
                送审这一版
            </Button>
            {open && <SendForReviewDialog projectId={projectId} title={title} target={target} onClose={() => setOpen(false)} />}
        </>
    );
}
export function SendForReviewDialog({ projectId, title, target, onClose }: { projectId: string; title: string; target: ReviewTarget; onClose: () => void }) {
    const navigate = useNavigate();
    const write = useProjectReviewWrite(projectId);
    const actor = useReviewActor();
    const [name, setName] = useState(title),
        [parent, setParent] = useState<string>();
    const previous = useInfiniteQuery({
        queryKey: ["review-parent-options", actor, projectId],
        queryFn: ({ pageParam }) => listReviews(projectId, pageParam),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (page) => page.nextCursor,
    });
    const options = previous.data?.pages.flatMap((page) => page.reviews).filter((row) => row.targetKind === target.kind) || [];
    const complete = (receipt: import("@/services/api/project-reviews").ReviewReceipt) => {
        const reviewId = receipt.result.review?.id || receipt.result.comment?.reviewId || receipt.result.share?.reviewId;
        if (reviewId) {
            onClose();
            navigate(`/reviews/${reviewId}`);
        } else throw new Error("已完成的是另一项项目操作，请返回审片中心核对后继续");
    };
    return (
        <AppModal
            title="送审这一版"
            open
            onCancel={write.busy ? undefined : onClose}
            footer={
                <>
                    <Button disabled={write.busy} onClick={onClose}>
                        返回
                    </Button>
                    <Button
                        type="primary"
                        loading={write.busy}
                        disabled={!name.trim() || write.pending}
                        onClick={() => void write.run({ kind: "create", input: { requestId: crypto.randomUUID(), title: name.trim(), target, ...(parent ? { parentReviewId: parent } : {}) } }, complete)}
                    >
                        创建审片
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">固定当前选择的文件，后续换候选或继续剪辑时，原片和意见仍保留。此操作不调用生成模型。</p>
                <label className="block space-y-2">
                    <span>审片名称</span>
                    <Input aria-label="审片名称" value={name} maxLength={240} onChange={(event) => setName(event.target.value)} disabled={write.busy || write.pending} />
                </label>
                <label className="block space-y-2">
                    <span>这是哪一轮的修复版？</span>
                    <Select
                        aria-label="关联上一轮审片"
                        className="w-full"
                        allowClear
                        placeholder="首次送审，无需选择"
                        value={parent}
                        disabled={write.busy || write.pending}
                        onChange={setParent}
                        options={options.map((row) => ({ value: row.id, label: row.title }))}
                    />
                </label>
                {previous.isError && <Button onClick={() => void previous.refetch()}>重新读取可关联的审片</Button>}
                {previous.hasNextPage && (
                    <Button loading={previous.isFetchingNextPage} onClick={() => void previous.fetchNextPage()}>
                        读取更早的审片
                    </Button>
                )}
                <ReviewWriteNotice write={write} onRecovered={complete} />
            </div>
        </AppModal>
    );
}
