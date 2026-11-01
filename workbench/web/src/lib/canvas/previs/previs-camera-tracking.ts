import type { PrevisCamera, PrevisScene, PrevisTransform, PrevisVec3 } from "@/types/previs";
import { interpolatePrevisTransform } from "./previs-scene";

export type PrevisCameraSample = { transform: PrevisTransform; target: PrevisVec3; followOffset: PrevisVec3 };
const finite = (value: unknown): value is PrevisVec3 => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

// Camera positions/keyframes remain relative to the followed object. The
// target is relative to the looked-at object, or to the followed object when
// no separate subject is chosen. A missing binding cannot become a static shot.
export function samplePrevisCamera(scene: PrevisScene, camera: PrevisCamera, time: number): PrevisCameraSample | null {
    if (!Number.isFinite(time)) return null;
    const positionOf = (id: string): PrevisVec3 | undefined => {
        const object = scene.objects.find((item) => item.id === id);
        if (!object) return undefined;
        const position = interpolatePrevisTransform(object.transform, object.keyframes, time).position;
        return finite(position) ? position : undefined;
    };
    const follow: PrevisVec3 | undefined = camera.followObjectId ? positionOf(camera.followObjectId) : [0, 0, 0];
    const look = camera.lookAtObjectId ? positionOf(camera.lookAtObjectId) : follow;
    if (!follow || !look) return null;
    const local = interpolatePrevisTransform(camera.transform, camera.keyframes, time);
    if (![local.position, local.rotation, local.scale, camera.target].every(finite)) return null;
    const position = local.position.map((value, index) => value + follow[index]) as PrevisVec3;
    const target = camera.target.map((value, index) => value + look[index]) as PrevisVec3;
    return { transform: { ...local, position }, target, followOffset: [...follow] };
}
