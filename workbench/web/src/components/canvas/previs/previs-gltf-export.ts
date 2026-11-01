import {
    AnimationClip,
    AnimationMixer,
    Color,
    DirectionalLight,
    LoopOnce,
    LoopRepeat,
    Material,
    Mesh,
    MeshStandardMaterial,
    Object3D,
    PerspectiveCamera,
    PointLight,
    QuaternionKeyframeTrack,
    Scene,
    SpotLight,
    VectorKeyframeTrack,
    type KeyframeTrack,
} from "three";
import { GLTFExporter, SkeletonUtils } from "three-stdlib";
import type { PrevisScene } from "@/types/previs";
import { resolvePrevisViewFraming } from "@/lib/canvas/previs/previs-view-modes";
import { interpolatePrevisTransform, PREVIS_DEFAULT_ACTOR_URL, resolvePrevisAspectRatio } from "@/lib/canvas/previs/previs-scene";
import { applyPrevisBoneTracks } from "./previs-viewport-rig";
import { samplePrevisClayLimb } from "@/lib/canvas/previs/previs-clay-motion";

function sampleTimes(scene: PrevisScene, duration: number, fps: number) {
    const times = new Set([0, duration]);
    for (let frame = 1; frame / fps < duration; frame++) times.add(frame / fps);
    for (const item of [...scene.objects, ...scene.cameras]) for (const key of item.keyframes) if (key.time >= 0 && key.time <= duration) times.add(key.time);
    for (const object of scene.objects) for (const track of object.boneTracks || []) for (const key of track.keyframes) if (key.time >= 0 && key.time <= duration) times.add(key.time);
    return [...times].sort((a, b) => a - b);
}

function stripEditorHelpers(root: Object3D) {
    for (const child of [...root.children]) {
        if (child.userData.previsEditorHelper || child.type.endsWith("Helper")) root.remove(child);
        else stripEditorHelpers(child);
    }
}

// Clones only authored object roots. Gizmos, grids, selection handles and
// monitoring cameras never enter the exported scene; viewport resources stay owned.
export function buildPrevisGLTFScene(viewport: Scene, document: PrevisScene) {
    const shot = document.shots.find((item) => item.id === document.activeShotId);
    if (!shot || !Number.isFinite(shot.duration) || shot.duration <= 0 || shot.duration > 60) throw new Error("请先选择有效的预演镜头");
    const times = sampleTimes(document, shot.duration, shot.fps);
    const scene = new Scene();
    scene.name = document.title;
    scene.userData = { yingcePrevis: JSON.parse(JSON.stringify(document)) };
    const ownedMaterials: Material[] = [];
    const tracks: KeyframeTrack[] = [];
    try {
        for (const object of document.objects.filter((item) => item.visible)) {
            let source: Object3D | undefined;
            viewport.traverse((item) => {
                if (item.userData.previsObjectId === object.id) source = item;
            });
            if (!source) throw new Error(`对象“${object.name}”尚未准备好，请等待加载后再导出`);
            const root = SkeletonUtils.clone(source);
            stripEditorHelpers(root);
            root.name = object.id;
            let model: Object3D | undefined;
            root.traverse((item) => {
                if (item.userData.previsLoadedModel) model = item;
            });
            const requiresModel = object.kind === "model" || (object.kind === "actor" && object.url && (object.url !== PREVIS_DEFAULT_ACTOR_URL || object.assetId)) || object.primitive === "character";
            if (requiresModel && !model) throw new Error(`模型“${object.name}”加载未完成，未导出占位模型`);
            root.traverse((item) => {
                if (!(item instanceof Mesh)) return;
                const copy = (material: Material) => {
                    const next = material.type === "ShaderMaterial" ? new MeshStandardMaterial({ color: object.color, roughness: 0.84 }) : material.clone();
                    if (next instanceof MeshStandardMaterial) {
                        if (object.kind === "primitive" || (object.kind === "actor" && !model)) next.color.set(object.color);
                        next.emissive.set(0);
                        next.emissiveIntensity = 0;
                    }
                    ownedMaterials.push(next);
                    return next;
                };
                item.material = Array.isArray(item.material) ? item.material.map(copy) : copy(item.material);
            });
            const nodes: Object3D[] = [];
            root.traverse((item) => nodes.push(item));
            const values = nodes.map(() => ({ positions: [] as number[], rotations: [] as number[], scales: [] as number[] }));
            const motion = object.motionClips?.find((item) => item.id === object.activeMotionClipId);
            const animation = motion && model?.animations.find((item) => item.name === motion.sourceAnimation);
            const mixer = animation && model ? new AnimationMixer(model) : null;
            if (mixer && animation)
                mixer
                    .clipAction(animation)
                    .setLoop(motion?.loop ? LoopRepeat : LoopOnce, motion?.loop ? Infinity : 1)
                    .play();
            for (const time of times) {
                const transform = interpolatePrevisTransform(object.transform, object.keyframes, time);
                root.position.fromArray(transform.position);
                root.rotation.set(...transform.rotation);
                root.scale.fromArray(transform.scale);
                if (mixer && motion && animation) {
                    const local = Math.max(0, time - motion.start) * motion.playbackRate;
                    const duration = motion.duration || animation.duration;
                    mixer.setTime(motion.loop && duration > 0 ? local % duration : local);
                }
                if (model) applyPrevisBoneTracks(model, object, time, object.rig || null, model.userData.previsRestRotations || {}, Boolean(animation));
                for (const node of nodes) if (node.userData.previsClayLimb && node.userData.previsClayBaseRotation) node.rotation.set(...samplePrevisClayLimb(node.userData.previsClayBaseRotation, object.pose, node.userData.previsClayLimb, time));
                nodes.forEach((node, index) => {
                    values[index].positions.push(...node.position.toArray());
                    values[index].rotations.push(...node.quaternion.toArray());
                    values[index].scales.push(...node.scale.toArray());
                });
            }
            mixer?.stopAllAction();
            if (mixer && model) mixer.uncacheRoot(model);
            nodes.forEach((node, index) => {
                const value = values[index];
                tracks.push(new VectorKeyframeTrack(`${node.uuid}.position`, times, value.positions), new QuaternionKeyframeTrack(`${node.uuid}.quaternion`, times, value.rotations), new VectorKeyframeTrack(`${node.uuid}.scale`, times, value.scales));
                node.position.fromArray(value.positions);
                node.quaternion.fromArray(value.rotations);
                node.scale.fromArray(value.scales);
                // Runtime rig bookkeeping may reference three objects; native source
                // metadata lives once on scene extras, never on every model node.
                const { previsLoadedModel: _loaded, previsRestRotations: _rest, previsObjectId: _objectId, ...metadata } = node.userData;
                node.userData = metadata;
            });
            scene.add(root);
        }
        for (const source of document.cameras) {
            const camera = new PerspectiveCamera(source.fov, resolvePrevisAspectRatio(shot.aspectRatio), source.near, source.far);
            camera.name = source.id;
            const positions: number[] = [],
                rotations: number[] = [];
            for (const time of times) {
                const sample = resolvePrevisViewFraming({ scene: document, mode: "camera", cameraId: source.id, playhead: time });
                if (!sample) throw new Error(`摄影机“${source.name}”的跟随对象不可用`);
                camera.position.fromArray(sample.position);
                camera.up.fromArray(sample.up);
                camera.lookAt(...sample.target);
                positions.push(...camera.position.toArray());
                rotations.push(...camera.quaternion.toArray());
            }
            tracks.push(new VectorKeyframeTrack(`${camera.uuid}.position`, times, positions), new QuaternionKeyframeTrack(`${camera.uuid}.quaternion`, times, rotations));
            camera.position.fromArray(positions);
            camera.quaternion.fromArray(rotations);
            scene.add(camera);
        }
        for (const source of document.lights) {
            // glTF has no ambient-light node; the complete environment remains
            // in native scene extras. Punctual lights use the standard extension.
            if (source.type === "ambient") continue;
            const light =
                source.type === "directional"
                    ? new DirectionalLight(source.color, source.intensity)
                    : source.type === "spot"
                      ? new SpotLight(source.color, source.intensity, 0, source.angle, source.penumbra)
                      : new PointLight(source.color, source.intensity);
            light.name = source.id;
            light.position.fromArray(source.transform.position);
            light.rotation.set(...source.transform.rotation);
            light.scale.fromArray(source.transform.scale);
            if (source.type === "directional" || source.type === "spot") light.lookAt(0, 0, 0);
            scene.add(light);
        }
        scene.background = new Color(document.background);
        scene.updateMatrixWorld(true);
        return { scene, animation: new AnimationClip(shot.name, shot.duration, tracks), dispose: () => ownedMaterials.forEach((item) => item.dispose()) };
    } catch (error) {
        ownedMaterials.forEach((item) => item.dispose());
        throw error;
    }
}

export async function exportPrevisGLB(viewport: Scene, document: PrevisScene) {
    const built = buildPrevisGLTFScene(viewport, document);
    try {
        const data = await new GLTFExporter().parseAsync(built.scene, { binary: true, animations: [built.animation], onlyVisible: true });
        if (!(data instanceof ArrayBuffer)) throw new Error("3D 导出格式不正确");
        return new Blob([data], { type: "model/gltf-binary" });
    } finally {
        built.dispose();
    }
}
