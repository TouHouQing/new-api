import { expect, test } from "bun:test";
import { AnimationMixer, BoxGeometry, Group, Mesh, MeshStandardMaterial, Scene, VectorKeyframeTrack, AnimationClip } from "three";
import { buildPrevisGLTFScene } from "@/components/canvas/previs/previs-gltf-export";
import { createPrevisCamera, createPrevisObject, createPrevisScene, previsIdentityTransform } from "@/lib/canvas/previs/previs-scene";

test("GLB graph preserves authored animation and tracking while excluding helpers and keeping live scene intact", () => {
    const document = createPrevisScene("导演场景");
    const object = createPrevisObject("box", "移动道具", [2, 0, 0], "#123456");
    object.id = "actor";
    object.keyframes = [
        { id: "a", time: 0, transform: previsIdentityTransform([2, 0, 0]) },
        { id: "b", time: 2, transform: previsIdentityTransform([6, 0, 0]) },
    ];
    const camera = createPrevisCamera();
    camera.id = "camera";
    camera.transform = previsIdentityTransform([0, 3, 8]);
    camera.followObjectId = object.id;
    document.objects = [object];
    document.cameras = [camera];
    document.shots[0] = { ...document.shots[0], duration: 2, cameraId: camera.id };
    document.lights = [];
    const viewport = new Scene();
    const root = new Group();
    root.userData.previsObjectId = object.id;
    root.position.set(100, 10, 10);
    root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ color: "yellow" })));
    const gizmo = new Group();
    gizmo.userData.previsEditorHelper = true;
    gizmo.name = "editor-gizmo";
    root.add(gizmo);
    viewport.add(root);
    const built = buildPrevisGLTFScene(viewport, document);
    try {
        expect(built.scene.children.length).toBe(2);
        expect(built.scene.getObjectByName("editor-gizmo")).toBeUndefined();
        const target = built.scene.getObjectByName(object.id)!;
        const exportedCamera = built.scene.getObjectByName(camera.id)!;
        const mixer = new AnimationMixer(built.scene);
        mixer.clipAction(built.animation).play();
        mixer.setTime(1);
        expect(target.position.x).toBeCloseTo(4);
        expect(exportedCamera.position.x).toBeCloseTo(4);
        expect(exportedCamera.position.y).toBeCloseTo(3);
        expect(root.position.x).toBe(100);
        expect(root.children.length).toBe(2);
        expect((root.children[0] as Mesh).material).not.toBe((target.children[0] as Mesh).material);
        expect((built.scene.userData.yingcePrevis as typeof document).cameras[0].followObjectId).toBe("actor");
        mixer.stopAllAction();
        mixer.uncacheRoot(built.scene);
    } finally {
        built.dispose();
    }
});

test("GLB export refuses missing loaded models and tracking subjects", () => {
    const document = createPrevisScene();
    document.objects = [{ ...createPrevisObject(), kind: "model", url: "/model.glb" }];
    const viewport = new Scene();
    const root = new Group();
    root.userData.previsObjectId = document.objects[0].id;
    viewport.add(root);
    expect(() => buildPrevisGLTFScene(viewport, document)).toThrow("加载未完成");
    document.objects = [];
    document.cameras[0].followObjectId = "missing";
    expect(() => buildPrevisGLTFScene(new Scene(), document)).toThrow("跟随对象不可用");
});

test("GLB export bakes the selected GLB animation using the native motion clock", () => {
    const document = createPrevisScene();
    const object = { ...createPrevisObject(), kind: "model" as const, url: "/model.glb", motionClips: [{ id: "motion", name: "Walk", sourceAnimation: "Walk", start: 0, duration: 2, playbackRate: 1, loop: false }], activeMotionClipId: "motion" };
    document.objects = [object];
    document.shots[0].duration = 2;
    const viewport = new Scene(),
        root = new Group(),
        model = new Group(),
        child = new Group();
    root.userData.previsObjectId = object.id;
    model.userData.previsLoadedModel = true;
    child.name = "Animated";
    model.add(child);
    root.add(model);
    viewport.add(root);
    model.animations = [new AnimationClip("Walk", 2, [new VectorKeyframeTrack("Animated.position", [0, 2], [0, 0, 0, 2, 0, 0])])];
    const built = buildPrevisGLTFScene(viewport, document);
    try {
        const mixer = new AnimationMixer(built.scene);
        mixer.clipAction(built.animation).play();
        mixer.setTime(1);
        expect(built.scene.getObjectByName("Animated")!.position.x).toBeCloseTo(1);
        expect(child.position.x).toBe(0);
        mixer.stopAllAction();
        mixer.uncacheRoot(built.scene);
    } finally {
        built.dispose();
    }
});
