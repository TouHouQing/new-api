import type { SrtEntry } from "@/types/timeline";

function timeToMs(timestamp: string): number {
    const [hours, minutes, secondsAndMs] = timestamp.split(":");
    const [seconds, milliseconds] = secondsAndMs.split(",");

    return Number.parseInt(hours, 10) * 3_600_000 + Number.parseInt(minutes, 10) * 60_000 + Number.parseInt(seconds, 10) * 1_000 + Number.parseInt(milliseconds, 10);
}

export function parseSrt(content: string): SrtEntry[] {
    if (!content.trim()) {
        return [];
    }

    const blocks = content.trim().split(/\r?\n\s*\r?\n/);
    const entries: SrtEntry[] = [];

    for (const block of blocks) {
        const lines = block.trim().split(/\r?\n/);
        if (lines.length < 3) {
            continue;
        }

        const index = Number.parseInt(lines[0], 10);
        if (Number.isNaN(index)) {
            continue;
        }

        const match = lines[1].match(/\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/);
        if (!match) {
            continue;
        }

        const [start, end] = match[0].split(/\s*-->\s*/);
        entries.push({
            index,
            startMs: timeToMs(start),
            endMs: timeToMs(end),
            text: lines.slice(2).join("\n"),
        });
    }

    return entries;
}

/** Interactive imports must report every invalid block instead of silently
 * discarding part of a user's subtitle file. The tolerant parser stays usable
 * for existing external-provider responses. */
export function inspectSrtImport(content: string): { entries: SrtEntry[]; invalidBlocks: number[] } {
    const blocks = content.trim() ? content.trim().split(/\r?\n\s*\r?\n/) : [];
    const entries: SrtEntry[] = [];
    const invalidBlocks: number[] = [];
    const identities = new Set<number>();
    const stamp = String.raw`\d{2}:[0-5]\d:[0-5]\d,\d{3}`;
    const timeLine = new RegExp(`^${stamp}\\s*-->\\s*${stamp}$`);
    blocks.forEach((block, offset) => {
        const lines = block.trim().split(/\r?\n/);
        const entry = parseSrt(block)[0];
        if (!/^\d+$/.test(lines[0] ?? "") || !timeLine.test(lines[1]?.trim() ?? "") || !entry || entry.index < 1 || identities.has(entry.index) || entry.endMs <= entry.startMs || entry.endMs > 86_400_000 || !entry.text.trim()) {
            invalidBlocks.push(offset + 1);
            return;
        }
        identities.add(entry.index);
        entries.push(entry);
    });
    return { entries, invalidBlocks };
}

function msToTimestamp(ms: number): string {
    const safeMs = Math.max(0, Math.round(ms));
    const hours = Math.floor(safeMs / 3_600_000);
    const minutes = Math.floor((safeMs % 3_600_000) / 60_000);
    const seconds = Math.floor((safeMs % 60_000) / 1_000);
    const milliseconds = safeMs % 1_000;
    return `${String(hours).padStart(2, "0")}:` + `${String(minutes).padStart(2, "0")}:` + `${String(seconds).padStart(2, "0")},` + `${String(milliseconds).padStart(3, "0")}`;
}

export function serializeSrtEntries(entries: SrtEntry[]): string {
    if (entries.length === 0) {
        return "";
    }
    return (
        entries
            .map((entry, idx) => {
                const index = Number.isInteger(entry.index) && entry.index > 0 ? entry.index : idx + 1;
                return `${index}\n${msToTimestamp(entry.startMs)} --> ${msToTimestamp(entry.endMs)}\n${entry.text}`;
            })
            .join("\n\n") + "\n"
    );
}
