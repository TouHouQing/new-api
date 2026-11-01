/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
export type StudioLipSelection = {
  start: number
  end: number
  x: number
  y: number
  width: number
  height: number
}

export function studioLipSelectionValid(
  edit: StudioLipSelection,
  audioStart: number,
  videoDuration: number | undefined,
  audioDuration: number | undefined,
  size?: { width: number; height: number }
) {
  const duration = edit.end - edit.start
  const automatic = !edit.x && !edit.y && !edit.width && !edit.height
  return (
    !!videoDuration &&
    !!audioDuration &&
    [edit.start, edit.end, audioStart].every(Number.isFinite) &&
    edit.start >= 0 &&
    duration >= 0.1 &&
    duration <= 30 &&
    edit.end <= videoDuration + 0.001 &&
    audioStart >= 0 &&
    audioStart + duration <= audioDuration + 0.001 &&
    [edit.x, edit.y, edit.width, edit.height].every(
      (value) => Number.isInteger(value) && value >= 0 && value <= 8192
    ) &&
    (automatic ||
      (edit.width >= 48 &&
        edit.height >= 48 &&
        (!size ||
          (edit.x + edit.width <= size.width &&
            edit.y + edit.height <= size.height))))
  )
}
