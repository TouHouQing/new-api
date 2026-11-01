import { expect, test } from "bun:test";
import { lyricsAnchorsForAlignment, lyricsTextForAlignment } from "../src/lib/timeline/lyrics-editing";
import type { TranscriptDocument } from "../src/services/api/project-transcripts";

test("新对齐草稿保留原副歌标签、空行与后来校正，不能重写来源文本", () => {
    const document: TranscriptDocument = {
        version: 2,
        precision: "segment",
        segments: [
            { id: "first", text: "雨夜重逢！", startMs: 500, endMs: 1000 },
            { id: "second", text: "同行", startMs: 1500, endMs: 2000 },
        ],
        lyrics: {
            version: 1,
            text: "[Verse]\r\n雨夜重逢\r\n\r\n[Chorus]\r\n同行",
            sourceRevisionId: "original",
            sourceDocumentSha256: "a".repeat(64),
            lyricsSha256: "b".repeat(64),
            requestId: "request-native-0001",
            requestSha256: "c".repeat(64),
            lines: [
                { line: 1, segmentId: "first", method: "manual" },
                { line: 3, segmentId: "second", method: "source_segment", sourceSpanIds: ["s1"] },
            ],
        },
    };
    expect(lyricsTextForAlignment(document)).toBe("[Verse]\n雨夜重逢！\n\n[Chorus]\n同行");
    expect(document.lyrics?.text).toContain("雨夜重逢\r\n");
    const before = JSON.stringify(document);
    expect(lyricsAnchorsForAlignment(document)).toEqual([
        { line: 1, startMs: 500, endMs: 1000, reviewed: false },
        { line: 3, startSpanId: "s1", endSpanId: "s1", reviewed: false },
    ]);
    expect(JSON.stringify(document)).toBe(before);
    expect(lyricsTextForAlignment({ version: 1, precision: "segment", segments: document.segments })).toBe("");
});

test("重开真实原词范围不会换成推算时间，也不会自动批准新版本", () => {
    const document: TranscriptDocument = {
        version: 2,
        precision: "word",
        segments: [{ id: "line", text: "重逢", startMs: 731, endMs: 1518 }],
        words: [
            { id: "w1", text: "重", startMs: 731, endMs: 830 },
            { id: "w2", text: "逢", startMs: 1218, endMs: 1518 },
        ],
        lyrics: {
            version: 1,
            text: "重逢",
            sourceRevisionId: "source",
            sourceDocumentSha256: "a".repeat(64),
            lyricsSha256: "b".repeat(64),
            requestId: "request-native-0002",
            requestSha256: "c".repeat(64),
            lines: [{ line: 0, segmentId: "line", method: "source_words", sourceSpanIds: ["w1", "w2"] }],
        },
    };
    expect(lyricsAnchorsForAlignment(document)).toEqual([{ line: 0, startSpanId: "w1", endSpanId: "w2", reviewed: false }]);
    expect(lyricsAnchorsForAlignment({ version: 1, precision: "segment", segments: document.segments })).toEqual([]);
});
