import type { LyricsAnchor, TranscriptDocument } from "@/services/api/project-transcripts";

export function lyricsAnchorsForAlignment(document: TranscriptDocument): LyricsAnchor[] {
    if (!document.lyrics) return [];
    const segments = new Map(document.segments.map((segment) => [segment.id, segment]));
    return document.lyrics.lines.flatMap((line) => {
        const segment = segments.get(line.segmentId);
        if (!segment) return [];
        if (line.method !== "manual" && line.sourceSpanIds?.length) return [{ line: line.line, startSpanId: line.sourceSpanIds[0], endSpanId: line.sourceSpanIds.at(-1), reviewed: false } as LyricsAnchor];
        return [{ line: line.line, startMs: segment.startMs, endMs: segment.endMs, reviewed: false } as LyricsAnchor];
    });
}

/** Keep original section labels/spacing while carrying later text corrections
 * into a new alignment draft. Original provenance remains immutable. */
export function lyricsTextForAlignment(document: TranscriptDocument): string {
    if (!document.lyrics) return "";
    const bySegment = new Map(document.segments.map((segment) => [segment.id, segment.text]));
    const byLine = new Map(document.lyrics.lines.map((line) => [line.line, bySegment.get(line.segmentId)]));
    let line = -1;
    return document.lyrics.text
        .replaceAll("\r\n", "\n")
        .split("\n")
        .map((text) => {
            if (!text.trim()) return text;
            line++;
            return byLine.get(line) ?? text;
        })
        .join("\n");
}
