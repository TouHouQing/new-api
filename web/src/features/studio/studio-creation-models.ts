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
import { fetchStudioModels } from './api'
import type { StudioProject } from './local-projects'
import { updateStudioNode } from './workspace'

export type StudioCreationModels = Record<'text' | 'image' | 'video', string[]>

// Account services run through durable platform workflows. Personal provider
// credentials belong to the separate advanced direct-generation settings.
export function classifyStudioCreationModels(
  models: string[]
): StudioCreationModels {
  const result: StudioCreationModels = { text: [], image: [], video: [] }
  for (const model of models) {
    const name = model.toLowerCase()
    if (
      /^(?:studio-|whisper|chatterbox)|(?:embedding|rerank|moderation|transcri|speech|tts)/.test(
        name
      )
    ) {
      continue
    }
    if (
      /(?:flux|dall-e|gpt-image|seedream|qwen-image|imagen|stable.diffusion|hunyuan.?image|nano.?banana)/.test(
        name
      )
    ) {
      result.image.push(model)
      continue
    }
    if (
      /(?:wan[ ._-]?\d|seedance|sora|veo|kling|hailuo|minimax.*(?:video|h3)|runway|luma|hunyuan.?video|(?:^|[-_])video(?:[-_]|$))/.test(
        name
      )
    ) {
      result.video.push(model)
      continue
    }
    result.text.push(model)
  }
  return result
}

export async function fetchStudioCreationModels(
  group: string
): Promise<StudioCreationModels> {
  return classifyStudioCreationModels(await fetchStudioModels(group))
}

export function applyStudioRecommendedModels(
  project: StudioProject,
  catalog: StudioCreationModels,
  group: string,
  quick = false
): StudioProject {
  const pick = (
    kind: keyof StudioCreationModels,
    preferred: RegExp
  ): string | undefined =>
    catalog[kind].find((model) => preferred.test(model)) || catalog[kind][0]
  const defaults = {
    ...project.defaults,
    textModel: project.defaults?.textModel || pick('text', /qwen/i),
    imageModel: project.defaults?.imageModel || pick('image', /flux.*klein/i),
    videoModel: project.defaults?.videoModel || pick('video', /wan2[.-]2/i),
    videoGroup: group,
    ...(quick ? { seconds: Math.min(project.defaults?.seconds || 3, 3) } : {}),
  }
  let next: StudioProject = { ...project, defaults }
  for (const node of project.nodes) {
    if (
      (node.data.model && !(quick && node.data.kind === 'video')) ||
      node.data.locked ||
      node.data.sourceMode === 'upload' ||
      node.data.mediaId ||
      node.data.outputText ||
      node.data.outputUrl ||
      node.data.status === 'completed' ||
      node.data.purpose === 'assembly' ||
      node.data.purpose === 'note'
    ) {
      continue
    }
    let model: string | undefined
    if (node.data.kind === 'text') model = defaults.textModel
    if (node.data.kind === 'image') model = defaults.imageModel
    if (node.data.kind === 'video') {
      model = node.data.model || defaults.videoModel
    }
    if (model) {
      let imageSize = '1024x576',
        videoSize = '640x384'
      if (
        project.production &&
        project.production.height > project.production.width
      ) {
        imageSize = '576x1024'
      } else if (
        project.production &&
        project.production.height === project.production.width
      ) {
        imageSize = '1024x1024'
      }
      if (node.data.ratio === '9:16') videoSize = '384x640'
      else if (node.data.ratio === '1:1') videoSize = '512x512'
      next = updateStudioNode(next, node.id, {
        model,
        ...(node.data.kind === 'image' &&
        model === 'flux.2-klein-4b' &&
        !node.data.imageSize &&
        project.production
          ? { imageSize }
          : {}),
        ...(node.data.kind === 'video'
          ? {
              group,
              ...(model === 'wan2.2-ti2v-5b' && !node.data.resolution
                ? { resolution: videoSize }
                : {}),
              seconds: quick
                ? Math.min(node.data.seconds || 3, 3)
                : node.data.seconds,
            }
          : {}),
      })
    }
  }
  return next
}
