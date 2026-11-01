import type { PrevisCamera, PrevisScene } from "@/types/previs";
import { samplePrevisCamera } from "./previs-camera-tracking";

/** Thin-lens circle of confusion; the scene's vertical FOV uses a 36 mm film extent. World distances are metres. */
export function previsLens(camera: Pick<PrevisCamera, "focalLength" | "aperture" | "focusDistance">) {
    const focal = camera.focalLength / 1000;
    if (![focal, camera.aperture, camera.focusDistance].every(Number.isFinite) || focal <= 0 || camera.aperture < 0.7 || camera.aperture > 32 || camera.focusDistance <= focal) {
        throw new Error("请设置有效的焦距、光圈和对焦距离；对焦距离需大于镜头焦距");
    }
    return { focus: camera.focusDistance, coefficient: (focal * focal) / (camera.aperture * (camera.focusDistance - focal) * 0.036) };
}

export function previsBlurRadiusPixels(camera: Pick<PrevisCamera, "focalLength" | "aperture" | "focusDistance">, depth: number, filmPixels: number) {
    if (!Number.isFinite(depth) || depth <= 0 || !Number.isFinite(filmPixels) || filmPixels <= 0) throw new Error("景深采样距离或画幅无效");
    const lens = previsLens(camera);
    return (filmPixels * lens.coefficient * Math.abs((depth - lens.focus) / depth)) / 2;
}

export function previsFocusAtTarget(scene: PrevisScene, camera: PrevisCamera, time: number) {
    const sample = samplePrevisCamera(scene, camera, time);
    if (!sample) throw new Error("摄影机注视对象不可用，请先修复机位绑定");
    const distance = Math.hypot(...sample.target.map((value, index) => value - sample.transform.position[index]));
    if (distance <= Math.max(0.1, camera.focalLength / 1000) || distance > 200) throw new Error("注视点超出对焦范围，请调整机位或注视点");
    return distance;
}
