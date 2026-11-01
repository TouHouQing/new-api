import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, Popconfirm, Switch } from "antd";
import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { Select } from "@/components/ui/base/select";
import { ReviewWriteNotice } from "./send-for-review";
import { listReviewShares, type ReviewView } from "@/services/api/project-reviews";
import { useProjectReviewWrite } from "@/hooks/use-project-review-write";
import { useReviewActor } from "@/hooks/use-review-actor";

export function ReviewSharing({ view }: { view: ReviewView }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button disabled={!view.canManage || view.review.archived} onClick={() => setOpen(true)}>
                分享给他人审片
            </Button>
            {open && <ReviewShareDialog view={view} onClose={() => setOpen(false)} />}
        </>
    );
}
function ReviewShareDialog({ view, onClose }: { view: ReviewView; onClose: () => void }) {
    const { projectId, id } = view.review;
    const actor = useReviewActor();
    const query = useQuery({ queryKey: ["review-shares", actor, id], queryFn: () => listReviewShares(projectId, id) });
    const write = useProjectReviewWrite(projectId);
    const [days, setDays] = useState(7),
        [comments, setComments] = useState(true),
        [copyError, setCopyError] = useState(""),
        [copied, setCopied] = useState("");
    const refresh = async () => {
        const result = await query.refetch();
        if (result.error) throw result.error;
    };
    const busy = write.busy || write.pending;
    return (
        <AppModal
            title="分享固定原片"
            open
            onCancel={write.busy ? undefined : onClose}
            footer={
                <Button disabled={write.busy} onClick={onClose}>
                    返回审片
                </Button>
            }
        >
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">持有链接的人可查看本轮原片与意见；可选允许留言。链接不提供项目编辑权限。撤销后，后续访问将被拒绝。</p>
                <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2">
                        有效期
                        <Select aria-label="审片链接有效期" value={days} disabled={busy} onChange={setDays} options={[1, 3, 7, 14, 30].map((value) => ({ value, label: `${value} 天` }))} />
                    </label>
                    <label className="flex items-center gap-2">
                        <Switch aria-label="允许访客留言" checked={comments} onChange={setComments} disabled={busy} />
                        允许留言
                    </label>
                </div>
                <Button
                    type="primary"
                    loading={write.busy}
                    disabled={busy || query.isError || query.isLoading}
                    onClick={() => void write.run({ kind: "share", reviewId: id, input: { requestId: crypto.randomUUID(), expiresDays: days, allowComments: comments } }, refresh)}
                >
                    创建审片链接
                </Button>
                <ReviewWriteNotice write={write} onRecovered={refresh} />
                {query.isError && <Button onClick={() => void query.refetch()}>重新读取已有链接</Button>}
                {copyError && <p role="alert">{copyError}</p>}
                {copied && <p role="status">链接已复制。请自行发送给需要审片的人。</p>}
                <ul className="divide-y divide-border">
                    {query.data?.map((link) => (
                        <li key={link.share.id} className="space-y-2 py-3">
                            {link.issue && <p role="alert">{link.issue}</p>}
                            <p className="text-xs text-muted-foreground">
                                {new Date(link.share.expiresAt).toLocaleString("zh-CN")} 到期 · {link.share.allowComments ? "可留言" : "仅查看"} · {link.url ? "有效" : link.share.active ? "已到期或不可访问" : "已撤销"}
                            </p>
                            {link.url && (
                                <>
                                    <Input aria-label={`审片链接 ${link.share.id}`} readOnly value={new URL(link.url, location.origin).href} />
                                    <Button
                                        disabled={busy}
                                        onClick={() => {
                                            setCopyError("");
                                            void (async () => {
                                                if (!navigator.clipboard) throw new Error("clipboard unavailable");
                                                await navigator.clipboard.writeText(new URL(link.url!, location.origin).href);
                                            })()
                                                .then(() => setCopied(link.share.id))
                                                .catch(() => setCopyError("复制失败，请选中上方完整链接手动复制。"));
                                        }}
                                    >
                                        复制链接
                                    </Button>
                                </>
                            )}
                            {link.share.active && (
                                <Popconfirm
                                    title="撤销这个审片链接？"
                                    description="已保存的意见和原片会保留。"
                                    okText="撤销链接"
                                    cancelText="保留"
                                    onConfirm={() => write.run({ kind: "revoke", reviewId: id, shareId: link.share.id, input: { requestId: crypto.randomUUID(), expectedRevision: link.share.revision } }, refresh)}
                                >
                                    <Button disabled={busy}>撤销链接</Button>
                                </Popconfirm>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        </AppModal>
    );
}
