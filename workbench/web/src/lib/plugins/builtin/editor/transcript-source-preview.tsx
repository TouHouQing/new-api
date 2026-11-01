import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button } from "antd";
import { useEditorStoreApi } from "@/components/editor/editor-context";
import { resourceFileUrl } from "@/services/api/resources";
import { formatTimelineTime } from "@/lib/timeline/timeline-view";

export type TranscriptListenRange = { startMs: number; endMs: number; request: number };

/** Always plays the original resource, in source time, independently of cuts. */
export function TranscriptSourcePreview({ resourceId, range, suspended, onClockMs, label = "文字稿源素材预听" }: { resourceId: string; range: TranscriptListenRange | null; suspended: boolean; onClockMs?: (timeMs: number) => void; label?: string }) {
    const store = useEditorStoreApi();
    const audio = useRef<HTMLAudioElement | null>(null);
    const stopAt = useRef<number | null>(null);
    const sequence = useRef(0);
    const consumed = useRef("");
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);
    // A stable ref pauses detached media on close/retry, including pending play().
    const attach = useCallback((node: HTMLAudioElement | null) => {
        if (audio.current && audio.current !== node) audio.current.pause();
        audio.current = node;
        sequence.current++;
    }, []);
    useEffect(() => {
        const node = audio.current;
        if (!node || !range || suspended) return;
        const identity = `${resourceId}:${range.request}:${attempt}`;
        if (consumed.current === identity) return;
        consumed.current = identity;
        const current = ++sequence.current;
        node.pause();
        setError("");
        const seek = () => {
            if (sequence.current !== current || audio.current !== node) return;
            const duration = Number.isFinite(node.duration) ? node.duration : Infinity;
            node.currentTime = Math.min(Math.max(0, range.startMs / 1000 - 0.2), duration);
            stopAt.current = Math.min(range.endMs / 1000 + 0.2, duration);
            store.getState().pausePlayback();
            void node.play().catch((failure: unknown) => {
                if (sequence.current === current && audio.current === node) setError(failure instanceof Error ? failure.message : "原音预听失败，请使用播放器重试");
            });
        };
        if (node.readyState >= 1) seek();
        else node.addEventListener("loadedmetadata", seek, { once: true });
        return () => {
            sequence.current++;
            node.removeEventListener("loadedmetadata", seek);
        };
    }, [range, suspended, store, attempt, resourceId]);
    useEffect(() => {
        if (suspended) {
            sequence.current++;
            audio.current?.pause();
        }
    }, [suspended]);
    return (
        <div className="my-3 border-y border-border py-3">
            <p className="mb-2 text-sm">
                预听源素材
                {range && (
                    <span className="ml-2 text-xs text-muted-foreground">
                        {formatTimelineTime(range.startMs)}–{formatTimelineTime(range.endMs)}
                    </span>
                )}
            </p>
            <audio
                key={`${resourceId}:${attempt}`}
                ref={attach}
                aria-label={label}
                src={resourceFileUrl(resourceId)}
                preload="metadata"
                controls
                className="w-full"
                onPlay={() => {
                    if (suspended) audio.current?.pause();
                    else store.getState().pausePlayback();
                }}
                onTimeUpdate={() => {
                    const node = audio.current;
                    if (node) onClockMs?.(Math.round(node.currentTime * 1000));
                    if (node && stopAt.current !== null && node.currentTime >= stopAt.current) {
                        node.pause();
                        stopAt.current = null;
                    }
                }}
                onSeeking={() => {
                    const node = audio.current;
                    if (node && stopAt.current !== null && node.currentTime > stopAt.current) stopAt.current = null;
                }}
                onError={() => setError("源素材暂时无法播放，请确认素材可访问后重试")}
            />
            {error && (
                <Alert
                    className="mt-2"
                    type="warning"
                    title={error}
                    action={
                        <Button
                            size="small"
                            onClick={() => {
                                setError("");
                                stopAt.current = null;
                                setAttempt((value) => value + 1);
                            }}
                        >
                            重载原音
                        </Button>
                    }
                />
            )}
        </div>
    );
}
