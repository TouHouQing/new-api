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
export const STUDIO_NODE_PORTS = {
  text: {
    inputs: [{ id: 'brief', label: 'studio.port.brief' }],
    outputs: [
      { id: 'scene', label: 'studio.port.scene' },
      { id: 'image_prompt', label: 'studio.port.imagePrompt' },
      { id: 'video_prompt', label: 'studio.port.videoPrompt' },
    ],
  },
  image: {
    inputs: [
      { id: 'prompt', label: 'studio.port.prompt' },
      { id: 'reference_image', label: 'studio.port.referenceImage' },
    ],
    outputs: [{ id: 'image', label: 'studio.port.image' }],
  },
  video: {
    inputs: [
      { id: 'prompt', label: 'studio.port.prompt' },
      { id: 'first_frame', label: 'studio.port.firstFrame' },
      { id: 'last_frame', label: 'studio.port.lastFrame' },
      { id: 'reference_image', label: 'studio.port.referenceImage' },
      { id: 'reference_video', label: 'studio.port.referenceVideo' },
      { id: 'extend_video', label: 'studio.port.extendVideo' },
      { id: 'native_extend', label: 'studio.port.nativeExtend' },
    ],
    outputs: [{ id: 'video', label: 'studio.port.video' }],
  },
  audio: {
    inputs: [{ id: 'text', label: 'studio.port.audioText' }],
    outputs: [{ id: 'audio', label: 'studio.kind.audio' }],
  },
  assembly: {
    inputs: [
      { id: 'clip', label: 'studio.port.clip' },
      { id: 'soundtrack', label: 'studio.audio.useSoundtrack' },
      { id: 'voiceover', label: 'studio.audio.useVoiceover' },
    ],
    outputs: [{ id: 'video', label: 'studio.port.video' }],
  },
} as const

export const STUDIO_TYPED_CONNECTIONS = [
  'text:scene:text:brief',
  'text:scene:image:prompt',
  'text:image_prompt:image:prompt',
  'text:scene:video:prompt',
  'text:video_prompt:video:prompt',
  'text:scene:audio:text',
  'image:image:image:reference_image',
  'image:image:video:first_frame',
  'image:image:video:last_frame',
  'image:image:video:reference_image',
  'video:video:video:reference_video',
  'video:video:video:extend_video',
  'video:video:video:native_extend',
  'video:video:video:clip',
  'audio:audio:video:soundtrack',
  'audio:audio:video:voiceover',
] as const
