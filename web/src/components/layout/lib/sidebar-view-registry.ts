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
import { Film, Image, Layers, Settings } from 'lucide-react'

import { SYSTEM_SETTINGS_VIEW } from '../config/system-settings.config'
import type { SidebarView } from '../types'

/**
 * Registered nested sidebar views.
 *
 * Each entry describes a contextual sidebar that replaces the root
 * navigation when the user enters that workspace (Vercel-style
 * "drill-in" pattern). Add new entries here to register a new view.
 *
 * Match priority is array order; the first matching `pathPattern` wins.
 */
const STUDIO_VIEW: SidebarView = {
  id: 'studio',
  pathPattern: /^\/studio\/?$/,
  parent: { to: '/dashboard/overview', label: 'Account and advanced settings' },
  getNavGroups: (t) => [
    {
      id: 'video-creation',
      title: t('Video creation'),
      items: [
        {
          title: t('Guided video creation'),
          icon: Film,
          url: '/studio?workspace=guided',
        },
        {
          title: t('studio.asset.title'),
          icon: Image,
          url: '/studio?workspace=assets',
        },
        {
          title: t('Creative templates'),
          icon: Layers,
          url: '/studio?workspace=templates',
        },
        {
          title: t('Advanced canvas'),
          icon: Settings,
          url: '/studio?workspace=canvas',
        },
      ],
    },
  ],
}
const SIDEBAR_VIEWS: readonly SidebarView[] = [
  SYSTEM_SETTINGS_VIEW,
  STUDIO_VIEW,
]

/**
 * Resolve the active nested view for the given path.
 *
 * @returns Matching {@link SidebarView}, or `null` when the root
 *          navigation should be displayed.
 */
export function resolveSidebarView(pathname: string): SidebarView | null {
  return SIDEBAR_VIEWS.find((view) => view.pathPattern.test(pathname)) ?? null
}
