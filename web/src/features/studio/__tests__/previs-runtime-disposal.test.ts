/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { studioPrevisSchema } from '../studio-previs'
import { createStudioPrevisRuntime } from '../studio-previs-runtime'

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  renderers: [] as {
    dispose: ReturnType<typeof vi.fn>
    forceContextLoss: ReturnType<typeof vi.fn>
    render: ReturnType<typeof vi.fn>
  }[],
  parse: vi.fn(),
}))

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = document.createElement('canvas')
      render = vi.fn()
      setSize = vi.fn()
      dispose = vi.fn(() => mocks.events.push('renderer-dispose'))
      forceContextLoss = vi.fn(() => mocks.events.push('context-loss'))
      constructor() {
        mocks.renderers.push(this)
      }
    },
  }
})

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    parseAsync = mocks.parse
  },
}))

beforeEach(() => {
  mocks.events.length = 0
  mocks.renderers.length = 0
  mocks.parse.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

function sourceScene() {
  return studioPrevisSchema.parse({
    advanced: {
      models: [
        {
          id: 'model',
          title: 'Own GLB',
          modelMediaId: 'glb',
          x: 0,
          y: 0,
          z: 0,
        },
      ],
    },
  })
}

describe('3D preview resource ownership', () => {
  it('releases shared GLTF data before renderer bookkeeping and its owned context', async () => {
    class Bitmap {
      close = vi.fn()
    }
    vi.stubGlobal('ImageBitmap', Bitmap)
    const bitmap = new Bitmap(),
      texture = new THREE.Texture(bitmap)
    const geometry = new THREE.BoxGeometry(),
      material = new THREE.MeshStandardMaterial({ map: texture })
    const loaded = new THREE.Group()
    loaded.add(
      new THREE.Mesh(geometry, material),
      new THREE.Mesh(geometry, material)
    )
    const geometryDispose = vi.spyOn(geometry, 'dispose')
    const textureDispose = vi.spyOn(texture, 'dispose')
    const materialDispose = vi.spyOn(material, 'dispose')
    material.addEventListener('dispose', () =>
      mocks.events.push('material-dispose')
    )
    mocks.parse.mockResolvedValue({ scene: loaded, animations: [] })
    const element = document.createElement('div')
    const runtime = createStudioPrevisRuntime(
      element,
      sourceScene(),
      async () => new Blob(['glb'])
    )
    await runtime.ready
    runtime.dispose()
    runtime.dispose()
    expect(geometryDispose).toHaveBeenCalledTimes(1)
    expect(textureDispose).toHaveBeenCalledTimes(1)
    expect(materialDispose).toHaveBeenCalledTimes(1)
    expect(bitmap.close).toHaveBeenCalledTimes(1)
    expect(mocks.events).toEqual([
      'material-dispose',
      'renderer-dispose',
      'context-loss',
    ])
    expect(mocks.renderers[0].dispose).toHaveBeenCalledTimes(1)
    expect(element.childElementCount).toBe(0)
    expect(runtime.scene.children).toHaveLength(0)
    const renders = mocks.renderers[0].render.mock.calls.length
    runtime.update(1)
    runtime.moveObject('model', 2, 2)
    expect(mocks.renderers[0].render).toHaveBeenCalledTimes(renders)
  })

  it('releases a GLTF that finishes parsing after its preview closes', async () => {
    let finish: (value: unknown) => void = () => {
      throw new Error('Missing parser continuation')
    }
    mocks.parse.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const element = document.createElement('div')
    const onAnimations = vi.fn()
    const runtime = createStudioPrevisRuntime(
      element,
      sourceScene(),
      async () => new Blob(['glb']),
      { onAnimations }
    )
    await vi.waitFor(() => expect(mocks.parse).toHaveBeenCalledOnce())
    runtime.dispose()
    const geometry = new THREE.BoxGeometry(),
      material = new THREE.MeshStandardMaterial()
    const geometryDispose = vi.spyOn(geometry, 'dispose'),
      materialDispose = vi.spyOn(material, 'dispose')
    finish({
      scene: new THREE.Group().add(new THREE.Mesh(geometry, material)),
      animations: [],
    })
    await runtime.ready
    expect(geometryDispose).toHaveBeenCalledOnce()
    expect(materialDispose).toHaveBeenCalledOnce()
    expect(onAnimations).not.toHaveBeenCalled()
    expect(runtime.scene.children).toHaveLength(0)
    expect(element.childElementCount).toBe(0)
    expect(mocks.renderers[0].forceContextLoss).toHaveBeenCalledOnce()
  })

  it('does not start parsing when the media arrives after disposal', async () => {
    let finish: (value: Blob) => void = () => {
      throw new Error('Missing media continuation')
    }
    const media = new Promise<Blob>((resolve) => {
      finish = resolve
    })
    const runtime = createStudioPrevisRuntime(
      document.createElement('div'),
      sourceScene(),
      () => media
    )
    runtime.dispose()
    finish(new Blob(['glb']))
    await runtime.ready
    expect(mocks.parse).not.toHaveBeenCalled()
  })
})
