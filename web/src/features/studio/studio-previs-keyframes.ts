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
import type { StudioPrevis } from './studio-previs'

export type StudioPrevisKey = NonNullable<
  StudioPrevis['advanced']
>['tracks'][number]['keys'][number]
export function sampleStudioPrevisTrack(
  keys: StudioPrevisKey[],
  seconds: number,
  fallback: StudioPrevisKey
): StudioPrevisKey {
  if (!keys.length) return fallback
  const sorted = [...keys].sort((a, b) => a.time - b.time)
  if (seconds <= sorted[0].time) return { ...sorted[0], time: seconds }
  const right = sorted.findIndex((key) => key.time > seconds)
  if (right < 0) return { ...(sorted.at(-1) || fallback), time: seconds }
  const a = sorted[right - 1],
    b = sorted[right]
  const progress = (seconds - a.time) / (b.time - a.time)
  return {
    time: seconds,
    x: a.x + (b.x - a.x) * progress,
    y: a.y + (b.y - a.y) * progress,
    z: a.z + (b.z - a.z) * progress,
    yaw: a.yaw + (b.yaw - a.yaw) * progress,
  }
}
export function upsertStudioPrevisKey(
  scene: StudioPrevis,
  targetId: string,
  key: StudioPrevisKey
): StudioPrevis {
  if (key.time > scene.duration) {
    throw new Error('Keyframe exceeds scene duration')
  }
  if (
    targetId !== '__camera__' &&
    ![...scene.actors, ...scene.props, ...(scene.advanced?.models || [])].some(
      (item) => item.id === targetId
    )
  ) {
    throw new Error('Keyframe target is unavailable')
  }
  const advanced = scene.advanced || { models: [], tracks: [], showPaths: true }
  const old = advanced.tracks.find((track) => track.targetId === targetId)
  const keys = [
    ...(old?.keys || []).filter(
      (existing) => Math.abs(existing.time - key.time) > 0.001
    ),
    key,
  ].sort((a, b) => a.time - b.time)
  return {
    ...scene,
    advanced: {
      ...advanced,
      tracks: [
        ...advanced.tracks.filter((track) => track.targetId !== targetId),
        { targetId, keys },
      ],
    },
  }
}

export function removeStudioPrevisObject(
  scene: StudioPrevis,
  id: string
): StudioPrevis {
  const next = {
    ...scene,
    actors: scene.actors.filter((item) => item.id !== id),
    props: scene.props.filter((item) => item.id !== id),
  }
  if (!scene.advanced) return next
  return {
    ...next,
    advanced: {
      ...scene.advanced,
      models: scene.advanced.models.filter((item) => item.id !== id),
      tracks: scene.advanced.tracks.filter((track) => track.targetId !== id),
      followId:
        scene.advanced.followId === id ? undefined : scene.advanced.followId,
      lookAtId:
        scene.advanced.lookAtId === id ? undefined : scene.advanced.lookAtId,
    },
  }
}

export function resizeStudioPrevisDuration(
  scene: StudioPrevis,
  duration: number
): StudioPrevis {
  if (!scene.advanced || duration >= scene.duration) {
    return { ...scene, duration }
  }
  return {
    ...scene,
    duration,
    advanced: {
      ...scene.advanced,
      tracks: scene.advanced.tracks.map((track) => {
        if (!track.keys.some((key) => key.time > duration)) return track
        const fallback = { time: duration, x: 0, y: 0, z: 0, yaw: 0 }
        const boundary = sampleStudioPrevisTrack(track.keys, duration, fallback)
        return {
          ...track,
          keys: [...track.keys.filter((key) => key.time < duration), boundary],
        }
      }),
    },
  }
}
