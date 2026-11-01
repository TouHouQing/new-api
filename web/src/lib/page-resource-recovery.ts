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
export function isPageResourceError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const value = error as {
    name?: string
    code?: string
    message?: string
    cause?: unknown
  }
  return (
    value.name === 'ChunkLoadError' ||
    value.code === 'CSS_CHUNK_LOAD_FAILED' ||
    /Loading (?:CSS )?chunk .+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
      value.message || ''
    ) ||
    (value.cause !== error && !!value.cause && isPageResourceError(value.cause))
  )
}

export function reloadCurrentPage() {
  window.location.reload()
}
