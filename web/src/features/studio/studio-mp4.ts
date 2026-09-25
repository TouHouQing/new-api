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
  VideoSampleSink,
  VideoSampleSource,
} from 'mediabunny'

export type StudioMp4Progress = {
  phase: 'probing' | 'audio' | 'video' | 'finalizing'
  percent: number
  clipIndex?: number
}

type ProbedClip = {
  blob: Blob
  duration: number
  start: number
  width: number
  height: number
  hasAudio: boolean
}

function ensureNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Export canceled', 'AbortError')
}

function openClip(blob: Blob): Input {
  return new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
}

async function probeClip(blob: Blob, index: number): Promise<ProbedClip> {
  const input = openClip(blob)
  try {
    const video = await input.getPrimaryVideoTrack()
    if (!video) throw new Error(`Clip ${index + 1} has no video track`)
    if (!(await video.canDecode())) {
      throw new Error(
        `Clip ${index + 1} uses a video codec this browser cannot decode`
      )
    }
    const [start, end, width, height, audioTracks] = await Promise.all([
      video.getFirstTimestamp(),
      video.computeDuration(),
      video.getDisplayWidth(),
      video.getDisplayHeight(),
      input.getAudioTracks(),
    ])
    const duration = end - start
    if (!Number.isFinite(duration) || duration <= 0 || duration > 3600) {
      throw new Error(`Clip ${index + 1} has an invalid duration`)
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
      start,
      width,
      height,
      hasAudio: audioTracks.length > 0,
    }
  } finally {
    input.dispose()
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
  onProgress: ((progress: StudioMp4Progress) => void) | undefined
): Promise<void> {
  for (const [index, clip] of clips.entries()) {
    ensureNotAborted(signal)
    onProgress?.({
      phase: 'audio',
      percent: 10 + Math.round((index / clips.length) * 15),
      clipIndex: index + 1,
    })
    const input = openClip(clip.blob)
    const rate = 48_000
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
      await source.add(ready)
      chunkStart += ready.length
      chunk = chunkStart < totalSamples ? createChunk(chunkStart) : null
    }
    try {
      const audio = await input.getPrimaryAudioTrack()
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
          const channels = [
            buffer.getChannelData(0),
            buffer.getChannelData(Math.min(1, buffer.numberOfChannels - 1)),
          ]
          let position = Math.max(0, start)
          while (position < end) {
            while (chunk && position >= chunkStart + chunk.length) {
              await flushChunk()
            }
            const active = chunk
            if (!active) break
            const limit = Math.min(end, chunkStart + active.length)
            const output = [active.getChannelData(0), active.getChannelData(1)]
            for (
              let sampleIndex = position;
              sampleIndex < limit;
              sampleIndex++
            ) {
              const inputPosition =
                ((sampleIndex - start) * buffer.sampleRate) / rate
              const left = Math.floor(inputPosition)
              if (left < 0 || left >= buffer.length) continue
              const right = Math.min(buffer.length - 1, left + 1)
              const fraction = inputPosition - left
              for (let channel = 0; channel < 2; channel++) {
                const samples = channels[channel]
                output[channel][sampleIndex - chunkStart] =
                  samples[left] * (1 - fraction) + samples[right] * fraction
              }
            }
            position = limit
          }
        }
      }
      while (chunk) {
        ensureNotAborted(signal)
        await flushChunk()
      }
    } finally {
      input.dispose()
    }
  }
  source.close()
}

async function writeVideo(
  clips: ProbedClip[],
  source: VideoSampleSource,
  signal: AbortSignal | undefined,
  onProgress: ((progress: StudioMp4Progress) => void) | undefined
): Promise<void> {
  let timeline = 0
  let lastTimestamp = -1
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
          const relative = Math.max(0, sample.timestamp - clip.start)
          if (relative >= clip.duration) break
          const timestamp = Math.max(
            timeline + relative,
            lastTimestamp + 0.000001
          )
          sample.setTimestamp(timestamp)
          sample.setDuration(
            Math.max(
              0.001,
              Math.min(sample.duration, timeline + clip.duration - timestamp)
            )
          )
          await source.add(sample, { keyFrame: frames === 0 })
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
  blobs: Blob[],
  onProgress?: (progress: StudioMp4Progress) => void,
  signal?: AbortSignal
): Promise<Blob> {
  if (!blobs.length) throw new Error('at least one video is required')
  ensureNotAborted(signal)
  const clips: ProbedClip[] = []
  for (const [index, blob] of blobs.entries()) {
    ensureNotAborted(signal)
    onProgress?.({
      phase: 'probing',
      percent: Math.round((index / blobs.length) * 10),
      clipIndex: index + 1,
    })
    clips.push(await probeClip(blob, index))
  }

  const { width, height } = outputDimensions(clips[0])
  const bitrate = Math.min(8_000_000, Math.max(2_000_000, width * height * 3))
  if (!(await canEncodeVideo('avc', { width, height, bitrate }))) {
    throw new Error(
      `this browser cannot encode H.264 MP4 at ${width}×${height}`
    )
  }
  const hasAudio = clips.some((clip) => clip.hasAudio)
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
    if (audioSource) await writeAudio(clips, audioSource, signal, onProgress)
    await writeVideo(clips, videoSource, signal, onProgress)
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
