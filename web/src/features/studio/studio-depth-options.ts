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
export const studioDepthSizes = [
  [640, 384],
  [384, 640],
  [640, 480],
  [480, 640],
  [512, 512],
  [384, 224],
  [224, 384],
] as const

export function studioDepthSizeValid(
  width: number,
  height: number,
  seconds: number
): boolean {
  return (
    studioDepthSizes.some(([w, h]) => w === width && h === height) &&
    (seconds <= 10 ||
      (width === 384 && height === 224) ||
      (width === 224 && height === 384))
  )
}
