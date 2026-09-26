/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { beforeEach, expect, test, vi } from 'vitest'

import { preflightStudioVideos, stitchStudioVideos } from '../studio-mp4'

type Fixture = {
  start: number
  duration: number
  width: number
  height: number
  videoTimestamps: number[]
  audioSamples?: Float32Array
  audioCanDecode?: boolean
  audioStart?: number
}

const media = vi.hoisted(() => ({
  fixtures: new Map<Blob, Fixture>(),
  video: [] as {
    timestamp: number
    duration: number
    keyFrame: boolean
    fadeGain: number
    composited: boolean
    captionText: string
    captionAlpha: number[]
  }[],
  audio: [] as Float32Array[],
  audioRight: [] as Float32Array[],
  canEncodeVideo: vi.fn(async () => true),
  audioCodec: vi.fn(async () => 'aac' as string | null),
  failCanvasSample: false,
}))

vi.mock('mediabunny', () => {
  class MockAudioBuffer {
    readonly length: number
    readonly sampleRate: number
    readonly numberOfChannels: number
    private readonly channels: Float32Array[]

    constructor(options: {
      length: number
      sampleRate: number
      numberOfChannels: number
    }) {
      this.length = options.length
      this.sampleRate = options.sampleRate
      this.numberOfChannels = options.numberOfChannels
      this.channels = Array.from(
        { length: options.numberOfChannels },
        () => new Float32Array(options.length)
      )
    }

    get duration() {
      return this.length / this.sampleRate
    }

    getChannelData(index: number) {
      return this.channels[index]
    }
  }

  vi.stubGlobal('AudioBuffer', MockAudioBuffer)

  return {
    ALL_FORMATS: [],
    BlobSource: class {
      constructor(readonly blob: Blob) {}
    },
    Input: class {
      private readonly fixture: Fixture | undefined

      constructor(options: { source: { blob: Blob } }) {
        this.fixture = media.fixtures.get(options.source.blob)
      }

      async getPrimaryVideoTrack() {
        if (!this.fixture) return null
        const fixture = this.fixture
        return {
          fixture,
          canDecode: async () => true,
          getFirstTimestamp: async () => fixture.start,
          computeDuration: async () => fixture.start + fixture.duration,
          getDisplayWidth: async () => fixture.width,
          getDisplayHeight: async () => fixture.height,
        }
      }

      async getAudioTracks() {
        return this.fixture?.audioSamples ? [{}] : []
      }

      async getPrimaryAudioTrack() {
        if (!this.fixture?.audioSamples) return null
        return {
          fixture: this.fixture,
          canDecode: async () => this.fixture?.audioCanDecode !== false,
          getFirstTimestamp: async () =>
            this.fixture?.audioStart ?? this.fixture?.start ?? 0,
        }
      }

      dispose() {}
    },
    VideoSampleSink: class {
      constructor(private readonly track: { fixture: Fixture }) {}

      async *samples() {
        for (const timestamp of this.track.fixture.videoTimestamps) {
          const sample = {
            timestamp,
            duration: 0.001,
            setTimestamp(value: number) {
              this.timestamp = value
            },
            setDuration(value: number) {
              this.duration = value
            },
            drawWithFit(context: { drawAlpha?: number; globalAlpha: number }) {
              context.drawAlpha = context.globalAlpha
            },
            close() {},
          }
          yield sample
        }
      }
    },
    AudioBufferSink: class {
      constructor(private readonly track: { fixture: Fixture }) {}

      async *buffers() {
        const samples = this.track.fixture.audioSamples
        if (!samples) return
        const buffer = new MockAudioBuffer({
          length: samples.length,
          sampleRate: 48_000,
          numberOfChannels: 1,
        })
        buffer.getChannelData(0).set(samples)
        yield {
          timestamp: this.track.fixture.audioStart ?? this.track.fixture.start,
          buffer,
        }
      }
    },
    canEncodeVideo: media.canEncodeVideo,
    getFirstEncodableAudioCodec: media.audioCodec,
    BufferTarget: class {
      buffer?: ArrayBuffer
    },
    Mp4OutputFormat: class {},
    Output: class {
      constructor(
        private readonly options: { target: { buffer?: ArrayBuffer } }
      ) {}
      addVideoTrack() {}
      addAudioTrack() {}
      async start() {}
      async finalize() {
        this.options.target.buffer = new Uint8Array([1, 2, 3]).buffer
      }
      async cancel() {}
    },
    VideoSampleSource: class {
      async add(
        sample: {
          timestamp: number
          duration: number
          fadeGain?: number
          composited?: boolean
          captionText?: string
          captionAlpha?: number[]
        },
        options: { keyFrame: boolean }
      ) {
        media.video.push({
          timestamp: sample.timestamp,
          duration: sample.duration,
          keyFrame: options.keyFrame,
          fadeGain: sample.fadeGain ?? 1,
          composited: sample.composited ?? false,
          captionText: sample.captionText ?? '',
          captionAlpha: sample.captionAlpha ?? [],
        })
      }
      close() {}
    },
    VideoSample: class {
      readonly timestamp: number
      readonly duration: number
      readonly fadeGain: number
      readonly composited = true
      readonly captionText: string
      readonly captionAlpha: number[]

      constructor(
        canvas: {
          context: {
            drawAlpha?: number
            drawnText?: string[]
            textAlphas?: number[]
          }
        },
        init: { timestamp: number; duration: number }
      ) {
        if (media.failCanvasSample) {
          throw new Error('canvas cannot create a video frame')
        }
        this.timestamp = init.timestamp
        this.duration = init.duration
        this.fadeGain = canvas.context.drawAlpha ?? 1
        this.captionText = canvas.context.drawnText?.join('\n') ?? ''
        this.captionAlpha = [...(canvas.context.textAlphas ?? [])]
      }

      close() {}
    },
    AudioBufferSource: class {
      async add(buffer: MockAudioBuffer) {
        media.audio.push(new Float32Array(buffer.getChannelData(0)))
        media.audioRight.push(new Float32Array(buffer.getChannelData(1)))
      }
      close() {}
    },
  }
})

beforeEach(() => {
  media.fixtures.clear()
  media.video.length = 0
  media.audio.length = 0
  media.audioRight.length = 0
  media.failCanvasSample = false
  vi.stubGlobal('OffscreenCanvas', undefined)
  media.canEncodeVideo.mockReset().mockResolvedValue(true)
  media.audioCodec.mockReset().mockResolvedValue('aac')
})

function clip(options: Partial<Fixture> = {}): Blob {
  const blob = new Blob(['video'], { type: 'video/mp4' })
  media.fixtures.set(blob, {
    start: 0,
    duration: 0.004,
    width: 1280,
    height: 720,
    videoTimestamps: [0, 0.001, 0.002, 0.003],
    ...options,
  })
  return blob
}

class FakeCanvas {
  readonly context = {
    globalAlpha: 1,
    fillStyle: '',
    drawAlpha: undefined as number | undefined,
    fillRect: () => undefined,
    clearRect: () => {
      this.context.drawnText = []
      this.context.textAlphas = []
      this.context.drawAlpha = undefined
    },
    drawnText: [] as string[],
    textAlphas: [] as number[],
    measureText: (text: string) => ({ width: text.length * 10 }),
    fillText: (text: string) => {
      this.context.drawnText.push(text)
      this.context.textAlphas.push(this.context.globalAlpha)
    },
  }

  constructor(
    readonly width: number,
    readonly height: number
  ) {}

  getContext(kind: string) {
    return kind === '2d' ? this.context : null
  }
}

test('timed captions burn into frames on the assembled timeline across trimmed clips', async () => {
  vi.stubGlobal('OffscreenCanvas', FakeCanvas)
  const first = clip()
  const second = clip()

  await stitchStudioVideos(
    [
      { blob: first, trimStart: 0.001, trimEnd: 0.003 },
      { blob: second, trimStart: 0.001, trimEnd: 0.003 },
    ],
    undefined,
    undefined,
    { captions: '1\n00:00:00,001 --> 00:00:00,003\nHello' }
  )

  expect(media.video.map((frame) => frame.captionText)).toEqual([
    '',
    'Hello',
    'Hello',
    '',
  ])
  expect(media.video.map((frame) => frame.composited)).toEqual([
    false,
    true,
    true,
    false,
  ])
})

test('caption text stays fully opaque over a faded video frame', async () => {
  vi.stubGlobal('OffscreenCanvas', FakeCanvas)

  await stitchStudioVideos(
    [{ blob: clip(), fadeOutSeconds: 0.002 }],
    undefined,
    undefined,
    { captions: '00:00:00,003 --> 00:00:00,004\nEnd' }
  )

  expect(media.video[3]).toMatchObject({
    fadeGain: 0.5,
    captionText: 'End',
    captionAlpha: [1],
  })
})

test('caption preflight rejects malformed cues before export', async () => {
  await expect(
    preflightStudioVideos([clip()], undefined, {
      captions: '00:02.000 --> 00:01.000\nBackwards',
    })
  ).rejects.toThrow('caption cue 1')
})

test('caption preflight rejects missing canvas support', async () => {
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return null
      }
    }
  )

  await expect(
    preflightStudioVideos([clip()], undefined, {
      captions: '00:00.000 --> 00:00.004\nHello',
    })
  ).rejects.toThrow('2D canvas')
})

test('MP4 assembly refuses an empty or invalid clip before producing an output', async () => {
  await expect(stitchStudioVideos([])).rejects.toThrow('at least one video')
  await expect(
    stitchStudioVideos([new Blob(['not a video'], { type: 'video/mp4' })])
  ).rejects.toThrow()
})

test('a canceled MP4 export stops before opening a video decoder', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(
    stitchStudioVideos([new Blob(['clip'])], undefined, controller.signal)
  ).rejects.toMatchObject({ name: 'AbortError' })
})

test('preflight reports trimmed duration, input bytes, and supported output codecs', async () => {
  const first = clip({
    audioSamples: Float32Array.from({ length: 192 }, (_, i) => i),
  })
  const second = clip()

  const result = await preflightStudioVideos([
    { blob: first, trimStart: 0.001, trimEnd: 0.003 },
    second,
  ])

  expect(result).toMatchObject({
    totalBytes: first.size + second.size,
    totalDuration: 0.006,
    width: 1280,
    height: 720,
    videoCodec: 'avc',
    audioCodec: 'aac',
  })
})

test('preflight rejects a trim with no playable interval', async () => {
  const source = clip()
  await expect(
    preflightStudioVideos([{ blob: source, trimStart: 0.003, trimEnd: 0.003 }])
  ).rejects.toThrow('invalid trim')
})

test.each([
  { trimStart: -0.001, trimEnd: 0.003 },
  { trimStart: Number.NaN, trimEnd: 0.003 },
  { trimStart: 0, trimEnd: Number.POSITIVE_INFINITY },
  { trimStart: 0, trimEnd: 0.005 },
])('preflight rejects out-of-range trim offsets %o', async (trim) => {
  await expect(
    preflightStudioVideos([{ blob: clip(), ...trim }])
  ).rejects.toThrow('invalid trim')
})

test('preflight rejects an audio track the browser cannot decode', async () => {
  const source = clip({
    audioSamples: new Float32Array(192),
    audioCanDecode: false,
  })
  await expect(preflightStudioVideos([source])).rejects.toThrow(
    'audio codec this browser cannot decode'
  )
})

test('preflight rejects an oversized input before opening its decoder', async () => {
  const source = clip()
  Object.defineProperty(source, 'size', { value: 512 * 1024 * 1024 + 1 })
  await expect(preflightStudioVideos([source])).rejects.toThrow(
    '512 MiB browser export limit'
  )
})

test('preflight rejects an unsupported browser video encoder before export', async () => {
  media.canEncodeVideo.mockResolvedValue(false)
  await expect(preflightStudioVideos([clip()])).rejects.toThrow(
    'cannot encode H.264 MP4'
  )
})

test('trimmed clips keep audio and video aligned at their shared boundary', async () => {
  const samples = Float32Array.from({ length: 192 }, (_, index) => index / 192)
  const first = clip({ audioSamples: samples })
  const second = clip()

  await stitchStudioVideos([
    { blob: first, trimStart: 0.001, trimEnd: 0.003 },
    { blob: second, trimStart: 0.001, trimEnd: 0.003 },
  ])

  expect(media.video.map((frame) => frame.timestamp)).toEqual([
    0, 0.001, 0.002, 0.003,
  ])
  expect(media.video.map((frame) => frame.keyFrame)).toEqual([
    true,
    false,
    true,
    false,
  ])
  expect(media.audio).toHaveLength(2)
  expect(media.audio[0][0]).toBe(0.25)
  expect(media.audio[0][95]).toBeCloseTo(143 / 192)
  expect(media.audio[1].every((sample) => sample === 0)).toBe(true)
})

test('a trim crossing a source frame starts video and audio at the cut point', async () => {
  const samples = Float32Array.from({ length: 192 }, (_, index) => index / 192)
  await stitchStudioVideos([
    {
      blob: clip({ audioSamples: samples }),
      trimStart: 0.0015,
      trimEnd: 0.0035,
    },
  ])

  expect(
    media.video.map(({ timestamp, duration }) => [timestamp, duration])
  ).toEqual([
    [0, 0.0005],
    [0.0005, 0.001],
    [0.0015, 0.0005],
  ])
  expect(media.audio[0][0]).toBe(0.375)
  expect(media.audio[0][95]).toBeCloseTo(167 / 192)
})

test('soundtrack preflight counts source bytes and enables audio output for silent clips', async () => {
  const video = clip()
  const soundtrack = clip({ audioSamples: new Float32Array(192) })

  const result = await preflightStudioVideos([video], undefined, {
    soundtrack: { blob: soundtrack, volume: 0.5 },
  })

  expect(result.totalBytes).toBe(video.size + soundtrack.size)
  expect(result.totalDuration).toBe(0.004)
  expect(result.audioCodec).toBe('aac')
})

test('voiceover preflight counts bytes and enables audio for a silent video', async () => {
  const video = clip()
  const voiceover = clip({ audioSamples: new Float32Array(192) })

  const result = await preflightStudioVideos([video], undefined, {
    voiceover: { blob: voiceover, volume: 0.5 },
  })

  expect(result.totalBytes).toBe(video.size + voiceover.size)
  expect(result.audioCodec).toBe('aac')
})

test('voiceover preflight rejects missing or undecodable audio', async () => {
  await expect(
    preflightStudioVideos([clip()], undefined, {
      voiceover: { blob: clip(), volume: 1 },
    })
  ).rejects.toThrow('voiceover has no audio track')

  await expect(
    preflightStudioVideos([clip()], undefined, {
      voiceover: {
        blob: clip({
          audioSamples: new Float32Array(192),
          audioCanDecode: false,
        }),
        volume: 1,
      },
    })
  ).rejects.toThrow('voiceover uses an audio codec this browser cannot decode')
})

test.each([-0.1, Number.NaN, Number.POSITIVE_INFINITY, 1.1])(
  'voiceover preflight rejects invalid volume %s',
  async (volume) => {
    await expect(
      preflightStudioVideos([clip()], undefined, {
        voiceover: {
          blob: clip({ audioSamples: new Float32Array(192) }),
          volume,
        },
      })
    ).rejects.toThrow('voiceover has an invalid volume')
  }
)

test('soundtrack preflight rejects files without a decodable audio track', async () => {
  await expect(
    preflightStudioVideos([clip()], undefined, {
      soundtrack: { blob: clip() },
    })
  ).rejects.toThrow('soundtrack has no audio track')

  await expect(
    preflightStudioVideos([clip()], undefined, {
      soundtrack: {
        blob: clip({
          audioSamples: new Float32Array(192),
          audioCanDecode: false,
        }),
      },
    })
  ).rejects.toThrow('soundtrack uses an audio codec this browser cannot decode')
})

test.each([-0.1, Number.NaN, Number.POSITIVE_INFINITY, 1.1])(
  'preflight rejects a clip volume outside 0..1: %s',
  async (volume) => {
    await expect(
      preflightStudioVideos([{ blob: clip(), volume }])
    ).rejects.toThrow('invalid volume')
  }
)

test('preflight rejects a soundtrack volume outside 0..1', async () => {
  await expect(
    preflightStudioVideos([clip()], undefined, {
      soundtrack: {
        blob: clip({ audioSamples: new Float32Array(192) }),
        volume: 1.1,
      },
    })
  ).rejects.toThrow('soundtrack has an invalid volume')
})

test('preflight rejects an invalid stored volume even when the clip is muted', async () => {
  await expect(
    preflightStudioVideos([{ blob: clip(), muted: true, volume: Number.NaN }])
  ).rejects.toThrow('invalid volume')
})

test('muting a clip bypasses its undecodable audio while preserving video', async () => {
  const video = clip({
    audioSamples: new Float32Array(192),
    audioCanDecode: false,
  })
  const soundtrack = clip({ audioSamples: new Float32Array(192).fill(0.25) })

  await stitchStudioVideos(
    [{ blob: video, muted: true }],
    undefined,
    undefined,
    {
      soundtrack: { blob: soundtrack },
    }
  )

  expect(media.video).toHaveLength(4)
  expect(media.audio[0][0]).toBe(0.25)
})

test('soundtrack mixes at volume with clip audio and ends without looping', async () => {
  const first = clip({ audioSamples: new Float32Array(192).fill(0.5) })
  const second = clip({ audioSamples: new Float32Array(192).fill(0.75) })
  const soundtrack = clip({
    audioSamples: new Float32Array(288).fill(0.25),
    audioStart: 5,
  })

  await stitchStudioVideos(
    [
      { blob: first, volume: 0.5 },
      { blob: second, muted: true },
    ],
    undefined,
    undefined,
    { soundtrack: { blob: soundtrack, volume: 0.5 } }
  )

  expect(media.audio).toHaveLength(2)
  expect(media.audio[0][0]).toBe(0.375)
  expect(media.audio[1][0]).toBe(0.125)
  expect(media.audio[1][95]).toBe(0.125)
  expect(media.audio[1][96]).toBe(0)
  expect(media.audioRight[0][0]).toBe(0.375)
})

test('voiceover mixes with soundtrack and clip audio, then stops at its own end', async () => {
  const first = clip({ audioSamples: new Float32Array(192).fill(0.25) })
  const second = clip()
  const soundtrack = clip({
    audioSamples: new Float32Array(384).fill(0.25),
    audioStart: 4,
  })
  const voiceover = clip({
    audioSamples: new Float32Array(288).fill(0.5),
    audioStart: 9,
  })

  await stitchStudioVideos([first, second], undefined, undefined, {
    soundtrack: { blob: soundtrack, volume: 0.5 },
    voiceover: { blob: voiceover, volume: 0.5 },
  })

  expect(media.audio).toHaveLength(2)
  expect(media.audio[0][0]).toBe(0.625)
  expect(media.audio[1][0]).toBe(0.375)
  expect(media.audio[1][95]).toBe(0.375)
  expect(media.audio[1][96]).toBe(0.125)
  expect(media.audioRight[0][0]).toBe(0.625)
})

test('soundtrack follows the trimmed video timeline across clip boundaries', async () => {
  const first = clip()
  const second = clip()
  const soundtrack = clip({
    audioSamples: Float32Array.from({ length: 192 }, (_, index) => index / 192),
  })

  await stitchStudioVideos(
    [
      { blob: first, trimStart: 0.001, trimEnd: 0.003 },
      { blob: second, trimStart: 0.001, trimEnd: 0.003 },
    ],
    undefined,
    undefined,
    { soundtrack: { blob: soundtrack } }
  )

  expect(media.audio).toHaveLength(2)
  expect(media.audio[0][0]).toBe(0)
  expect(media.audio[0][95]).toBeCloseTo(95 / 192)
  expect(media.audio[1][0]).toBe(0.5)
  expect(media.audio[1][95]).toBeCloseTo(191 / 192)
})

test('mixed soundtrack and clip audio are clamped to the PCM range', async () => {
  const video = clip({ audioSamples: new Float32Array(192).fill(0.75) })
  const soundtrack = clip({ audioSamples: new Float32Array(192).fill(0.75) })

  await stitchStudioVideos([video], undefined, undefined, {
    soundtrack: { blob: soundtrack },
  })

  expect(media.audio[0][0]).toBe(1)
  expect(media.audioRight[0][0]).toBe(1)
})

test('preflight rejects a fade longer than its trimmed clip', async () => {
  vi.stubGlobal('OffscreenCanvas', FakeCanvas)
  await expect(
    preflightStudioVideos([
      { blob: clip(), trimStart: 0.001, trimEnd: 0.003, fadeOutSeconds: 0.003 },
    ])
  ).rejects.toThrow('fade exceeds')
})

test('preflight rejects overlapping fade windows within a short clip', async () => {
  vi.stubGlobal('OffscreenCanvas', FakeCanvas)
  await expect(
    preflightStudioVideos([
      { blob: clip(), fadeInSeconds: 0.003, fadeOutSeconds: 0.003 },
    ])
  ).rejects.toThrow('fade windows exceed')
})

test.each([0, -0.2, Number.NaN, Number.POSITIVE_INFINITY, 3.1])(
  'preflight rejects invalid fade duration %s',
  async (fadeOutSeconds) => {
    await expect(
      preflightStudioVideos([{ blob: clip(), fadeOutSeconds }])
    ).rejects.toThrow('invalid fade')
  }
)

test('preflight rejects a fade when no 2D canvas is available', async () => {
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return null
      }
    }
  )
  await expect(
    preflightStudioVideos([{ blob: clip(), fadeInSeconds: 0.002 }])
  ).rejects.toThrow('2D canvas')
})

test('preflight reports canvas initialization failures as unsupported fades', async () => {
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        throw new Error('GPU context unavailable')
      }
    }
  )
  await expect(
    preflightStudioVideos([{ blob: clip(), fadeInSeconds: 0.002 }])
  ).rejects.toThrow('2D canvas')
})

test('preflight rejects a canvas that cannot create video samples', async () => {
  vi.stubGlobal('OffscreenCanvas', FakeCanvas)
  media.failCanvasSample = true

  await expect(
    preflightStudioVideos([{ blob: clip(), fadeInSeconds: 0.002 }])
  ).rejects.toThrow('canvas video frames')
})

test('fade frames darken around the cut while ordinary frames bypass canvas', async () => {
  vi.stubGlobal('OffscreenCanvas', FakeCanvas)
  const first = clip()
  const second = clip()

  await stitchStudioVideos([
    { blob: first, fadeOutSeconds: 0.002 },
    { blob: second, fadeInSeconds: 0.002 },
  ])

  expect(media.video.map((frame) => frame.fadeGain)).toEqual([
    1, 1, 1, 0.5, 0, 0.5, 1, 1,
  ])
  expect(media.video.map((frame) => frame.composited)).toEqual([
    false,
    false,
    false,
    true,
    true,
    true,
    false,
    false,
  ])
  expect(media.video.map((frame) => frame.timestamp)).toEqual([
    0, 0.001, 0.002, 0.003, 0.004, 0.005, 0.006, 0.007,
  ])
})

test('clip audio fades while soundtrack continues at constant volume', async () => {
  vi.stubGlobal('OffscreenCanvas', FakeCanvas)
  const first = clip({ audioSamples: new Float32Array(192).fill(0.5) })
  const second = clip({ audioSamples: new Float32Array(192).fill(0.5) })
  const soundtrack = clip({ audioSamples: new Float32Array(384).fill(0.25) })

  await stitchStudioVideos(
    [
      { blob: first, fadeOutSeconds: 0.002 },
      { blob: second, fadeInSeconds: 0.002 },
    ],
    undefined,
    undefined,
    { soundtrack: { blob: soundtrack } }
  )

  expect(media.audio[0][96]).toBe(0.75)
  expect(media.audio[0][191]).toBeCloseTo(0.25 + 0.5 / 96)
  expect(media.audio[1][0]).toBe(0.25)
  expect(media.audio[1][48]).toBe(0.5)
  expect(media.audio[1][96]).toBe(0.75)
})
