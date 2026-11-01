import { useState } from "react";
import { Button, Popconfirm } from "antd";

import { AppModal } from "@/components/ui/product/app-modal";
import type { TimelineRecoveryDraft } from "@/services/project-timeline-session";
import type { TimelineProject } from "@/types/timeline";

function describeCut(timeline: TimelineProject) {
    return `${timeline.clips.length} 个片段 · ${(timeline.durationMs / 1000).toFixed(1)} 秒`;
}

export function TimelineRecoveryNotice({
    drafts,
    current,
    busy,
    error,
    onRestore,
    onRemove,
    onDownload,
}: {
    drafts: TimelineRecoveryDraft[];
    current: TimelineProject | null;
    busy: boolean;
    error: string | null;
    onRestore: (draft: TimelineRecoveryDraft) => Promise<boolean>;
    onRemove: (draft: TimelineRecoveryDraft) => Promise<void>;
    onDownload: (draft: TimelineRecoveryDraft) => void;
}) {
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<TimelineRecoveryDraft | null>(null);
    if (!drafts.length && !error) return null;
    const restore = async () => {
        if (selected && (await onRestore(selected))) {
            setSelected(null);
            setOpen(false);
        }
    };
    return (
        <>
            <div role="status" className="flex flex-wrap items-center gap-2 border-b border-[var(--previs-sequencer-border)] px-3 py-2 text-xs text-[var(--previs-dock-fg)]">
                <span>{error || `发现 ${drafts.length} 份本机恢复草稿`}</span>
                {drafts.length > 0 && (
                    <Button size="small" onClick={() => setOpen(true)}>
                        查看草稿
                    </Button>
                )}
            </div>
            <AppModal
                open={open}
                title={selected ? "恢复这份剪辑草稿？" : "本机恢复草稿"}
                width={640}
                footer={null}
                closable={!busy}
                maskClosable={!busy}
                keyboard={!busy}
                onCancel={() => {
                    setOpen(false);
                    setSelected(null);
                }}
            >
                {error && (
                    <p role="alert" className="mb-3 text-[var(--previs-danger)]">
                        {error}
                    </p>
                )}
                {selected?.timeline ? (
                    <div className="space-y-4">
                        <p>当前剪辑：{current ? describeCut(current) : "尚未读取"}</p>
                        <p>恢复草稿：{describeCut(selected.timeline)}</p>
                        <p>确认后替换当前剪辑。替换前的版本会保留为本机草稿，方便恢复。</p>
                        <div className="flex justify-end gap-2">
                            <Button disabled={busy} onClick={() => setSelected(null)}>
                                返回
                            </Button>
                            <Button type="primary" loading={busy} disabled={!current} onClick={() => void restore()}>
                                确认恢复
                            </Button>
                        </div>
                    </div>
                ) : (
                    <>
                        <p className="mb-3 text-sm text-[var(--previs-dock-fg)]">这些副本包含未同步的修改或恢复前的剪辑。查看后再决定采用哪份。</p>
                        <div className="max-h-[50vh] overflow-y-auto">
                            {drafts.map((draft) => (
                                <div key={draft.key} className="space-y-2 border-b border-[var(--previs-sequencer-border)] py-3">
                                    <p>{draft.timeline ? describeCut(draft.timeline) : draft.error}</p>
                                    <p className="text-xs text-[var(--previs-dock-fg)]">{draft.updatedAt && Number.isFinite(Date.parse(draft.updatedAt)) ? new Date(draft.updatedAt).toLocaleString() : "保存时间未知"}</p>
                                    <div className="flex flex-wrap gap-2">
                                        <Button size="small" disabled={busy || !draft.timeline || !current} onClick={() => setSelected(draft)}>
                                            恢复草稿
                                        </Button>
                                        <Button size="small" onClick={() => onDownload(draft)}>
                                            下载草稿
                                        </Button>
                                        <Popconfirm title="删除这份本机草稿？" description="未同步的修改将无法从这份副本恢复。" okText="删除" cancelText="保留" onConfirm={() => onRemove(draft)}>
                                            <Button size="small" danger disabled={busy}>
                                                删除本机副本
                                            </Button>
                                        </Popconfirm>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </AppModal>
        </>
    );
}
