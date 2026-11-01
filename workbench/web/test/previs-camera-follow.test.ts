import { expect, test } from "bun:test";
import { createPrevisScene, previsIdentityTransform } from "@/lib/canvas/previs/previs-scene";
import { samplePrevisCamera } from "@/lib/canvas/previs/previs-camera-tracking";
import { resolvePrevisViewFraming } from "@/lib/canvas/previs/previs-view-modes";

function fixture() {
    const scene = createPrevisScene("移动机位");
    const actor = scene.objects[0]!;
    actor.id = "actor";
    actor.transform = previsIdentityTransform([2, 0, 0]);
    actor.keyframes = [
        { id: "start", time: 0, transform: previsIdentityTransform([2, 0, 0]), easing: "linear" },
        { id: "end", time: 2, transform: previsIdentityTransform([6, 0, 2]), easing: "linear" },
    ];
    scene.objects.push({ ...actor, id: "subject", transform: previsIdentityTransform([-2, 1, 3]), keyframes: [] });
    const camera = scene.cameras[0]!;
    camera.transform = previsIdentityTransform([0, 3, 8]);
    camera.target = [0, 1, 0];
    camera.keyframes = [];
    return { scene, camera };
}

test("a following camera preserves its offset while the actor moves", () => {
    const { scene, camera } = fixture();
    camera.followObjectId = "actor";
    expect(samplePrevisCamera(scene, camera, 0)?.transform.position).toEqual([2, 3, 8]);
    expect(samplePrevisCamera(scene, camera, 1)?.transform.position).toEqual([4, 3, 9]);
    expect(samplePrevisCamera(scene, camera, 2)?.target).toEqual([6, 1, 2]);
    expect(camera.transform.position).toEqual([0, 3, 8]);
});

test("following and looking at different objects remain independent", () => {
    const { scene, camera } = fixture();
    camera.followObjectId = "actor";
    camera.lookAtObjectId = "subject";
    const framing = resolvePrevisViewFraming({ scene, mode: "camera", playhead: 1 });
    expect(framing?.position).toEqual([4, 3, 9]);
    expect(framing?.target).toEqual([-2, 2, 3]);
    expect(samplePrevisCamera(scene, camera, 1)?.followOffset).toEqual([4, 0, 1]);
});

test("an invalid tracking binding never silently changes into a static camera", () => {
    for (const field of ["followObjectId", "lookAtObjectId"] as const) {
        const { scene, camera } = fixture();
        camera[field] = "deleted-object";
        expect(samplePrevisCamera(scene, camera, 1)).toBeNull();
        expect(resolvePrevisViewFraming({ scene, mode: "camera", playhead: 1 })).toBeNull();
    }
});

test("existing unbound cameras and authored camera keyframes keep their world positions", () => {
    const { scene, camera } = fixture();
    camera.keyframes = [
        { id: "a", time: 0, transform: previsIdentityTransform([0, 3, 8]), easing: "linear" },
        { id: "b", time: 2, transform: previsIdentityTransform([4, 3, 4]), easing: "linear" },
    ];
    const before = JSON.stringify(camera),
        sample = samplePrevisCamera(scene, camera, 1);
    expect(sample?.transform.position).toEqual([2, 3, 6]);
    expect(sample?.target).toEqual([0, 1, 0]);
    expect(JSON.stringify(camera)).toBe(before);
});
