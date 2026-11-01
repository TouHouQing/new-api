import { useState } from "react";
import { Button } from "antd";
import { useEditorStoreContext } from "@/components/editor/editor-context";
import { MEDIA_ANALYSIS_REMOVE_REFRAME_COMMAND } from "@/lib/timeline/media-analysis-command";
import type { TimelineClip } from "@/types/timeline";
import { MediaAnalysisEditor } from "./media-analysis-editor";

export function EditorReframeSource({ clip }: { clip: TimelineClip }) {
    const [open, setOpen] = useState(false);
    const { dispatch, editingBlocked, inPreview } = useEditorStoreContext();
    const reframe = clip.reframe;
    if (!reframe) return null;
    return (
        <>
            <p className="mb-2 text-xs">此片段使用固定的构图校正版本。修改分析后，可预览并确认替换；原素材保留。</p>
            <div className="mb-2 flex flex-wrap gap-2">
                <Button size="small" disabled={editingBlocked || inPreview} onClick={() => setOpen(true)}>
                    查看采用的构图方案
                </Button>
                <Button size="small" disabled={editingBlocked || inPreview} onClick={() => dispatch({ op: MEDIA_ANALYSIS_REMOVE_REFRAME_COMMAND, payload: { clipId: clip.id } })}>
                    移除此片段构图
                </Button>
            </div>
            {open && <MediaAnalysisEditor analysisId={reframe.analysisId} initialRevisionId={reframe.revisionId} sourceClipId={clip.id} onClose={() => setOpen(false)} onChanged={() => {}} />}
        </>
    );
}
