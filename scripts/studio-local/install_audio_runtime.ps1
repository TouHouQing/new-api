param([string]$Directory = "$env:USERPROFILE\.cache\codex-studio-toolchains\studio-local")
$ErrorActionPreference = 'Stop'
$lab = [System.IO.Path]::GetFullPath($Directory)
$basePython = "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$runtimeDirectory = Join-Path $lab 'audio-runtime'
$python = Join-Path $runtimeDirectory 'Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
  & $basePython -m venv $runtimeDirectory
  if ($LASTEXITCODE -ne 0) { throw 'Cannot create audio runtime' }
}
& $python -m pip install --no-deps -r (Join-Path $PSScriptRoot 'requirements-audio.txt')
if ($LASTEXITCODE -ne 0) { throw 'Cannot install pinned audio dependencies' }
& $python -m pip install --no-deps 'git+https://github.com/resemble-ai/chatterbox.git@5de7a54aa4e5e2baadb0182dde554908b48b85c2'
if ($LASTEXITCODE -ne 0) { throw 'Cannot install pinned Chatterbox' }
$checkout = Join-Path $lab 'MuseTalk'
if (-not (Test-Path -LiteralPath (Join-Path $checkout '.git'))) {
  & git clone https://github.com/TMElyralab/MuseTalk.git $checkout
  if ($LASTEXITCODE -ne 0) { throw 'Cannot clone MuseTalk' }
  & git -C $checkout checkout 0a89dec45a0192b824e3cf4daf96c239440c5ed8
  if ($LASTEXITCODE -ne 0) { throw 'Cannot select verified MuseTalk version' }
}
Write-Output 'Pinned audio runtime is installed. Model files are listed in models-lock.json; existing model caches are preserved.'
& $basePython -X utf8 (Join-Path $PSScriptRoot 'install_asr_model.py') --directory $lab
if ($LASTEXITCODE -ne 0) { throw 'Cannot install the pinned local speech recognizer' }
& $basePython -X utf8 (Join-Path $PSScriptRoot 'install_image_tools.py') --directory $lab
if ($LASTEXITCODE -ne 0) { throw 'Cannot install the pinned image processing engines' }
& $basePython -X utf8 (Join-Path $PSScriptRoot 'install_depth_model.py') --directory $lab
if ($LASTEXITCODE -ne 0) { throw 'Cannot install the pinned video depth model' }
& $python -m pip check
if ($LASTEXITCODE -ne 0) { throw 'Installed media dependencies are inconsistent' }
