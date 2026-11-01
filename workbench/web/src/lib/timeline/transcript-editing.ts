import type { TranscriptChange, TranscriptDocument } from "@/services/api/project-transcripts";

/** Corrections cannot change source timing or inject unrecognized spans. */
export function transcriptChanges(original: TranscriptDocument, draft: TranscriptDocument): TranscriptChange[] {
    if (original.segments.length !== draft.segments.length) throw new Error("文字稿条目发生变化，请重新载入");
    return draft.segments.flatMap((segment, index) => {
        const source = original.segments[index];
        if (source.id !== segment.id || source.startMs !== segment.startMs || source.endMs !== segment.endMs) throw new Error("校正文字时不能修改源时间");
        const text = segment.text.trim(),
            speaker = (segment.speaker ?? "").trim();
        if (!text || [...text].length > 8000 || [...speaker].length > 80) throw new Error("每句需要1至8000字，说话人最多80字");
        const change: TranscriptChange = { id: segment.id };
        if (text !== source.text) change.text = text;
        if (speaker !== (source.speaker ?? "")) change.speaker = speaker;
        return change.text !== undefined || change.speaker !== undefined ? [change] : [];
    });
}

function srtTime(ms: number): string {
    const value = Math.max(0, Math.round(ms));
    return `${String(Math.floor(value / 3600000)).padStart(2, "0")}:${String(Math.floor(value / 60000) % 60).padStart(2, "0")}:${String(Math.floor(value / 1000) % 60).padStart(2, "0")},${String(value % 1000).padStart(3, "0")}`;
}
/** The source SRT uses source time; timeline adoption maps each occurrence separately. */
export function transcriptSourceSrt(document: TranscriptDocument): string {
    return document.segments.map((segment, index) => `${index + 1}\n${srtTime(segment.startMs)} --> ${srtTime(segment.endMs)}\n${segment.text.trim()}\n`).join("\n");
}
export function downloadTranscriptFile(name: string, text: string, type = "text/plain;charset=utf-8"): void {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 180);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
