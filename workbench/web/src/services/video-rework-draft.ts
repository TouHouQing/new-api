import type { StateStorage } from "zustand/middleware";
import type { VideoReworkRegion, VideoReworkSource } from "@/types/video-rework";
export type VideoReworkDraft = {
    version: 1;
    projectId: string;
    clipId: string;
    clipSha256: string;
    sourceSha256: string;
    start: number;
    end: number;
    candidateId: string;
    candidateStart: number;
    audio: "original" | "candidate" | "mute";
    region?: VideoReworkRegion;
};
export function videoReworkDraftKey(projectId: string, clipId: string) {
    return `video-rework-draft-v1:${projectId}:${clipId}`;
}
export async function readVideoReworkDraft(storage: StateStorage, projectId: string, clipId: string, source: VideoReworkSource): Promise<VideoReworkDraft | null> {
    const raw = await storage.getItem(videoReworkDraftKey(projectId, clipId));
    if (!raw) return null;
    let d: VideoReworkDraft;
    try {
        d = JSON.parse(raw);
    } catch {
        throw new Error("修复草稿无法读取，请保留本地数据后检查");
    }
    const r = d?.region;
    if (
        d?.version !== 1 ||
        d.projectId !== projectId ||
        d.clipId !== clipId ||
        d.clipSha256 !== source.clipSha256 ||
        d.sourceSha256 !== source.media.sha256 ||
        ![d.start, d.end, d.candidateStart].every((v) => Number.isFinite(v) && v >= 0 && v <= 86400) ||
        typeof d.candidateId !== "string" ||
        d.candidateId.length > 80 ||
        !["original", "candidate", "mute"].includes(d.audio) ||
        (r && (![r.x, r.y, r.width, r.height].every(Number.isInteger) || r.x < 0 || r.y < 0 || r.width < 2 || r.height < 2 || r.x + r.width > source.media.width || r.y + r.height > source.media.height))
    )
        throw new Error("原片段已变化或草稿范围无效，请核对原选择后重设草稿");
    return d;
}
