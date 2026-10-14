param(
  [string]$Directory = "$env:USERPROFILE\.cache\codex-studio-toolchains\studio-local",
  [string]$ComfyDirectory = "$env:USERPROFILE\Desktop\Data\Packages\ComfyUI",
  [ValidateRange(1, 8)][double]$ReserveVRAMGB = 4,
  [switch]$CPUVAE
)
$ErrorActionPreference = 'Stop'
$privateRoot = [IO.Path]::GetFullPath((Join-Path $Directory 'private-comfy'))
$sourceRoot = [IO.Path]::GetFullPath($ComfyDirectory)
$python = Join-Path $sourceRoot 'venv\Scripts\python.exe'
$main = Join-Path $sourceRoot 'main.py'
if (!(Test-Path -LiteralPath $python) -or !(Test-Path -LiteralPath $main)) { throw 'Use the existing installed ComfyUI runtime' }
foreach ($folder in @($privateRoot, (Join-Path $privateRoot 'user'), (Join-Path $privateRoot 'input'), (Join-Path $privateRoot 'output'))) { New-Item -ItemType Directory -Path $folder -Force | Out-Null }
if (Get-NetTCPConnection -State Listen -LocalPort 8288 -ErrorAction SilentlyContinue) { return }
& $python (Join-Path $PSScriptRoot 'comfy_cpu_quant_compat.py') --comfy-directory $sourceRoot --backup-directory (Join-Path $privateRoot 'compatibility')
if ($LASTEXITCODE -ne 0) { throw 'Local CPU quantization compatibility could not be configured' }
$receipt = Join-Path $privateRoot 'runtime.json'
if (Test-Path -LiteralPath $receipt) {
  $previous = Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
  if (!$PSBoundParameters.ContainsKey('ReserveVRAMGB') -and $previous.reserve_vram_gb -ge 1 -and $previous.reserve_vram_gb -le 8) { $ReserveVRAMGB = [double]$previous.reserve_vram_gb }
  $warming = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$previous.pid)
  $warmingProcess = Get-Process -Id ([int]$previous.pid) -ErrorAction SilentlyContinue
  if ($warming -and $warmingProcess -and !$warmingProcess.HasExited -and $warming.CommandLine -like ('*' + $privateRoot + '*') -and $warming.CommandLine -like '*--port 8288*') { return }
}
$database = 'sqlite:///' + ((Join-Path $privateRoot 'user\comfyui.db') -replace '\\','/')
$memoryExtension = Join-Path $privateRoot 'custom_nodes\studio_memory_cleanup'
New-Item -ItemType Directory -Path $memoryExtension -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'comfy_private_memory.py') -Destination (Join-Path $memoryExtension 'policy.py') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'comfy_private_memory_extension.py') -Destination (Join-Path $memoryExtension '__init__.py') -Force
$arguments = @('-u', ('"' + $main + '"'), '--listen', '127.0.0.1', '--port', '8288', '--disable-dynamic-vram', '--disable-all-custom-nodes', '--base-directory', ('"' + $privateRoot + '"'), '--user-directory', ('"' + (Join-Path $privateRoot 'user') + '"'), '--database-url', $database, '--models-directory', ('"' + (Join-Path $sourceRoot 'models') + '"'), '--use-pytorch-cross-attention')
$arguments += @('--lowvram', '--fp32-text-enc', '--bf16-unet', '--cache-classic', '--disable-pinned-memory', '--disable-async-offload', '--reserve-vram', $ReserveVRAMGB.ToString([Globalization.CultureInfo]::InvariantCulture))
$arguments += @('--whitelist-custom-nodes', 'studio_memory_cleanup')
if ($CPUVAE) { $arguments += '--cpu-vae' }
$env:OMP_NUM_THREADS = '8'
$env:MKL_NUM_THREADS = '8'
$child = Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $sourceRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Directory 'private-comfy.log') -RedirectStandardError (Join-Path $Directory 'private-comfy.err')
@{ pid = $child.Id; port = 8288; directory = $privateRoot; source = $sourceRoot; reserve_vram_gb = $ReserveVRAMGB; cpu_vae = [bool]$CPUVAE } | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $privateRoot 'runtime.json')
Write-Output "Private inference runtime started on loopback port 8288; PID $($child.Id)"
