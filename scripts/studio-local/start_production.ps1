param(
  [string]$Directory = "$env:USERPROFILE\.cache\codex-studio-toolchains\studio-local",
  [string]$Distribution = 'Ubuntu-22.04'
)
$ErrorActionPreference = 'Stop'
$lab = [System.IO.Path]::GetFullPath($Directory)
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$runtime = "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$audioPython = Join-Path $lab 'audio-runtime\Scripts\python.exe'
$ffmpeg = "$env:USERPROFILE\.cache\codex-studio-toolchains\ffmpeg\ffmpeg-9.0.2-essentials_build\bin\ffmpeg.exe"
foreach ($required in @($runtime, $audioPython, $ffmpeg, (Join-Path $lab 'production\.env'))) {
  if (-not (Test-Path -LiteralPath $required)) { throw "Required local production dependency is missing: $required" }
}
function Start-StudioHelper([string]$Executable, [string[]]$Arguments, [string]$Name) {
  Start-Process -FilePath $Executable -ArgumentList $Arguments -WindowStyle Hidden -WorkingDirectory $repo -RedirectStandardOutput (Join-Path $lab "$Name.log") -RedirectStandardError (Join-Path $lab "$Name.err") | Out-Null
}
function Test-StudioPort([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}
# Keep the residency process independent of the calling terminal.
$keeperScript = Join-Path $PSScriptRoot 'keep_wsl_alive.ps1'
$keeper = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -in @('pwsh.exe', 'powershell.exe') -and
  $_.CommandLine -match '-File\s+"?[^"\r\n]*keep_wsl_alive\.ps1(?:"|\s|$)'
}
if (-not $keeper) {
  $keeperShell = (Get-Process -Id $PID).Path
  Start-Process -FilePath $keeperShell -ArgumentList @(
    '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-File',
    ('"' + $keeperScript + '"'), '-Distribution', $Distribution
  ) -WindowStyle Hidden -WorkingDirectory $repo | Out-Null
}
$route = (& wsl -d $Distribution -u root -- ip route show default) -join ' '
if ($route -notmatch 'via\s+([0-9.]+)') { throw 'Cannot determine the private WSL host adapter' }
$hostAddress = $Matches[1]
$network = Get-NetIPAddress -AddressFamily IPv4 | Where-Object IPAddress -eq $hostAddress | Select-Object -First 1
if (-not $network) { throw 'Private WSL adapter is unavailable' }
# The relay validates and restricts peers to this adapter's subnet.
$allowed = "$hostAddress/$($network.PrefixLength)"
if (-not (Test-StudioPort 8000)) {
  $gateway = "$env:USERPROFILE\Doubao\chats\2026-10-03\new-chat-1\start_gateway.bat"
  if (-not (Test-Path -LiteralPath $gateway)) { throw "Gateway launcher is missing: $gateway" }
  Start-StudioHelper 'cmd.exe' @('/c', ('"' + $gateway + '"')) 'gateway-production'
}
if (-not (Test-StudioPort 8288)) {
  & (Join-Path $PSScriptRoot 'start_private_comfy.ps1') -Directory $lab
  $privateEngineDeadline = [DateTime]::UtcNow.AddSeconds(60)
  $privateEngineReady = $false
  while (-not $privateEngineReady -and [DateTime]::UtcNow -lt $privateEngineDeadline) {
    try { $privateEngineReady = [bool](Invoke-RestMethod 'http://127.0.0.1:8288/object_info/UNETLoader' -TimeoutSec 5).UNETLoader } catch {}
    if (-not $privateEngineReady) { Start-Sleep -Milliseconds 500 }
  }
  if (-not $privateEngineReady) { throw 'Private inference engine did not become ready' }
}
if (-not (Test-StudioPort 13003)) {
  Start-StudioHelper $runtime @('-X', 'utf8', 'scripts/studio-local/local_model_adapter.py', '--text-device', 'cpu', '--tile-video-decode', '--comfy', 'http://127.0.0.1:8288', '--directory', ('"' + (Join-Path $lab 'local-models') + '"'), '--workflow-directory', ('"' + "$env:USERPROFILE\Doubao\chats\2026-10-03\new-chat-1\workflows" + '"'), '--ffmpeg', ('"' + $ffmpeg + '"')) 'adapter-production'
}
$env:HF_HOME = Join-Path $lab 'audio-models'
$env:HF_HUB_DISABLE_XET = '1'
if (-not (Test-StudioPort 13004)) {
  Start-StudioHelper $audioPython @('-X', 'utf8', 'scripts/studio-local/real_audio_worker.py', '--comfy', 'http://127.0.0.1:8288', '--music-comfy', 'http://127.0.0.1:8188', '--directory', ('"' + (Join-Path $lab 'real-audio') + '"'), '--ffmpeg', ('"' + $ffmpeg + '"')) 'audio-production'
}
if (-not (Test-StudioPort 13013)) {
  Start-StudioHelper $runtime @('-X', 'utf8', 'scripts/studio-local/private_model_relay.py', '--bind', $hostAddress, '--allow', $allowed) 'private-model-relay'
}
# Launching a process is not proof that its HTTP API is ready. Wait before
# configuring channels so a cold start cannot fail halfway through deployment.
foreach ($endpoint in @('http://127.0.0.1:13003/v1/models', 'http://127.0.0.1:13004/health', 'http://127.0.0.1:8288/studio/memory')) {
  $helperReady = $false
  $helperDeadline = [DateTime]::UtcNow.AddSeconds(60)
  while (-not $helperReady -and [DateTime]::UtcNow -lt $helperDeadline) {
    try {
      $helperStatus = Invoke-RestMethod $endpoint -TimeoutSec 5
      $helperReady = [bool]$helperStatus
      if ($endpoint.EndsWith('/studio/memory')) { $helperReady = $helperStatus.policy -eq 'release_cpu_and_gpu' }
    } catch {}
    if (-not $helperReady) { Start-Sleep -Milliseconds 500 }
  }
  if (-not $helperReady) { throw "Local model helper did not become ready: $endpoint" }
}
function Convert-StudioWslPath([string]$Path) {
  $full = [System.IO.Path]::GetFullPath($Path)
  return '/mnt/' + $full.Substring(0, 1).ToLowerInvariant() + $full.Substring(2).Replace('\', '/')
}
& wsl -d $Distribution -u root -- docker compose --env-file (Convert-StudioWslPath (Join-Path $lab 'production\.env')) --project-directory (Convert-StudioWslPath (Join-Path $lab 'production')) -f (Convert-StudioWslPath (Join-Path $repo 'docker-compose.studio-local.yml')) up -d
if ($LASTEXITCODE -ne 0) { throw 'Docker production startup failed' }
$ready = $false
$deadline = [DateTime]::UtcNow.AddSeconds(60)
while ([DateTime]::UtcNow -lt $deadline) {
  try {
    $status = Invoke-RestMethod -Uri 'http://127.0.0.1:13010/api/status' -TimeoutSec 3
    if ($status.success) { $ready = $true; break }
  } catch { }
  Start-Sleep -Milliseconds 500
}
if (-not $ready) { throw 'Production API did not become ready within 60 seconds' }
& $audioPython -X utf8 (Join-Path $PSScriptRoot 'configure_production.py') --directory $lab --host $hostAddress
if ($LASTEXITCODE -ne 0) { throw 'Local model channel configuration failed' }
Write-Output 'Local production is running at https://localhost:13443. Keep ComfyUI and Ollama running.'
