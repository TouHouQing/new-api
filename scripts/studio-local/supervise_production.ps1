param([string]$Directory = "$env:USERPROFILE\.cache\codex-studio-toolchains\studio-local")
$ErrorActionPreference = 'Stop'
$lab = [IO.Path]::GetFullPath($Directory)
$startup = Join-Path $PSScriptRoot 'start_production.ps1'
New-Item -ItemType Directory -Path $lab -Force | Out-Null
$lock = [IO.File]::Open((Join-Path $lab 'production-supervisor.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
try {
  while ($true) {
    try {
      $missing = @(8000, 8288, 13003, 13004, 13013, 13014) | Where-Object { -not (Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue) }
      $appReady = $false
      try { $appReady = [bool](Invoke-RestMethod 'http://127.0.0.1:13010/api/status' -TimeoutSec 5).success } catch {}
      if ($missing.Count -gt 0 -or -not $appReady) {
        "[$([DateTimeOffset]::Now.ToString('o'))] Restoring local platform services" | Add-Content -LiteralPath (Join-Path $lab 'production-supervisor.log')
        & $startup -Directory $lab *>&1 | Out-File -LiteralPath (Join-Path $lab 'production-supervisor.log') -Append -Encoding utf8
      }
    } catch {
      # Missing user model services or a transient startup failure is reported
      # without stopping any process or reissuing a generation task.
      "[$([DateTimeOffset]::Now.ToString('o'))] $($_.Exception.Message)" | Add-Content -LiteralPath (Join-Path $lab 'production-supervisor.log')
    }
    Start-Sleep -Seconds 30
  }
} finally { $lock.Dispose() }
