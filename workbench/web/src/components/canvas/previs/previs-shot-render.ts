import { AmbientLight, AnimationMixer, Mesh, MeshBasicMaterial, MeshDepthMaterial, MeshNormalMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, WebGLRenderer } from "three";
import type { PrevisRenderMode, PrevisScene } from "@/types/previs";
import { previsShotRenderPlan } from "@/lib/canvas/previs/previs-render-plan";
import { applyClaySceneMaterials } from "@/lib/canvas/previs/previs-clay-materials";
import { encodeCanvasFrames } from "@/lib/canvas/canvas-frame-video";
import type { CaptureContext } from "./previs-viewport";
import { buildPrevisGLTFScene } from "./previs-gltf-export";
import { PrevisDepthOfField } from "./previs-depth-of-field";

function openShotRenderer(context: CaptureContext | null, document: PrevisScene, mode: PrevisRenderMode) {
    if (!context) throw new Error("3D 视口尚未就绪");
    const shot = document.shots.find((value) => value.id === document.activeShotId);
    if (!shot) throw new Error("请先选择预演镜头");
    const plan = previsShotRenderPlan(document),
        { width, height } = plan;
    const built = buildPrevisGLTFScene(context.scene, document);
    let renderer: WebGLRenderer | null = null;
    try {
        const camera = built.scene.getObjectByName(shot.cameraId);
        if (!(camera instanceof PerspectiveCamera)) throw new Error("镜头的摄影机不可用");
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(1);
        renderer.setSize(width, height, false);
        renderer.shadowMap.enabled = true;
        renderer.outputColorSpace = context.gl.outputColorSpace;
        renderer.toneMapping = context.gl.toneMapping;
        renderer.toneMappingExposure = context.gl.toneMappingExposure;
        built.scene.background = context.scene.background;
        built.scene.environment = context.scene.environment;
        built.scene.environmentIntensity = context.scene.environmentIntensity;
        built.scene.add(new AmbientLight("#ffffff", document.environmentIntensity));
        const ground = new Mesh(new PlaneGeometry(200, 200), new MeshStandardMaterial({ color: "#bac1c8", roughness: 1 }));
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.01;
        ground.receiveShadow = true;
        built.scene.add(ground);
        const restoreClay = mode === "clay" ? applyClaySceneMaterials(built.scene) : null;
        const override = mode === "depth" ? new MeshDepthMaterial() : mode === "normal" ? new MeshNormalMaterial() : mode === "pose" ? new MeshBasicMaterial({ wireframe: true, color: "#ffffff" }) : null;
        built.scene.overrideMaterial = override;
        const mixer = new AnimationMixer(built.scene);
        const action = mixer.clipAction(built.animation);
        action.play();
        const lens = document.cameras.find((item) => item.id === shot.cameraId),
            effect = lens?.depthOfField && (mode === "clay" || mode === "beauty") ? new PrevisDepthOfField() : null;
        return {
            plan,
            render: async (time: number) => {
                mixer.setTime(Math.max(0, Math.min(shot.duration - 1e-7, time)));
                built.scene.updateMatrixWorld(true);
                if (effect && lens) effect.render(renderer!, built.scene, camera, lens, width, height);
                else renderer!.render(built.scene, camera);
                return new Promise<Blob>((resolve, reject) => renderer!.domElement.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("预演帧读取失败"))), "image/png"));
            },
            dispose: () => {
                effect?.dispose();
                mixer.stopAllAction();
                mixer.uncacheRoot(built.scene);
                restoreClay?.();
                override?.dispose();
                ground.geometry.dispose();
                (ground.material as MeshStandardMaterial).dispose();
                built.dispose();
                renderer!.dispose();
                renderer!.forceContextLoss();
            },
        };
    } catch (error) {
        built.dispose();
        renderer?.dispose();
        renderer?.forceContextLoss();
        throw error;
    }
}

export async function capturePrevisShot(context: CaptureContext | null, document: PrevisScene, mode: PrevisRenderMode, time = 0) {
    const session = openShotRenderer(context, document, mode);
    try {
        return await session.render(time);
    } finally {
        session.dispose();
    }
}

export async function recordPrevisShot(context: CaptureContext | null, document: PrevisScene, options: { signal?: AbortSignal; onProgress?: (percent: number) => void } = {}) {
    const session = openShotRenderer(context, document, "clay"),
        { frameCount, fps } = session.plan;
    async function* frames() {
        for (let index = 0; index < frameCount; index++) {
            options.signal?.throwIfAborted();
            yield await session.render(index / fps);
        }
    }
    try {
        return await encodeCanvasFrames(frames(), fps, frameCount, options);
    } finally {
        session.dispose();
    }
}
