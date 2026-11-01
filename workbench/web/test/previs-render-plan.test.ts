import { expect, test } from "bun:test";
import { createPrevisScene } from "@/lib/canvas/previs/previs-scene";
import { previsShotRenderPlan } from "@/lib/canvas/previs/previs-render-plan";

test("white-clay video uses the selected film format and frame clock instead of the editor window", () => {
    const scene = createPrevisScene();
    scene.shots[0] = { ...scene.shots[0], duration: 2, fps: 24, aspectRatio: "16:9" };
    expect(previsShotRenderPlan(scene)).toEqual({ cameraId: scene.cameras[0].id, width: 1280, height: 720, fps: 24, frameCount: 48, duration: 2 });
    scene.shots[0].aspectRatio = "9:16";
    expect(previsShotRenderPlan(scene).width).toBe(720);
    expect(previsShotRenderPlan(scene).height).toBe(1280);
    scene.shots[0].aspectRatio = "1:1";
    expect(previsShotRenderPlan(scene).width).toBe(720);
    expect(previsShotRenderPlan(scene).height).toBe(720);
});
test("fractional duration is aligned to a real frame and unavailable cameras are rejected", () => {
    const scene = createPrevisScene();
    scene.shots[0] = { ...scene.shots[0], duration: 0.5, fps: 25 };
    expect(previsShotRenderPlan(scene).frameCount).toBe(13);
    expect(previsShotRenderPlan(scene).duration).toBe(0.52);
    scene.cameras = [];
    expect(() => previsShotRenderPlan(scene)).toThrow("机位");
});
