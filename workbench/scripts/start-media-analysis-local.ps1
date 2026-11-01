#Requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ConfigFile,[switch]$ProbeOnly)
$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$configPath=(Resolve-Path -LiteralPath $ConfigFile).Path
if((Get-Item -LiteralPath $configPath).LinkType -or (Get-Item -LiteralPath $configPath).Length -gt 8192){throw '分析配置必须是普通的小型私有文件。'}
$config=Get-Content -LiteralPath $configPath -Raw|ConvertFrom-Json
$allowed=@('version','python','relayPython','ffmpeg','directory','tokenFile','workerPort','windowsRelayPort','dockerRelayPort')
if($config -isnot [pscustomobject] -or ($config.version -isnot [long] -and $config.version -isnot [int]) -or $config.version -ne 1 -or @($config.PSObject.Properties.Name|Where-Object {$_ -notin $allowed}).Count){throw '分析配置版本或字段无效。'}
foreach($name in @('python','relayPython','ffmpeg','directory','tokenFile')){
 $value=$config.$name
 if($value -isnot [string] -or -not [IO.Path]::IsPathFullyQualified($value) -or $value.StartsWith('\\') -or $value.StartsWith('//')){throw '分析配置仅支持本机绝对路径。'}
}
foreach($name in @('workerPort','windowsRelayPort','dockerRelayPort')){
 $value=$config.$name
 if($value -isnot [long] -and $value -isnot [int]){throw '分析端口必须是整数。'}
 if($value -lt 1024 -or $value -gt 65535){throw '分析端口超出范围。'}
}
foreach($name in @('python','relayPython','ffmpeg')){if(-not(Test-Path -LiteralPath $config.$name -PathType Leaf)){throw '已配置的本地分析运行时不存在，不会自动下载。'}}
$directory=[IO.Path]::GetFullPath($config.directory)
$worker=Join-Path $repo 'scripts/media-analysis/worker.py'
$relay=Join-Path $repo 'model-gateway/private_relay.py'
$ownerPath=Join-Path $directory '.yingce-worker-owner.json'
$relayPath=Join-Path $directory '.analysis-relay-state.json'

function Read-AnalysisHealth([string]$Address){
 try{
  $health=Invoke-RestMethod -Uri ($Address+'/health') -TimeoutSec 3
  if($health.status -ne 'ok' -or $health.engineVersion -ne 1 -or $health.engineSHA256 -notmatch '^[a-f0-9]{64}$'){return $null}
  return $health
 }catch{return $null}
}
function Test-AnalysisReady {
 if(-not(Test-Path -LiteralPath $ownerPath -PathType Leaf) -or -not(Test-Path -LiteralPath $relayPath -PathType Leaf) -or -not(Test-Path -LiteralPath $config.tokenFile -PathType Leaf)){return $false}
 if((Get-Item -LiteralPath $directory).LinkType -or (Get-Item -LiteralPath $config.tokenFile).LinkType){return $false}
 if((Get-Content -LiteralPath $config.tokenFile -Raw).Trim() -notmatch '^[a-f0-9]{64}$'){return $false}
 $owner=Get-Content -LiteralPath $ownerPath -Raw|ConvertFrom-Json
 $state=Get-Content -LiteralPath $relayPath -Raw|ConvertFrom-Json
 if([IO.Path]::GetFullPath($owner.repository) -ne $repo -or [IO.Path]::GetFullPath($owner.directory) -ne $directory -or [IO.Path]::GetFullPath($owner.worker) -ne $worker -or $owner.port -ne $config.workerPort){return $false}
 if([IO.Path]::GetFullPath($state.repository) -ne $repo -or $state.workerPort -ne $config.workerPort -or $state.windowsPort -ne $config.windowsRelayPort -or $state.dockerPort -ne $config.dockerRelayPort){return $false}
 $listener=@(Get-NetTCPConnection -State Listen -LocalPort $config.workerPort -LocalAddress '127.0.0.1' -ErrorAction SilentlyContinue)
 $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$owner.pid)
 if($listener.Count -ne 1 -or $listener[0].OwningProcess -ne $owner.pid -or -not $process -or -not $process.CommandLine.Contains($worker)){return $false}
 $health=Read-AnalysisHealth ('http://127.0.0.1:'+$config.workerPort)
 if(-not $health -or $state.windowsAddress -notmatch '^\d+(?:\.\d+){3}$' -or $state.dockerAddress -notmatch '^\d+(?:\.\d+){3}$'){return $false}
 if(-not @(Get-NetIPAddress -AddressFamily IPv4|Where-Object {$_.IPAddress -eq $state.windowsAddress -and $_.InterfaceAlias -like '*WSL*'}).Count){return $false}
 $windows=@(Get-NetTCPConnection -State Listen -LocalAddress $state.windowsAddress -LocalPort $config.windowsRelayPort -ErrorAction SilentlyContinue)
 $relayProcess=Get-CimInstance Win32_Process -Filter ('ProcessId='+$state.windowsPID)
 if($windows.Count -ne 1 -or $windows[0].OwningProcess -ne $state.windowsPID -or -not $relayProcess -or -not $relayProcess.CommandLine.Contains($relay)){return $false}
 $script='import json,sys,urllib.request;v=json.load(urllib.request.urlopen(sys.argv[1],timeout=3));assert v.get("status")=="ok" and v.get("engineSHA256")==sys.argv[2];print("ready")'
 $reply=(& wsl.exe --user root --exec python3 -B -c $script ('http://'+$state.dockerAddress+':'+$config.dockerRelayPort+'/health') $health.engineSHA256 2>$null)-join ''
 return $LASTEXITCODE -eq 0 -and $reply -eq 'ready'
}

if(-not $ProbeOnly){
 & (Join-Path $repo 'scripts/media-analysis/start.ps1') -Python $config.python -FFmpeg $config.ffmpeg -Directory $directory -TokenFile $config.tokenFile -Port $config.workerPort|Out-Null
 if(-not $?){throw '本地 CPU 分析服务尚未启动，请检查其私有日志。'}
 & (Join-Path $repo 'scripts/media-analysis/start-wsl-relay.ps1') -Python $config.relayPython -Directory $directory -WorkerPort $config.workerPort -WindowsPort $config.windowsRelayPort -DockerPort $config.dockerRelayPort|Out-Null
 if(-not $?){throw '本地 CPU 分析的私网连接尚未就绪。'}
}
$ready=Test-AnalysisReady
[pscustomobject]@{ready=[bool]$ready;localAnalysisReady=[bool]$ready;changedServices=(-not [bool]$ProbeOnly);publicListener=$false;baseURL=('http://host.docker.internal:'+$config.dockerRelayPort);modelInferenceCalls=0}|ConvertTo-Json -Compress
if(-not $ready){exit 1}
