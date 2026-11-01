import type { PrevisScene } from "@/types/previs";
import { resolvePrevisAspectRatio } from "./previs-scene";

export function previsShotRenderPlan(document: PrevisScene) {
    const shot = document.shots.find((value) => value.id === document.activeShotId);
    if (!shot || ![24, 25, 30].includes(shot.fps) || !Number.isFinite(shot.duration) || shot.duration < 0.1 || shot.duration > 60 || !document.cameras.some((value) => value.id === shot.cameraId)) throw new Error("预演镜头、机位、帧率或时长不正确");
    const ratio = resolvePrevisAspectRatio(shot.aspectRatio),
        height = ratio >= 1 ? 720 : Math.round(720 / ratio / 2) * 2,
        width = ratio >= 1 ? Math.round((720 * ratio) / 2) * 2 : 720;
    const frameCount = Math.ceil(shot.duration * shot.fps - 1e-8);
    return { cameraId: shot.cameraId, width, height, fps: shot.fps, frameCount, duration: frameCount / shot.fps };
}
