import { useEffect, useState } from "react";
import { Alert, Button, Pagination, Spin } from "antd";
import { getTranscriptSuggestions, type TranscriptSuggestion, type TranscriptView } from "@/services/api/project-transcripts";
import { formatTimelineTime } from "@/lib/timeline/timeline-view";

/** Observations are bound to the saved version; they never silently edit media. */
export function TranscriptReviewDetails({ view, dirty, onListen }: { view: TranscriptView; dirty: boolean; onListen: (startMs: number, endMs: number) => void }) {
    const [hintsOpen, setHintsOpen] = useState(false),
        [wordsOpen, setWordsOpen] = useState(false);
    const [hints, setHints] = useState<TranscriptSuggestion[] | null>(null);
    const [busy, setBusy] = useState(false),
        [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0),
        [page, setPage] = useState(1);
    const { transcript, currentVersion, document } = view;
    useEffect(() => {
        setHints(null);
        setPage(1);
    }, [transcript.id, currentVersion.id]);
    useEffect(() => {
        if (!hintsOpen) return;
        const controller = new AbortController();
        setBusy(true);
        setError("");
        setHints(null);
        void getTranscriptSuggestions(transcript.projectId, transcript.id, currentVersion.id, controller.signal)
            .then((value) => {
                if (controller.signal.aborted) return;
                if (value.transcriptId !== transcript.id || value.revisionId !== currentVersion.id) throw new Error("提示版本不一致，请重新读取");
                setHints(value.suggestions);
            })
            .catch((failure: unknown) => {
                if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "检查失败");
            })
            .finally(() => {
                if (!controller.signal.aborted) setBusy(false);
            });
        return () => controller.abort();
    }, [hintsOpen, transcript.projectId, transcript.id, currentVersion.id, attempt]);
    const words = document.words ?? [];
    return (
        <div className="my-3 border-t border-border pt-3">
            <div className="flex flex-wrap gap-2">
                <Button size="small" aria-expanded={hintsOpen} onClick={() => setHintsOpen(!hintsOpen)}>
                    {hintsOpen ? "收起检查提示" : "检查停顿与重复"}
                </Button>
                {words.length > 0 && (
                    <Button size="small" aria-expanded={wordsOpen} onClick={() => setWordsOpen(!wordsOpen)}>
                        {wordsOpen ? "收起逐词时间" : "查看逐词时间"}
                    </Button>
                )}
            </div>
            {hintsOpen && (
                <div className="mt-3" data-testid="transcript-review-hints">
                    <p className="mb-2 text-xs text-muted-foreground">
                        依据已保存的 V{currentVersion.version}，检查超过0.8秒的句间空隙和相邻重复文字。请先预听，再到“按文字剪切媒体”中决定取舍。{dirty ? "当前有未保存校正，保存后会重新检查。" : ""}
                    </p>
                    {busy && <Spin size="small" />}
                    {error && (
                        <Alert
                            type="warning"
                            title={error}
                            action={
                                <Button size="small" onClick={() => setAttempt((value) => value + 1)}>
                                    重试检查
                                </Button>
                            }
                        />
                    )}
                    <div className="max-h-48 space-y-2 overflow-y-auto">
                        {hints?.map((hint) => (
                            <div key={hint.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                <span>
                                    {hint.kind === "pause" ? "较长停顿" : "可能重复"} · {formatTimelineTime(hint.startMs)}–{formatTimelineTime(hint.endMs)} · {hint.segmentId}
                                </span>
                                <Button size="small" aria-label={`预听${hint.kind === "pause" ? "停顿" : "重复"} ${hint.id}`} onClick={() => onListen(hint.startMs, hint.endMs)}>
                                    预听
                                </Button>
                            </div>
                        ))}
                    </div>
                    {hints?.length === 0 && <p className="text-sm text-muted-foreground">未发现较长句间停顿或相邻重复文字；仍建议完整预听。</p>}
                </div>
            )}
            {wordsOpen && (
                <div className="mt-3" data-testid="transcript-words">
                    <p className="mb-2 text-xs text-muted-foreground">原始识别的逐词时间，只读；点击预听核对。{document.wordTextNeedsReview ? "文字已校正，逐词文字仍保留原稿。" : ""}</p>
                    <div className="max-h-56 space-y-2 overflow-y-auto">
                        {words.slice((page - 1) * 50, page * 50).map((word) => (
                            <div key={word.id} className="flex items-center justify-between gap-2 text-sm">
                                <span>
                                    {word.text}{" "}
                                    <span className="text-xs text-muted-foreground">
                                        {formatTimelineTime(word.startMs)}–{formatTimelineTime(word.endMs)}
                                        {word.confidence === undefined ? "" : ` · 置信度 ${Math.round(word.confidence * 100)}%`}
                                    </span>
                                </span>
                                <Button size="small" aria-label={`预听词 ${word.id}`} onClick={() => onListen(word.startMs, word.endMs)}>
                                    预听
                                </Button>
                            </div>
                        ))}
                    </div>
                    <Pagination className="mt-2" size="small" current={page} pageSize={50} total={words.length} showSizeChanger={false} onChange={setPage} />
                </div>
            )}
        </div>
    );
}
