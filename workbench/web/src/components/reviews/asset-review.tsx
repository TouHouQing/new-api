import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "antd";
import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { Select } from "@/components/ui/base/select";
import { getReviewAssetSource } from "@/services/api/project-reviews";
import { resourceFileUrl } from "@/services/api/resources";
import { ReviewPlayer } from "./review-player";
import { SendForReviewDialog } from "./send-for-review";
import { useReviewActor } from "@/hooks/use-review-actor";

export function AssetReview({ projectId, versionId, title }: { projectId: string; versionId: string; title: string }) {
    const [open, setOpen] = useState(false),
        [chosen, setChosen] = useState<string>();
    return (
        <>
            <Button disabled={!versionId} onClick={() => setOpen(true)}>
                选择原片送审
            </Button>
            {open && !chosen && <AssetSourceDialog projectId={projectId} versionId={versionId} onChoose={setChosen} onClose={() => setOpen(false)} />}
            {open && chosen && (
                <SendForReviewDialog
                    projectId={projectId}
                    title={`${title} · 资产审片`}
                    target={{ kind: "asset", assetVersionId: versionId, representationId: chosen }}
                    onClose={() => {
                        setOpen(false);
                        setChosen(undefined);
                    }}
                />
            )}
        </>
    );
}
function AssetSourceDialog({ projectId, versionId, onChoose, onClose }: { projectId: string; versionId: string; onChoose: (id: string) => void; onClose: () => void }) {
    const actor = useReviewActor();
    const query = useQuery({ queryKey: ["review-asset-source", actor, projectId, versionId], queryFn: () => getReviewAssetSource(projectId, versionId) });
    const [selected, setSelected] = useState<string>();
    const row = query.data?.representations.find((item) => item.id === selected);
    return (
        <AppModal
            title="选择这版资产的原片"
            open
            onCancel={onClose}
            footer={
                <>
                    <Button onClick={onClose}>返回</Button>
                    <Button type="primary" disabled={!row} onClick={() => row && onChoose(row.id)}>
                        使用这份原片
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">选择具体视角、图片或声音。送审后保留这一份文件；后续换图不会改变它。</p>
                {query.isLoading && <p>正在读取固定资产版本…</p>}
                {query.isError && <Button onClick={() => void query.refetch()}>重新读取原片</Button>}
                {query.data && !query.data.representations.length && <p>这一版没有可用的图片、音频或视频，请先在资产中绑定并保存媒体。</p>}
                <Select
                    className="w-full"
                    aria-label="送审的资产原片"
                    value={selected}
                    onChange={setSelected}
                    options={
                        query.data?.representations.map((item) => ({
                            value: item.id,
                            label: `${({ primary: "主参考", front: "正面", side: "侧面", back: "背面", turnaround_sheet: "三视图", expression_sheet: "表情图" } as Record<string, string>)[item.role] || item.role} · ${item.mediaType === "image" ? "图片" : item.mediaType === "video" ? "视频" : "声音"}`,
                        })) || []
                    }
                />
                {row && <ReviewPlayer src={resourceFileUrl(row.resourceId)} kind={row.mediaType} title="待送审原片" />}
            </div>
        </AppModal>
    );
}
