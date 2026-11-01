import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Checkbox, InputNumber } from "antd";
import type { MediaAnalysisDocument, MediaAnalysisView } from "@/services/api/project-media-analysis";
import type { TimelineClip } from "@/types/timeline";
import { ReframePlanPreview } from "./reframe-plan-preview";

/** Explicit human path replaces crop positions; measured confidence is retained. */
export function ReframeManualPath({ view, draft, disabled, onChange }: { view: MediaAnalysisView; draft: MediaAnalysisDocument; disabled: boolean; onChange: (document: MediaAnalysisDocument) => void }) {
    const first = draft.tracking[0],
        last = draft.tracking[draft.tracking.length - 1];
    const [start, setStart] = useState({ x: first?.crop.x ?? 0, y: first?.crop.y ?? 0 });
    const [end, setEnd] = useState({ x: last?.crop.x ?? 0, y: last?.crop.y ?? 0 });
    const [confirmed, setConfirmed] = useState(false);
    useEffect(() => {
        setConfirmed(false);
    }, [draft]);
    useEffect(() => {
        setStart({ x: first?.crop.x ?? 0, y: first?.crop.y ?? 0 });
        setEnd({ x: last?.crop.x ?? 0, y: last?.crop.y ?? 0 });
    }, [first?.crop.x, first?.crop.y, last?.crop.x, last?.crop.y]);
    const clip = useMemo<TimelineClip | null>(() => {
        if (!first || !last || first.timeMs >= last.timeMs) return null;
        return {
            id: "manual-path-preview",
            kind: "video",
            nodeId: "manual-preview",
            trackId: "preview",
            startMs: 0,
            durationMs: view.source.endMs - view.source.startMs,
            sourceStartMs: view.source.startMs,
            reframe: {
                analysisId: view.analysis.id,
                revisionId: view.currentVersion.id,
                resourceId: view.source.resourceId,
                sourceSha256: view.source.sha256,
                sourceWidth: view.source.width!,
                sourceHeight: view.source.height!,
                width: first.crop.width,
                height: first.crop.height,
                startMs: view.source.startMs,
                endMs: view.source.endMs,
                keys: [
                    { timeMs: first.timeMs, ...start },
                    { timeMs: last.timeMs, ...end },
                ],
            },
        };
    }, [view, first, last, start, end]);
    if (!first || !last || !clip) return null;
    return (
        <details className="my-3 border-y border-border py-3">
            <summary className="cursor-pointer text-sm">用起点与终点修正整段构图</summary>
            <p className="my-2 text-xs">适合缓慢平移或固定机位。中间位置会匀速过渡；复杂运镜请使用下面的逐点校正。原始测量和置信度保留。</p>
            <div className="grid gap-3 sm:grid-cols-2">
                {(["start", "end"] as const).map((key) => (
                    <fieldset key={key}>
                        <legend className="text-sm">{key === "start" ? "起点" : "终点"}构图位置</legend>
                        <div className="flex gap-2">
                            {(["x", "y"] as const).map((axis) => (
                                <label key={axis} className="text-xs">
                                    {axis === "x" ? "左边" : "上边"}
                                    <InputNumber
                                        aria-label={`人工路径${key}${axis}`}
                                        min={0}
                                        max={Math.max(0, 1 - first.crop[axis === "x" ? "width" : "height"])}
                                        step={0.01}
                                        value={(key === "start" ? start : end)[axis]}
                                        disabled={disabled}
                                        onChange={(value) => {
                                            if (value === null) return;
                                            (key === "start" ? setStart : setEnd)((previous) => ({ ...previous, [axis]: value }));
                                            setConfirmed(false);
                                        }}
                                    />
                                </label>
                            ))}
                        </div>
                    </fieldset>
                ))}
            </div>
            <ReframePlanPreview clip={clip} />
            <Alert className="my-2" type="warning" title="这是你指定的人工构图，会替换整段的构图位置。请完整播放核对主体，尤其是遮挡、切镜和丢失区间。" />
            <Checkbox disabled={disabled} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}>
                我已检查这条人工路径，确认用于整段构图
            </Checkbox>
            <Button
                className="mt-2"
                disabled={disabled || !confirmed}
                onClick={() => {
                    onChange({
                        ...draft,
                        tracking: draft.tracking.map((point) => {
                            const weight = Math.max(0, Math.min(1, (point.timeMs - first.timeMs) / (last.timeMs - first.timeMs)));
                            return { ...point, crop: { x: start.x + (end.x - start.x) * weight, y: start.y + (end.y - start.y) * weight, width: first.crop.width, height: first.crop.height }, manual: true, reviewed: true };
                        }),
                    });
                    setConfirmed(false);
                }}
            >
                采用人工路径到校正草稿
            </Button>
            <p className="mt-2 text-xs">采用后仍需点击「保存校正」，再预览和采用到时间线。</p>
        </details>
    );
}
