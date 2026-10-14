param([string]$Directory = "$env:USERPROFILE\.cache\codex-studio-toolchains\studio-local", [switch]$Remove)
$ErrorActionPreference = 'Stop'
$script = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'supervise_production.ps1'))
$lab = [IO.Path]::GetFullPath($Directory)
$sha = [Security.Cryptography.SHA256]::Create()
try { $suffix = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($script))).Replace('-', '').Substring(0, 8)).ToLowerInvariant() } finally { $sha.Dispose() }
$name = 'NewAPIStudioLocal-' + $suffix
$existing = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if ($existing -and ($existing.Actions.Arguments -notlike ('*' + $script + '*'))) { throw 'Existing startup task belongs to another application' }
if ($Remove) {
  if ($existing) { Stop-ScheduledTask -TaskName $name; Unregister-ScheduledTask -TaskName $name -Confirm:$false }
  Write-Output "Local production startup removed: $name"
  return
}
if (-not (Test-Path -LiteralPath (Join-Path $lab 'production\.env'))) { throw 'Configure the local production environment before enabling startup' }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -File "' + $script + '" -Directory "' + $lab + '"') -WorkingDirectory ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')))
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval ([TimeSpan]::FromMinutes(1)) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
if (-not $existing) { Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Runs this local AI video platform. Keeps its own helpers available; does not stop user model services or submit inference.' | Out-Null }
Start-ScheduledTask -TaskName $name
Write-Output "Local production startup enabled: $name"
