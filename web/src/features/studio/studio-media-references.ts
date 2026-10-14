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
export function studioDocumentMediaIds(document: unknown): Set<string> {
  const ids = new Set<string>()
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    for (const [key, item] of Object.entries(value)) {
      if (/MediaId$|^mediaId$/.test(key) && typeof item === 'string' && item) {
        ids.add(item)
      } else if (
        (key === 'mediaIds' || key === 'referenceMediaIds') &&
        Array.isArray(item)
      ) {
        item.forEach((id) => {
          if (typeof id === 'string' && id) ids.add(id)
        })
      } else if (item && typeof item === 'object') visit(item)
    }
  }
  visit(document)
  return ids
}

export function mapStudioMediaReferences<T>(
  document: T,
  resolve: (id: string) => string | undefined
): T {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if (/MediaId$|^mediaId$/.test(key) && typeof item === 'string') {
          return [key, resolve(item)]
        }
        if (
          (key === 'mediaIds' || key === 'referenceMediaIds') &&
          Array.isArray(item)
        ) {
          return [
            key,
            item
              .map((id) => (typeof id === 'string' ? resolve(id) : undefined))
              .filter(Boolean),
          ]
        }
        return [key, visit(item)]
      })
    )
  }
  return visit(document) as T
}
