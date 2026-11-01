import type { TimelineClip } from "@/types/timeline";

type Entry = readonly [number, number];
const before = (a: Entry, b: Entry) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
class LaneHeap {
    private items: Entry[] = [];
    peek() {
        return this.items[0];
    }
    push(value: Entry) {
        let index = this.items.length;
        this.items.push(value);
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (!before(value, this.items[parent]!)) break;
            this.items[index] = this.items[parent]!;
            index = parent;
        }
        this.items[index] = value;
    }
    pop(): Entry | undefined {
        const first = this.items[0],
            last = this.items.pop();
        if (!this.items.length || !last) return first;
        let index = 0;
        while (index * 2 + 1 < this.items.length) {
            let child = index * 2 + 1;
            if (child + 1 < this.items.length && before(this.items[child + 1]!, this.items[child]!)) child++;
            if (!before(this.items[child]!, last)) break;
            this.items[index] = this.items[child]!;
            index = child;
        }
        this.items[index] = last;
        return first;
    }
}

/** Display overlapping occurrences separately. Document order and rendering
 * layers stay untouched; intervals sharing only an endpoint reuse a row. */
export function timelineDisplayLanes(clips: readonly Pick<TimelineClip, "id" | "startMs" | "durationMs">[]) {
    const active = new LaneHeap(),
        free = new LaneHeap(),
        lanes = new Map<string, number>();
    let count = 0;
    const ordered = clips.map((clip, index) => ({ clip, index })).sort((a, b) => a.clip.startMs - b.clip.startMs || a.index - b.index);
    for (const { clip } of ordered) {
        while (active.peek() && active.peek()![0] <= clip.startMs) {
            const lane = active.pop()![1];
            free.push([lane, lane]);
        }
        const lane = free.pop()?.[1] ?? count++;
        lanes.set(clip.id, lane);
        active.push([clip.startMs + clip.durationMs, lane]);
    }
    return { lanes, count: Math.max(1, count) };
}
