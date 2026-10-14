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

export function studioSongDuration(lyrics: string): number {
  const lines = lyrics
    .split(/\n/)
    .filter((line) => line.trim() && !/^\s*\[[^\]]+\]\s*$/.test(line))
  return Math.max(
    8,
    Math.ceil(
      4 +
        lines.reduce(
          (sum, line) =>
            sum +
            0.75 +
            (line.match(/[\p{Script=Han}]|[\p{L}]+/gu)?.length || 0) * 0.65,
          0
        )
    )
  )
}
