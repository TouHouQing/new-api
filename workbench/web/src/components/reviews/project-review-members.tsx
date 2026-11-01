import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, Popconfirm } from "antd";
import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { Select } from "@/components/ui/base/select";
import { ReviewWriteNotice } from "./send-for-review";
import { listReviewMembers, type ProjectMember } from "@/services/api/project-reviews";
import { useProjectReviewWrite } from "@/hooks/use-project-review-write";
import { useReviewActor } from "@/hooks/use-review-actor";

export function ProjectReviewMembers({ projectId, disabled }: { projectId: string; disabled?: boolean }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button disabled={disabled} onClick={() => setOpen(true)}>
                审片协作者
            </Button>
            {open && <MemberDialog projectId={projectId} onClose={() => setOpen(false)} />}
        </>
    );
}
function MemberDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
    const actor = useReviewActor();
    const query = useQuery({ queryKey: ["review-members", actor, projectId], queryFn: () => listReviewMembers(projectId) });
    const write = useProjectReviewWrite(projectId);
    const [username, setUsername] = useState(""),
        [role, setRole] = useState<ProjectMember["role"]>("reviewer");
    const refresh = async () => {
        const result = await query.refetch();
        if (result.error) throw result.error;
        setUsername("");
    };
    const busy = write.busy || write.pending;
    return (
        <AppModal
            title="审片协作者"
            open
            onCancel={write.busy ? undefined : onClose}
            footer={
                <Button disabled={write.busy} onClick={onClose}>
                    返回
                </Button>
            }
        >
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">为已有账号授权。审片者可以留言、认领问题和提交结论；查看者只能查看。撤销后失去访问权限，历史意见保留。</p>
                <label className="block space-y-2">
                    <span>已有账号的用户名</span>
                    <Input aria-label="协作者用户名" value={username} maxLength={120} onChange={(e) => setUsername(e.target.value)} disabled={busy} />
                </label>
                <Select
                    aria-label="审片协作权限"
                    className="w-full"
                    value={role}
                    onChange={setRole}
                    disabled={busy}
                    options={[
                        { value: "reviewer", label: "审片者 · 留言与审片" },
                        { value: "viewer", label: "查看者 · 只读" },
                    ]}
                />
                <Button
                    type="primary"
                    loading={write.busy}
                    disabled={busy || !username.trim() || query.isError || query.isLoading}
                    onClick={() => {
                        const existing = query.data?.find((row) => row.username === username.trim());
                        void write.run({ kind: "member", input: { requestId: crypto.randomUUID(), username: username.trim(), expectedRevision: existing?.revision || 0, role, active: true } }, refresh);
                    }}
                >
                    保存协作权限
                </Button>
                <ReviewWriteNotice write={write} onRecovered={refresh} />
                {query.isError && <Button onClick={() => void query.refetch()}>重新读取协作者</Button>}
                <ul className="divide-y divide-border">
                    {query.data?.map((member) => (
                        <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                            <span>
                                {member.username} · {{ reviewer: "审片者", viewer: "查看者", editor: "制作协作者" }[member.role]} · {member.active ? "已授权" : "已撤销"}
                            </span>
                            {member.active && (
                                <Popconfirm
                                    title={`撤销 ${member.username} 的协作权限？`}
                                    okText="撤销"
                                    cancelText="保留"
                                    onConfirm={() => write.run({ kind: "member", input: { requestId: crypto.randomUUID(), userId: member.userId, role: member.role, expectedRevision: member.revision, active: false } }, refresh)}
                                >
                                    <Button disabled={busy}>撤销</Button>
                                </Popconfirm>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        </AppModal>
    );
}
