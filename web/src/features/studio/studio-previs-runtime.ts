/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import type { StudioPrevis } from './studio-previs'
import {
  sampleStudioPrevisTrack,
  type StudioPrevisKey,
} from './studio-previs-keyframes'

export type StudioPrevisRuntime = {
  ready: Promise<unknown>
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  update: (time: number) => void
  clips: THREE.AnimationClip[]
  time: () => number
  dispose: () => void
  pick: (
    x: number,
    y: number
  ) => { id: string; x: number; y: number; z: number; yaw: number } | null
  ground: (x: number, y: number) => { x: number; z: number } | null
  moveObject: (id: string, x: number, z: number) => void
}
export function createStudioPrevisRuntime(
  element: HTMLElement,
  scene: StudioPrevis,
  getMedia: (id: string) => Promise<Blob | null>,
  options: {
    width?: number
    height?: number
    translate?: (key: string) => string
    onAnimations?: (id: string, names: string[]) => void
    onError?: (message: string) => void
  } = {}
): StudioPrevisRuntime {
  const advanced = scene.advanced || { models: [], tracks: [], showPaths: true }
  const t = options.translate || ((key: string) => key)
  let currentTime = 0
  let disposed = false
  const world = new THREE.Scene()
  world.background = new THREE.Color('#14191f')
  const width = options.width || 640
  const height = options.height || 360
  const camera = new THREE.PerspectiveCamera(
    scene.camera.fov,
    width / height,
    0.1,
    200
  )
  camera.name = '__camera__'
  world.add(camera)
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    })
  } catch {
    throw new Error(t('WebGL is unavailable; use simple composition'))
  }
  renderer.setSize(width, height)
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = 'auto'
  element.appendChild(renderer.domElement)
  world.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2))
  const light = new THREE.DirectionalLight(0xffffff, 3)
  light.position.set(5, 8, 4)
  world.add(light)
  world.add(new THREE.GridHelper(20, 20, 0x708090, 0x2e3b48))
  const objects = new Map<string, THREE.Object3D>()
  const mixers: THREE.AnimationMixer[] = []
  const clips: THREE.AnimationClip[] = []
  const fallback = new Map<string, StudioPrevisKey>()
  for (const actor of scene.actors) {
    const group = new THREE.Group()
    group.name = actor.id
    const material = new THREE.MeshStandardMaterial({ color: actor.color })
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.2, 0.8, 4, 8),
      material
    )
    body.position.y = actor.pose === 'sit' ? 0.65 : 1
    group.add(body)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), material)
    head.position.y = actor.pose === 'sit' ? 1.05 : 1.7
    group.add(head)
    for (const side of [-1, 1]) {
      const arm = new THREE.Group()
      arm.name = side < 0 ? 'left_arm' : 'right_arm'
      arm.position.set(side * 0.3, actor.pose === 'sit' ? 0.95 : 1.4, 0)
      const limb = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.07, 0.35, 4, 6),
        material
      )
      limb.position.y = -0.22
      arm.add(limb)
      group.add(arm)
      const leg = new THREE.Group()
      leg.name = side < 0 ? 'left_leg' : 'right_leg'
      leg.position.set(side * 0.12, actor.pose === 'sit' ? 0.6 : 0.75, 0)
      const lower = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.08, 0.55, 4, 6),
        material
      )
      lower.position.y = -0.28
      leg.add(lower)
      group.add(leg)
    }
    world.add(group)
    objects.set(actor.id, group)
    fallback.set(actor.id, {
      time: 0,
      x: actor.x,
      y: 0,
      z: actor.z,
      yaw: actor.yaw,
    })
  }
  for (const prop of scene.props) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(prop.width, prop.height, prop.depth),
      new THREE.MeshStandardMaterial({ color: prop.color })
    )
    mesh.name = prop.id
    world.add(mesh)
    objects.set(prop.id, mesh)
    fallback.set(prop.id, {
      time: 0,
      x: prop.x,
      y: prop.height / 2,
      z: prop.z,
      yaw: 0,
    })
  }
  for (const track of advanced.tracks) {
    if (track.targetId === '__camera__') continue
    const sorted = [...track.keys].sort((a, b) => a.time - b.time)
    if (sorted.length < 2) continue
    clips.push(
      new THREE.AnimationClip(track.targetId, scene.duration, [
        new THREE.VectorKeyframeTrack(
          `${track.targetId}.position`,
          sorted.map((key) => key.time),
          sorted.flatMap((key) => [key.x, key.y, key.z])
        ),
        new THREE.QuaternionKeyframeTrack(
          `${track.targetId}.quaternion`,
          sorted.map((key) => key.time),
          sorted.flatMap((key) =>
            new THREE.Quaternion()
              .setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                THREE.MathUtils.degToRad(key.yaw)
              )
              .toArray()
          )
        ),
      ])
    )
    if (advanced.showPaths) {
      world.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(
            sorted.map((key) => new THREE.Vector3(key.x, key.y, key.z))
          ),
          new THREE.LineBasicMaterial({ color: 0x00ddff })
        )
      )
    }
  }
  const render = (seconds: number): void => {
    currentTime = seconds
    const progress = seconds / scene.duration
    for (const [id, object] of objects) {
      let base = fallback.get(id)
      if (!base) continue
      const actor = scene.actors.find((actor) => actor.id === id)
      if (actor) {
        base = {
          ...base,
          x: actor.x + (actor.endX - actor.x) * progress,
          z: actor.z + (actor.endZ - actor.z) * progress,
        }
      }
      const sampled = sampleStudioPrevisTrack(
        advanced.tracks.find((track) => track.targetId === id)?.keys || [],
        seconds,
        base
      )
      object.position.set(sampled.x, sampled.y, sampled.z)
      object.rotation.y = THREE.MathUtils.degToRad(sampled.yaw)
      if (actor) {
        const swing = actor.pose === 'walk' ? Math.sin(seconds * 8) * 0.5 : 0
        const leftArm = object.getObjectByName('left_arm'),
          rightArm = object.getObjectByName('right_arm'),
          leftLeg = object.getObjectByName('left_leg'),
          rightLeg = object.getObjectByName('right_leg')
        if (leftArm) leftArm.rotation.set(swing, 0, 0)
        if (rightArm) {
          rightArm.rotation.set(-swing, 0, 0)
          if (actor.pose === 'wave') {
            rightArm.rotation.z = 2.8 + Math.sin(seconds * 8) * 0.15
          }
          if (actor.pose === 'point') rightArm.rotation.x = -Math.PI / 2
        }
        if (leftLeg) {
          leftLeg.rotation.x = actor.pose === 'sit' ? -Math.PI / 2 : -swing
        }
        if (rightLeg) {
          rightLeg.rotation.x = actor.pose === 'sit' ? -Math.PI / 2 : swing
        }
      }
    }
    for (const mixer of mixers) mixer.setTime(seconds)
    const orbit = sampleStudioPrevisTrack(
      advanced.tracks.find((track) => track.targetId === '__camera__')?.keys ||
        [],
      seconds,
      {
        time: seconds,
        x: 0,
        y: 0,
        z: 0,
        yaw:
          scene.camera.yaw +
          (scene.camera.endYaw - scene.camera.yaw) * progress,
      }
    )
    const yaw = THREE.MathUtils.degToRad(orbit.yaw),
      pitch = THREE.MathUtils.degToRad(scene.camera.pitch)
    const follow =
      objects.get(advanced.followId || '')?.position || new THREE.Vector3()
    camera.position.set(
      Math.sin(yaw) * scene.camera.distance * Math.cos(pitch) +
        follow.x +
        orbit.x,
      Math.sin(pitch) * scene.camera.distance + 1 + follow.y + orbit.y,
      Math.cos(yaw) * scene.camera.distance * Math.cos(pitch) +
        follow.z +
        orbit.z
    )
    camera.lookAt(
      objects
        .get(advanced.lookAtId || '')
        ?.position.clone()
        .add(new THREE.Vector3(0, 1, 0)) ||
        follow.clone().add(new THREE.Vector3(0, 1, 0))
    )
    renderer.render(world, camera)
  }
  const cameraTimes = [
    ...new Set([
      0,
      scene.duration,
      ...(advanced.tracks
        .find((track) => track.targetId === '__camera__')
        ?.keys.map((key) => key.time) || []),
    ]),
  ].sort((a, b) => a - b)
  const positions: number[] = [],
    rotations: number[] = []
  for (const seconds of cameraTimes) {
    render(seconds)
    positions.push(...camera.position.toArray())
    rotations.push(...camera.quaternion.toArray())
  }
  clips.push(
    new THREE.AnimationClip('Camera movement', scene.duration, [
      new THREE.VectorKeyframeTrack(
        '__camera__.position',
        cameraTimes,
        positions
      ),
      new THREE.QuaternionKeyframeTrack(
        '__camera__.quaternion',
        cameraTimes,
        rotations
      ),
    ])
  )
  const currentRuntime = {
    renderer,
    scene: world,
    camera,
    update: render,
    clips,
    ready: Promise.resolve() as Promise<unknown>,
  }
  render(currentTime)
  const manager = new THREE.LoadingManager()
  manager.setURLModifier((url) => {
    if (!url.startsWith('data:') && !url.startsWith('blob:')) {
      throw new Error('GLB external resources are not supported')
    }
    return url
  })
  const loader = new GLTFLoader(manager)
  const loading = Promise.all(
    advanced.models.map(async (model) => {
      const blob = await getMedia(model.modelMediaId)
      if (!blob) throw new Error(t('Stored 3D model is unavailable'))
      const gltf = await loader.parseAsync(await blob.arrayBuffer(), '')
      if (disposed) return
      const root = gltf.scene
      root.name = model.id
      root.scale.setScalar(model.scale)
      root.rotation.set(
        THREE.MathUtils.degToRad(model.pitch || 0),
        THREE.MathUtils.degToRad(model.yaw || 0),
        THREE.MathUtils.degToRad(model.roll || 0)
      )
      world.add(root)
      objects.set(model.id, root)
      fallback.set(model.id, {
        time: 0,
        x: model.x,
        y: model.y,
        z: model.z,
        yaw: model.yaw || 0,
      })
      if (gltf.animations.length && model.animation !== '__none__') {
        const mixer = new THREE.AnimationMixer(root)
        const clip =
          gltf.animations.find((clip) => clip.name === model.animation) ||
          gltf.animations[0]
        mixer.clipAction(clip).play()
        mixers.push(mixer)
        clips.push(...gltf.animations)
      }
      options.onAnimations?.(
        model.id,
        gltf.animations.map((clip) => clip.name)
      )
      render(currentTime)
    })
  )
  currentRuntime.ready = loading
  void loading.catch((error) => {
    if (!disposed) options.onError?.(String(error))
  })
  const dispose = () => {
    disposed = true
    renderer.dispose()
    element.replaceChildren()
    world.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose()
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material]
        materials.forEach((material) => {
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) value.dispose()
          }
          material.dispose()
        })
      }
    })
    mixers.forEach((mixer) => mixer.stopAllAction())
  }
  const ray = new THREE.Raycaster()
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  return {
    ...currentRuntime,
    dispose,
    time: () => currentTime,
    pick: (x, y) => {
      ray.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), camera)
      const hit = ray.intersectObjects([...objects.values()], true)[0]
      if (!hit) return null
      let object: THREE.Object3D | null = hit.object
      while (object && objects.get(object.name) !== object) {
        object = object.parent
      }
      return object
        ? {
            id: object.name,
            x: object.position.x,
            y: object.position.y,
            z: object.position.z,
            yaw: THREE.MathUtils.radToDeg(object.rotation.y),
          }
        : null
    },
    ground: (x, y) => {
      ray.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), camera)
      const point = ray.ray.intersectPlane(groundPlane, new THREE.Vector3())
      return point ? { x: point.x, z: point.z } : null
    },
    moveObject: (id, x, z) => {
      const object = objects.get(id)
      if (!object) return
      object.position.x = x
      object.position.z = z
      renderer.render(world, camera)
    },
  }
}

export function captureStudioPrevisFrame(
  runtime: StudioPrevisRuntime,
  definition: StudioPrevis,
  seconds: number,
  mode: 'color' | 'whitebox' | 'depth' = 'color'
): string {
  const originalTime = runtime.time()
  const previousMaterial = runtime.scene.overrideMaterial
  const previousBackground = runtime.scene.background
  const previousFar = runtime.camera.far
  const helpers: THREE.Object3D[] = []
  let material: THREE.Material | undefined
  try {
    runtime.update(seconds)
    if (mode !== 'color') {
      runtime.scene.traverse((object) => {
        if (
          (object instanceof THREE.Line || object instanceof THREE.Points) &&
          object.visible
        ) {
          helpers.push(object)
          object.visible = false
        }
      })
      runtime.camera.far = Math.max(
        runtime.camera.near + 1,
        definition.camera.distance * 2 + 10
      )
      runtime.camera.updateProjectionMatrix()
      material =
        mode === 'whitebox'
          ? new THREE.MeshStandardMaterial({
              color: '#ffffff',
              roughness: 1,
              metalness: 0,
            })
          : new THREE.MeshDepthMaterial({
              depthPacking: THREE.BasicDepthPacking,
            })
      if (mode === 'depth') {
        material.onBeforeCompile = (shader) => {
          shader.uniforms.studioDepthNear = { value: runtime.camera.near }
          shader.uniforms.studioDepthFar = { value: runtime.camera.far }
          shader.fragmentShader = `uniform float studioDepthNear;uniform float studioDepthFar;\n${shader.fragmentShader.replace(
            '1.0 - fragCoordZ',
            'clamp(1.0-(-perspectiveDepthToViewZ(fragCoordZ,studioDepthNear,studioDepthFar)-studioDepthNear)/(studioDepthFar-studioDepthNear),0.0,1.0)'
          )}`
        }
        material.customProgramCacheKey = () => 'studio-linear-camera-depth'
      }
      runtime.scene.overrideMaterial = material
      runtime.scene.background = new THREE.Color(
        mode === 'whitebox' ? '#888888' : '#000000'
      )
      runtime.renderer.render(runtime.scene, runtime.camera)
    }
    return runtime.renderer.domElement.toDataURL('image/png')
  } finally {
    helpers.forEach((object) => {
      object.visible = true
    })
    runtime.camera.far = previousFar
    runtime.camera.updateProjectionMatrix()
    runtime.scene.overrideMaterial = previousMaterial
    runtime.scene.background = previousBackground
    material?.dispose()
    runtime.update(originalTime)
  }
}
