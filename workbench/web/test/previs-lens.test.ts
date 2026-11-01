import { expect, test } from "bun:test";
import { previsBlurRadiusPixels, previsFocusAtTarget, previsLens } from "@/lib/canvas/previs/previs-lens";
import { createPrevisScene, previsIdentityTransform } from "@/lib/canvas/previs/previs-scene";

test("thin lens focuses exactly on the focus plane and scales with aperture and sensor pixels", () => {
    const lens = { focalLength: 50, aperture: 2, focusDistance: 2 };
    expect(previsBlurRadiusPixels(lens, 2, 1280)).toBe(0);
    expect(previsBlurRadiusPixels(lens, 4, 1280)).toBeCloseTo(5.698005698, 7);
    expect(previsBlurRadiusPixels({ ...lens, aperture: 4 }, 4, 1280)).toBeCloseTo(previsBlurRadiusPixels(lens, 4, 1280) / 2, 10);
    expect(previsBlurRadiusPixels(lens, 4, 2560)).toBeCloseTo(previsBlurRadiusPixels(lens, 4, 1280) * 2, 10);
    expect(previsBlurRadiusPixels(lens, 1, 1280)).toBeGreaterThan(previsBlurRadiusPixels(lens, 4, 1280));
});
test("invalid or impossible lens distances never enter a render pass", () => {
    for (const value of [
        { focalLength: 200, aperture: 2, focusDistance: 0.1 },
        { focalLength: 50, aperture: 0, focusDistance: 2 },
        { focalLength: 50, aperture: 2, focusDistance: NaN },
    ])
        expect(() => previsLens(value)).toThrow();
    expect(() => previsBlurRadiusPixels({ focalLength: 50, aperture: 2, focusDistance: 2 }, 0, 1280)).toThrow();
});
test("one-click focus uses the current animated world target, with missing bindings rejected", () => {
    const scene = createPrevisScene(),
        camera = scene.cameras[0],
        actor = scene.objects[0];
    actor.transform = previsIdentityTransform([3, 0, 0]);
    camera.transform = previsIdentityTransform([0, 0, 4]);
    camera.target = [0, 0, 0];
    camera.lookAtObjectId = actor.id;
    expect(previsFocusAtTarget(scene, camera, 0)).toBe(5);
    actor.keyframes = [{ id: "end", time: 1, easing: "linear", transform: previsIdentityTransform([0, 0, 1]) }];
    expect(previsFocusAtTarget(scene, camera, 1)).toBe(3);
    scene.objects = [];
    expect(() => previsFocusAtTarget(scene, camera, 0)).toThrow("不可用");
});
