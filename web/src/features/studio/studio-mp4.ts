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
import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  canEncodeVideo,
  getFirstEncodableAudioCodec,
  Input,
  Mp4OutputFormat,
  Output,
  VideoSample,
  VideoSampleSink,
  VideoSampleSource,
  type WrappedAudioBuffer,
} from 'mediabunny'

import { parseStudioCaptions, type StudioCaptionCue } from './studio-captions'

export type StudioMp4Progress = {
  phase: 'probing' | 'audio' | 'video' | 'finalizing'
  percent: number
  clipIndex?: number
}

/** Trim offsets are seconds measured from the first video frame of each file. */
export type StudioMp4Clip =
  | Blob
  | {
      blob: Blob
      trimStart?: number
      trimEnd?: number
      muted?: boolean
      volume?: number
      fadeInSeconds?: number
      fadeOutSeconds?: number
    }

export type StudioMp4Options = {
  soundtrack?: { blob: Blob; volume?: number }
  soundtrackOffsetSeconds?: number
  voiceover?: { blob: Blob; volume: number }
  voiceoverOffsetSeconds?: number
  /** SRT or WebVTT text timed against the final assembled video. */
  captions?: string
  captionOffsetSeconds?: number
}

export type StudioMp4Preflight = {
  clipCount: number
  totalBytes: number
  totalDuration: number
  estimatedOutputBytes: number
  width: number
  height: number
  videoCodec: 'avc'
  audioCodec: Awaited<ReturnType<typeof getFirstEncodableAudioCodec>>
}

const MAX_INPUT_BYTES = 512 * 1024 * 1024
const MAX_OUTPUT_BYTES = 512 * 1024 * 1024
const MAX_TOTAL_DURATION = 3600

type ProbedClip = {
  blob: Blob
  duration: number
  start: number
  width: number
  height: number
  hasAudio: boolean
  volume: number
  fadeInSeconds: number
  fadeOutSeconds: number
}

type VideoCanvas = {
  canvas: OffscreenCanvas | HTMLCanvasElement
  context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
}

type ExternalAudioTrack = {
  label: 'soundtrack' | 'voiceover'
  blob: Blob
  volume: number
  offsetSeconds: number
}

function ensureNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Export canceled', 'AbortError')
}

function openClip(blob: Blob): Input {
  return new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
}

async function probeClip(
  source: StudioMp4Clip,
  index: number
): Promise<ProbedClip> {
  const blob = 'blob' in source ? source.blob : source
  const trimStart = 'blob' in source ? (source.trimStart ?? 0) : 0
  const requestedEnd = 'blob' in source ? source.trimEnd : undefined
  const fadeInSeconds = 'blob' in source ? (source.fadeInSeconds ?? 0) : 0
  const fadeOutSeconds = 'blob' in source ? (source.fadeOutSeconds ?? 0) : 0
  for (const seconds of [fadeInSeconds, fadeOutSeconds]) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 3) {
      throw new Error(`Clip ${index + 1} has an invalid fade duration`)
    }
  }
  if (
    ('blob' in source && source.fadeInSeconds === 0) ||
    ('blob' in source && source.fadeOutSeconds === 0)
  ) {
    throw new Error(`Clip ${index + 1} has an invalid fade duration`)
  }
  const requestedVolume = 'blob' in source ? (source.volume ?? 1) : 1
  if (
    !Number.isFinite(requestedVolume) ||
    requestedVolume < 0 ||
    requestedVolume > 1
  ) {
    throw new Error(`Clip ${index + 1} has an invalid volume`)
  }
  const volume = 'blob' in source && source.muted ? 0 : requestedVolume
  const input = openClip(blob)
  try {
    const video = await input.getPrimaryVideoTrack()
    if (!video) throw new Error(`Clip ${index + 1} has no video track`)
    if (!(await video.canDecode())) {
      throw new Error(
        `Clip ${index + 1} uses a video codec this browser cannot decode`
      )
    }
    const [start, end, width, height, audio] = await Promise.all([
      video.getFirstTimestamp(),
      video.computeDuration(),
      video.getDisplayWidth(),
      video.getDisplayHeight(),
      input.getPrimaryAudioTrack(),
    ])
    if (audio && volume > 0 && !(await audio.canDecode())) {
      throw new Error(
        `Clip ${index + 1} uses an audio codec this browser cannot decode`
      )
    }
    const sourceDuration = end - start
    if (
      !Number.isFinite(sourceDuration) ||
      sourceDuration <= 0 ||
      sourceDuration > 3600
    ) {
      throw new Error(`Clip ${index + 1} has an invalid duration`)
    }
    const trimEnd = requestedEnd ?? sourceDuration
    if (
      !Number.isFinite(trimStart) ||
      !Number.isFinite(trimEnd) ||
      trimStart < 0 ||
      trimEnd > sourceDuration ||
      trimEnd <= trimStart
    ) {
      throw new Error(`Clip ${index + 1} has an invalid trim`)
    }
    const duration = trimEnd - trimStart
    if (
      fadeInSeconds > duration + 0.000001 ||
      fadeOutSeconds > duration + 0.000001
    ) {
      throw new Error(`Clip ${index + 1} fade exceeds its trimmed duration`)
    }
    if (fadeInSeconds + fadeOutSeconds > duration + 0.000001) {
      throw new Error(`Clip ${index + 1} fade windows exceed its duration`)
    }
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 2 ||
      height < 2
    ) {
      throw new Error(`Clip ${index + 1} has invalid dimensions`)
    }
    return {
      blob,
      duration,
      start: start + trimStart,
      width,
      height,
      hasAudio: Boolean(audio && volume > 0),
      volume,
      fadeInSeconds,
      fadeOutSeconds,
    }
  } finally {
    input.dispose()
  }
}

async function inspectStudioVideos(
  inputs: StudioMp4Clip[],
  signal?: AbortSignal,
  onProgress?: (progress: StudioMp4Progress) => void,
  options?: StudioMp4Options
): Promise<{
  clips: ProbedClip[]
  bitrate: number
  preflight: StudioMp4Preflight
  videoCanvas: VideoCanvas | null
  captions: StudioCaptionCue[]
  externalAudio: ExternalAudioTrack[]
}> {
  if (!inputs.length) throw new Error('at least one video is required')
  ensureNotAborted(signal)
  for (const [label, offset] of [
    ['soundtrack', options?.soundtrackOffsetSeconds ?? 0],
    ['voiceover', options?.voiceoverOffsetSeconds ?? 0],
    ['caption', options?.captionOffsetSeconds ?? 0],
  ] as const) {
    if (!Number.isFinite(offset) || offset < 0 || offset > MAX_TOTAL_DURATION) {
      throw new Error(`${label} offset must be between 0 and 3600 seconds`)
    }
  }
  const captions = parseStudioCaptions(options?.captions ?? '').map((cue) => ({
    ...cue,
    start: cue.start + (options?.captionOffsetSeconds ?? 0),
    end: cue.end + (options?.captionOffsetSeconds ?? 0),
  }))
  const soundtrack = options?.soundtrack
  const voiceover = options?.voiceover
  const externalAudio: ExternalAudioTrack[] = []
  if (soundtrack) {
    externalAudio.push({
      label: 'soundtrack',
      blob: soundtrack.blob,
      volume: soundtrack.volume ?? 1,
      offsetSeconds: options?.soundtrackOffsetSeconds ?? 0,
    })
  }
  if (voiceover) {
    externalAudio.push({
      label: 'voiceover',
      blob: voiceover.blob,
      volume: voiceover.volume,
      offsetSeconds: options?.voiceoverOffsetSeconds ?? 0,
    })
  }
  for (const track of externalAudio) {
    if (
      !Number.isFinite(track.volume) ||
      track.volume < 0 ||
      track.volume > 1
    ) {
      throw new Error(`${track.label} has an invalid volume`)
    }
  }
  const totalBytes = inputs.reduce(
    (sum, item) => sum + ('blob' in item ? item.blob.size : item.size),
    externalAudio.reduce((sum, track) => sum + track.blob.size, 0)
  )
  if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_INPUT_BYTES) {
    throw new Error('MP4 input exceeds the 512 MiB browser export limit')
  }

  const clips: ProbedClip[] = []
  let totalDuration = 0
  for (const [index, input] of inputs.entries()) {
    ensureNotAborted(signal)
    onProgress?.({
      phase: 'probing',
      percent: Math.round((index / inputs.length) * 10),
      clipIndex: index + 1,
    })
    const clip = await probeClip(input, index)
    clips.push(clip)
    totalDuration += clip.duration
    if (totalDuration > MAX_TOTAL_DURATION) {
      throw new Error('MP4 duration exceeds the one-hour browser export limit')
    }
  }

  for (const external of externalAudio) {
    const input = openClip(external.blob)
    try {
      const audio = await input.getPrimaryAudioTrack()
      if (!audio) throw new Error(`${external.label} has no audio track`)
      if (external.volume > 0 && !(await audio.canDecode())) {
        throw new Error(
          `${external.label} uses an audio codec this browser cannot decode`
        )
      }
      const start = await audio.getFirstTimestamp()
      if (!Number.isFinite(start)) {
        throw new Error(`${external.label} has an invalid audio timestamp`)
      }
    } finally {
      input.dispose()
    }
  }

  const { width, height } = outputDimensions(clips[0])
  const videoCanvas =
    captions.length > 0 ||
    clips.some((clip) => clip.fadeInSeconds > 0 || clip.fadeOutSeconds > 0)
      ? createVideoCanvas(width, height)
      : null
  if (videoCanvas) {
    try {
      new VideoSample(videoCanvas.canvas, {
        timestamp: 0,
        duration: 0.001,
      }).close()
    } catch {
      throw new Error(
        'this browser cannot create canvas video frames for fades or captions'
      )
    }
  }
  const bitrate = Math.min(8_000_000, Math.max(2_000_000, width * height * 3))
  if (!(await canEncodeVideo('avc', { width, height, bitrate }))) {
    throw new Error(
      `this browser cannot encode H.264 MP4 at ${width}×${height}`
    )
  }
  const hasAudio =
    clips.some((clip) => clip.hasAudio) ||
    externalAudio.some((track) => track.volume > 0)
  const audioCodec = hasAudio
    ? await getFirstEncodableAudioCodec(['aac', 'mp3'], {
        numberOfChannels: 2,
        sampleRate: 48_000,
        bitrate: 128_000,
      })
    : null
  if (hasAudio && !audioCodec) {
    throw new Error('this browser cannot encode the MP4 audio track')
  }
  ensureNotAborted(signal)
  const estimatedOutputBytes = Math.ceil(
    (totalDuration * (bitrate + (audioCodec ? 128_000 : 0))) / 8
  )
  if (estimatedOutputBytes > MAX_OUTPUT_BYTES) {
    throw new Error(
      'Estimated MP4 output exceeds the 512 MiB browser export limit'
    )
  }

  return {
    clips,
    bitrate,
    videoCanvas,
    captions,
    externalAudio,
    preflight: {
      clipCount: clips.length,
      totalBytes,
      totalDuration,
      estimatedOutputBytes,
      width,
      height,
      videoCodec: 'avc',
      audioCodec,
    },
  }
}

function createVideoCanvas(width: number, height: number): VideoCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    try {
      const context = canvas.getContext('2d')
      if (context) return { canvas, context }
    } catch {
      // A browser without a working canvas cannot render fade frames.
    }
  } else if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    try {
      const context = canvas.getContext('2d')
      if (context) return { canvas, context }
    } catch {
      // A browser without a working canvas cannot render fade frames.
    }
  }
  throw new Error(
    'this browser cannot render fades or captions with a 2D canvas'
  )
}

function drawCaptionText(
  context: VideoCanvas['context'],
  width: number,
  height: number,
  text: string
): void {
  const fontSize = Math.max(16, Math.round(height * 0.043))
  const lineHeight = Math.round(fontSize * 1.25)
  const padding = Math.round(fontSize * 0.4)
  const maxWidth = width * 0.88
  context.font = `600 ${fontSize}px sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  const lines: string[] = []
  for (const rawLine of text.split('\n')) {
    let line = ''
    for (const character of rawLine) {
      const next = line + character
      if (line && context.measureText(next).width > maxWidth) {
        lines.push(line.trimEnd())
        line = character.trimStart()
      } else {
        line = next
      }
    }
    lines.push(line)
  }

  const boxHeight = lines.length * lineHeight + padding * 2
  const top = Math.max(0, height - Math.round(height * 0.05) - boxHeight)
  context.globalAlpha = 0.7
  context.fillStyle = 'black'
  context.fillRect(
    Math.round((width - maxWidth) / 2) - padding,
    top,
    Math.round(maxWidth) + padding * 2,
    boxHeight
  )
  context.globalAlpha = 1
  context.fillStyle = 'white'
  for (const [index, line] of lines.entries()) {
    context.fillText(
      line,
      width / 2,
      top + padding + lineHeight * (index + 0.5)
    )
  }
}

function clipFadeGain(clip: ProbedClip, seconds: number): number {
  let gain = 1
  if (clip.fadeInSeconds > 0) {
    gain = Math.min(gain, seconds / clip.fadeInSeconds)
  }
  if (clip.fadeOutSeconds > 0) {
    gain = Math.min(gain, (clip.duration - seconds) / clip.fadeOutSeconds)
  }
  return Math.max(0, Math.min(1, gain))
}

/** Checks media, trim ranges, resource totals, and browser codecs before export. */
export async function preflightStudioVideos(
  inputs: StudioMp4Clip[],
  signal?: AbortSignal,
  options?: StudioMp4Options
): Promise<StudioMp4Preflight> {
  return (await inspectStudioVideos(inputs, signal, undefined, options))
    .preflight
}

function mixDecodedAudio(
  target: AudioBuffer,
  source: AudioBuffer,
  sourceStartSample: number,
  targetStartSample: number,
  volume: number,
  clip?: ProbedClip
): void {
  const rate = 48_000
  const start = Math.max(targetStartSample, sourceStartSample)
  const end = Math.min(
    targetStartSample + target.length,
    sourceStartSample + Math.ceil(source.duration * rate)
  )
  if (volume === 0 || end <= start) return

  const inputChannels = [
    source.getChannelData(0),
    source.getChannelData(Math.min(1, source.numberOfChannels - 1)),
  ]
  const outputChannels = [target.getChannelData(0), target.getChannelData(1)]
  for (let sampleIndex = start; sampleIndex < end; sampleIndex++) {
    const gain = volume * (clip ? clipFadeGain(clip, sampleIndex / rate) : 1)
    const inputPosition =
      ((sampleIndex - sourceStartSample) * source.sampleRate) / rate
    const left = Math.floor(inputPosition)
    if (left < 0 || left >= source.length) continue
    const right = Math.min(source.length - 1, left + 1)
    const fraction = inputPosition - left
    for (let channel = 0; channel < 2; channel++) {
      const samples = inputChannels[channel]
      outputChannels[channel][sampleIndex - targetStartSample] +=
        (samples[left] * (1 - fraction) + samples[right] * fraction) * gain
    }
  }
}

function outputDimensions(first: ProbedClip): {
  width: number
  height: number
} {
  const scale = Math.min(1, 1920 / first.width, 1920 / first.height)
  return {
    width: Math.max(2, Math.floor((first.width * scale) / 2) * 2),
    height: Math.max(2, Math.floor((first.height * scale) / 2) * 2),
  }
}

async function writeAudio(
  clips: ProbedClip[],
  source: AudioBufferSource,
  signal: AbortSignal | undefined,
  onProgress: ((progress: StudioMp4Progress) => void) | undefined,
  externalAudio: ExternalAudioTrack[]
): Promise<void> {
  const rate = 48_000
  const externalReaders: {
    input: Input
    buffers: ReturnType<AudioBufferSink['buffers']>
    buffer: WrappedAudioBuffer | null
    start: number
    volume: number
    offsetSamples: number
  }[] = []
  let emittedSamples = 0
  try {
    for (const external of externalAudio) {
      if (external.volume === 0) continue
      const input = openClip(external.blob)
      let buffers: ReturnType<AudioBufferSink['buffers']> | undefined
      try {
        const track = await input.getPrimaryAudioTrack()
        if (!track) throw new Error(`${external.label} has no audio track`)
        const start = await track.getFirstTimestamp()
        buffers = new AudioBufferSink(track).buffers()
        const first = await buffers.next()
        externalReaders.push({
          input,
          buffers,
          buffer: first.done ? null : first.value,
          start,
          volume: external.volume,
          offsetSamples: Math.round(external.offsetSeconds * rate),
        })
      } catch (error) {
        await buffers?.return()
        input.dispose()
        throw error
      }
    }

    for (const [index, clip] of clips.entries()) {
      ensureNotAborted(signal)
      onProgress?.({
        phase: 'audio',
        percent: 10 + Math.round((index / clips.length) * 15),
        clipIndex: index + 1,
      })
      const input = clip.volume > 0 ? openClip(clip.blob) : null
      const totalSamples = Math.max(1, Math.round(clip.duration * rate))
      let chunkStart = 0
      const createChunk = (start: number) =>
        new AudioBuffer({
          length: Math.min(rate * 5, totalSamples - start),
          numberOfChannels: 2,
          sampleRate: rate,
        })
      let chunk: AudioBuffer | null = createChunk(0)
      const flushChunk = async () => {
        const ready = chunk
        if (!ready) return
        const chunkEnd = emittedSamples + ready.length
        for (const reader of externalReaders) {
          while (reader.buffer) {
            ensureNotAborted(signal)
            const start =
              Math.round((reader.buffer.timestamp - reader.start) * rate) +
              reader.offsetSamples
            const end = start + Math.ceil(reader.buffer.buffer.duration * rate)
            if (start >= chunkEnd) break
            if (end > emittedSamples) {
              mixDecodedAudio(
                ready,
                reader.buffer.buffer,
                start,
                emittedSamples,
                reader.volume
              )
            }
            if (end > chunkEnd) break
            const next = await reader.buffers.next()
            reader.buffer = next.done ? null : next.value
          }
        }
        for (let channel = 0; channel < ready.numberOfChannels; channel++) {
          const data = ready.getChannelData(channel)
          for (let sample = 0; sample < data.length; sample++) {
            data[sample] = Math.max(-1, Math.min(1, data[sample]))
          }
        }
        await source.add(ready)
        emittedSamples += ready.length
        chunkStart += ready.length
        chunk = chunkStart < totalSamples ? createChunk(chunkStart) : null
      }
      try {
        const audio = await input?.getPrimaryAudioTrack()
        if (audio) {
          if (!(await audio.canDecode())) {
            throw new Error(
              `Clip ${index + 1} uses an audio codec this browser cannot decode`
            )
          }
          const sink = new AudioBufferSink(audio)
          for await (const { buffer, timestamp } of sink.buffers()) {
            ensureNotAborted(signal)
            const start = Math.round((timestamp - clip.start) * rate)
            const end = Math.min(
              totalSamples,
              start + Math.ceil(buffer.duration * rate)
            )
            let position = Math.max(0, start)
            while (position < end) {
              while (chunk && position >= chunkStart + chunk.length) {
                await flushChunk()
              }
              const active = chunk
              if (!active) break
              const limit = Math.min(end, chunkStart + active.length)
              mixDecodedAudio(
                active,
                buffer,
                start,
                chunkStart,
                clip.volume,
                clip
              )
              position = limit
            }
          }
        }
        while (chunk) {
          ensureNotAborted(signal)
          await flushChunk()
        }
      } finally {
        input?.dispose()
      }
    }
    source.close()
  } finally {
    for (const reader of externalReaders) {
      await reader.buffers.return()
      reader.input.dispose()
    }
  }
}

async function writeVideo(
  clips: ProbedClip[],
  source: VideoSampleSource,
  signal: AbortSignal | undefined,
  onProgress: ((progress: StudioMp4Progress) => void) | undefined,
  videoCanvas: VideoCanvas | null,
  captions: StudioCaptionCue[]
): Promise<void> {
  let timeline = 0
  let lastTimestamp = -1
  let captionIndex = 0
  for (const [index, clip] of clips.entries()) {
    ensureNotAborted(signal)
    onProgress?.({
      phase: 'video',
      percent: 25 + Math.round((index / clips.length) * 70),
      clipIndex: index + 1,
    })
    const input = openClip(clip.blob)
    let frames = 0
    try {
      const track = await input.getPrimaryVideoTrack()
      if (!track) throw new Error(`Clip ${index + 1} has no video track`)
      const sink = new VideoSampleSink(track)
      for await (const sample of sink.samples()) {
        try {
          ensureNotAborted(signal)
          const visibleStart = Math.max(sample.timestamp, clip.start)
          const visibleEnd = Math.min(
            sample.timestamp + sample.duration,
            clip.start + clip.duration
          )
          if (visibleEnd <= visibleStart) {
            if (sample.timestamp >= clip.start + clip.duration) break
            continue
          }
          const timestamp = Math.max(
            timeline + visibleStart - clip.start,
            lastTimestamp + 0.000001
          )
          const duration = timeline + visibleEnd - clip.start - timestamp
          if (duration <= 0) continue
          sample.setTimestamp(timestamp)
          sample.setDuration(duration)
          const gain = clipFadeGain(clip, visibleStart - clip.start)
          const captionTime = Math.round(timestamp * 1_000_000) / 1_000_000
          while (
            captionIndex < captions.length &&
            captions[captionIndex].end <= captionTime
          ) {
            captionIndex++
          }
          const activeCaptions: string[] = []
          for (
            let cueIndex = captionIndex;
            cueIndex < captions.length;
            cueIndex++
          ) {
            const cue = captions[cueIndex]
            if (cue.start > captionTime) break
            if (cue.end > captionTime) activeCaptions.push(cue.text)
          }
          if ((gain < 1 || activeCaptions.length > 0) && videoCanvas) {
            const { canvas, context } = videoCanvas
            context.globalAlpha = 1
            context.clearRect(0, 0, canvas.width, canvas.height)
            context.fillStyle = 'black'
            context.fillRect(0, 0, canvas.width, canvas.height)
            context.globalAlpha = gain
            sample.drawWithFit(context, { fit: 'contain' })
            context.globalAlpha = 1
            if (activeCaptions.length) {
              drawCaptionText(
                context,
                canvas.width,
                canvas.height,
                activeCaptions.join('\n')
              )
            }
            const composited = new VideoSample(canvas, { timestamp, duration })
            try {
              await source.add(composited, { keyFrame: frames === 0 })
            } finally {
              composited.close()
            }
          } else {
            await source.add(sample, { keyFrame: frames === 0 })
          }
          lastTimestamp = timestamp
          frames++
        } finally {
          sample.close()
        }
      }
      if (frames === 0) {
        throw new Error(`Clip ${index + 1} contains no decodable frames`)
      }
    } finally {
      input.dispose()
    }
    timeline += clip.duration
  }
  source.close()
}

/** Browser-local, deterministic composition of ordered clips into one MP4. */
export async function stitchStudioVideos(
  inputs: StudioMp4Clip[],
  onProgress?: (progress: StudioMp4Progress) => void,
  signal?: AbortSignal,
  options?: StudioMp4Options
): Promise<Blob> {
  const { clips, bitrate, preflight, videoCanvas, captions, externalAudio } =
    await inspectStudioVideos(inputs, signal, onProgress, options)
  const { width, height, audioCodec } = preflight

  const target = new BufferTarget()
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target,
  })
  const videoSource = new VideoSampleSource({
    codec: 'avc',
    bitrate,
    sizeChangeBehavior: 'passThrough',
    transform: { width, height, fit: 'contain' },
  })
  output.addVideoTrack(videoSource)
  const audioSource = audioCodec
    ? new AudioBufferSource({
        codec: audioCodec,
        bitrate: 128_000,
        transform: { numberOfChannels: 2, sampleRate: 48_000 },
      })
    : null
  if (audioSource) output.addAudioTrack(audioSource)

  let finalized = false
  try {
    await output.start()
    if (audioSource) {
      await writeAudio(clips, audioSource, signal, onProgress, externalAudio)
    }
    await writeVideo(
      clips,
      videoSource,
      signal,
      onProgress,
      videoCanvas,
      captions
    )
    ensureNotAborted(signal)
    onProgress?.({ phase: 'finalizing', percent: 97 })
    await output.finalize()
    finalized = true
    if (!target.buffer?.byteLength) {
      throw new Error('MP4 export produced an empty file')
    }
    onProgress?.({ phase: 'finalizing', percent: 100 })
    return new Blob([target.buffer], { type: 'video/mp4' })
  } finally {
    if (!finalized) {
      videoSource.close()
      audioSource?.close()
      await output.cancel().catch(() => undefined)
    }
  }
}
