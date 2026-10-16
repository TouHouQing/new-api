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
export function studioWorkflowProblem(message: string): string {
  if (
    /local Wan supports|supported frame size|unsupported resolution/i.test(
      message
    )
  ) {
    return 'Choose a frame size supported by the selected video model.'
  }
  if (/no audio (stream|track)/i.test(message)) {
    return 'This video has no audio track. Choose a video with sound or add separate audio.'
  }
  if (
    /Concurrent project edit|revision conflict|stale revision/i.test(message)
  ) {
    return 'The project changed in another session. Your draft is retained; resolve the conflicting edits before saving.'
  }
  if (/all delivery clips.*approved/i.test(message)) {
    return 'Approve the current footage for every delivery clip before exporting.'
  }
  if (
    /object storage|storage is unavailable|insufficient.*(disk|space)|disk.*(full|space)|write.*storage/i.test(
      message
    )
  ) {
    return 'Studio storage is unavailable. Restore free space or reconnect storage before generating.'
  }
  if (/insufficient.*quota|insufficient.*credit/i.test(message)) {
    return 'Insufficient generation credit. Add credit or continue with free editing.'
  }
  if (/workflow spending limit|workflow.*budget/i.test(message)) {
    return 'Workflow spending limit reached. Review the recorded costs before starting another generation.'
  }
  if (/HTTP (401|403)|permission|access.denied/i.test(message)) {
    return 'The service rejected this request. Check credit and model access, then retry with the saved settings.'
  }
  if (/timeout|timed out|HTTP (502|503|504)/i.test(message)) {
    return 'The service is unavailable or timed out. Keep the task and check its progress before resubmitting.'
  }
  if (/1455|out.?of.?memory|memory is exhausted/i.test(message)) {
    return 'Local memory was insufficient. The failed task and saved files are retained; retry when resources are available.'
  }
  return 'The task failed. Check its settings and service status; technical details are available below.'
}
