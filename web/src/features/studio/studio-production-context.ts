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
import { createContext, useContext } from 'react'

import type { useStudioProductionController } from './studio-production-controller'

export const StudioProductionContext = createContext<ReturnType<
  typeof useStudioProductionController
> | null>(null)
export function useStudioProductionContext() {
  const value = useContext(StudioProductionContext)
  if (!value) throw new Error('Studio production context is unavailable')
  return value
}
