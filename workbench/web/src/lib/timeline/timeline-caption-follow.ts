import type { TimelineClip, TimelineProject } from "@/types/timeline";
import { linkedAudioFragmentId } from "./timeline-audio-links";
import { clipPlaybackRate, clipSourceOffset } from "./timeline-speed";
import { captionSourceId, validateTimelineCaptionLinks } from "./timeline-caption-links";

/** Transcript cues follow their exact source occurrence; text and confidence
 * remain snapshots. A partial cue retains its text for editorial review. */
export function reconcileTimelineCaptionFollow(before: TimelineProject, after: TimelineProject, replacements: Record<string, string[]>): TimelineProject {
    const old = new Map(before.clips.map((clip) => [clip.id, clip])),
        current = new Map(after.clips.map((clip) => [clip.id, clip]));
    const result: TimelineClip[] = [],
        ids = new Set<string>();
    const add = (clip: TimelineClip) => {
        if (ids.has(clip.id)) throw new Error("关联字幕编号冲突，请保留原剪辑并重新预览");
        ids.add(clip.id);
        result.push(clip);
    };
    for (const clip of after.clips) {
        const original = old.get(clip.id),
            sourceId = captionSourceId(original);
        if (clip.kind !== "subtitle" || !sourceId) {
            add(clip);
            continue;
        }
        if (original?.captionLink && captionSourceId(clip) !== sourceId) {
            add(clip);
            continue;
        }
        const parent = old.get(sourceId);
        if (!parent || (parent.kind !== "video" && parent.kind !== "audio")) throw new Error("关联字幕的原片段不存在，请保留字幕并修复来源");
        let targetIds = replacements[parent.id] ?? [parent.id];
        if (!Object.hasOwn(replacements, parent.id) && parent.audioLink) {
            const videoIds = replacements[parent.audioLink.sourceClipId] ?? [parent.audioLink.sourceClipId];
            targetIds = [...new Set([parent.id, ...videoIds.map((id) => linkedAudioFragmentId(parent.id, id))])];
        }
        const targets = targetIds.map((id) => current.get(id)).filter((item): item is TimelineClip => !!item && item.kind === parent.kind);
        if (
            targets.length === 1 &&
            targets[0].id === parent.id &&
            targets[0].startMs === parent.startMs &&
            targets[0].durationMs === parent.durationMs &&
            (targets[0].sourceStartMs ?? 0) === (parent.sourceStartMs ?? 0) &&
            clipPlaybackRate(targets[0]) === clipPlaybackRate(parent)
        ) {
            if (original?.captionLink && (clip.startMs !== original.startMs || clip.durationMs !== original.durationMs)) {
                const sourceStartMs = (parent.sourceStartMs ?? 0) + (clip.startMs - parent.startMs) * clipPlaybackRate(parent);
                add({ ...clip, captionLink: { ...original.captionLink, sourceStartMs, sourceEndMs: sourceStartMs + clip.durationMs * clipPlaybackRate(parent) } });
            } else add(clip);
            continue;
        }
        const cueStart = original?.captionLink?.sourceStartMs ?? (parent.sourceStartMs ?? 0) + (original!.startMs - parent.startMs) * clipPlaybackRate(parent);
        const cueEnd = original?.captionLink?.sourceEndMs ?? cueStart + original!.durationMs * clipPlaybackRate(parent);
        const pieces: TimelineClip[] = [];
        for (const target of targets) {
            const from = Math.max(cueStart, target.sourceStartMs ?? 0),
                to = Math.min(cueEnd, (target.sourceStartMs ?? 0) + clipSourceOffset(target, target.durationMs));
            if (to <= from) continue;
            const startMs = Math.round(target.startMs + (from - (target.sourceStartMs ?? 0)) / clipPlaybackRate(target));
            const durationMs = Math.min(Math.round((to - from) / clipPlaybackRate(target)), target.startMs + target.durationMs - startMs);
            if (durationMs < 1) throw new Error("关联字幕过短，请调整剪切范围");
            pieces.push({
                ...original!,
                startMs,
                durationMs,
                ...(original?.captionLink ? { captionLink: { sourceClipId: target.id, sourceStartMs: from, sourceEndMs: to } } : { productionBinding: { ...original!.productionBinding!, sourceClipId: target.id } }),
                ...(original!.fadeInMs !== undefined ? { fadeInMs: Math.min(durationMs, original!.fadeInMs) } : {}),
                ...(original!.fadeOutMs !== undefined ? { fadeOutMs: Math.min(durationMs, original!.fadeOutMs) } : {}),
            });
        }
        if (pieces.length === 1 && JSON.stringify(pieces[0]) === JSON.stringify(original)) {
            add(clip);
            continue;
        }
        if (before.tracks.find((track) => track.id === original!.trackId)?.locked) throw new Error("关联字幕轨已锁定，请先解锁再编辑来源片段");
        pieces.forEach((piece, index) => {
            const id = index === 0 ? original!.id : linkedAudioFragmentId(`caption:${original!.id}`, captionSourceId(piece)!);
            if (index > 0 && current.has(id)) throw new Error("关联字幕编号冲突，请重新预览");
            add({ ...piece, id });
        });
    }
    if (result.length > 5000) throw new Error("拆分后的关联字幕超过上限，请分段编辑");
    return validateTimelineCaptionLinks({ ...after, clips: result, durationMs: result.reduce((end, clip) => Math.max(end, clip.startMs + clip.durationMs), 0) });
}
