/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
import type { TFunction } from 'i18next'

import type { getPricing } from '@/features/pricing/api'

import type { StudioProject } from './local-projects'

export function studioGenerationAction(
  project: StudioProject,
  ids: string[],
  t: TFunction
): string {
  const nodes = project.nodes.filter((node) => ids.includes(node.id))
  if (!nodes.length) return t('Choose a shot')
  if (nodes.every((node) => node.data.kind === 'image')) {
    return t('Make {{count}} key images', {
      count: nodes.reduce((sum, node) => sum + (node.data.imageCount || 1), 0),
    })
  }
  if (nodes.every((node) => node.data.kind === 'video')) {
    return t('Make {{count}} videos', { count: nodes.length })
  }
  return t('Generate {{count}} selected items', { count: nodes.length })
}

export function studioCatalogZeroCharge(
  pricing: Awaited<ReturnType<typeof getPricing>> | undefined,
  model: string,
  group: string
): boolean {
  const entry = pricing?.data?.find((item) => item.model_name === model)
  return !!(
    pricing?.success &&
    Object.hasOwn(pricing.usable_group || {}, group) &&
    entry?.enable_groups.includes(group) &&
    !entry.billing_plugin_variants?.length &&
    entry.billing_mode !== 'tiered_expr' &&
    ((entry.quota_type === 1 && entry.model_price === 0) ||
      (entry.quota_type === 0 &&
        entry.model_ratio === 0 &&
        entry.completion_ratio === 0))
  )
}
