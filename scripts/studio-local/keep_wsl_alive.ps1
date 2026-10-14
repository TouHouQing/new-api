<#
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
#>
param([string]$Distribution = 'Ubuntu-22.04')
$ErrorActionPreference = 'Stop'
$taskMutexName = 'Local\NewApiStudioWslKeepalive-' + ($Distribution -replace '[^a-zA-Z0-9-]', '_')
$taskMutex = [System.Threading.Mutex]::new($false, $taskMutexName)
$taskOwnsMutex = $false
try {
  try { $taskOwnsMutex = $taskMutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $taskOwnsMutex = $true }
  if (-not $taskOwnsMutex) { return }
  # This hidden Windows console outlives the calling terminal.
  & "$env:SystemRoot\System32\wsl.exe" -d $Distribution -u root -- tail -f /dev/null
  if ($LASTEXITCODE -ne 0) { throw "WSL keeper exited with code $LASTEXITCODE" }
} finally {
  if ($taskOwnsMutex) { $taskMutex.ReleaseMutex() }
  $taskMutex.Dispose()
}
