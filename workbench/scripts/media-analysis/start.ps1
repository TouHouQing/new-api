param(
    [Parameter(Mandatory=$true)][string]$Python,
    [Parameter(Mandatory=$true)][string]$FFmpeg,
    [Parameter(Mandatory=$true)][string]$Directory,
    [Parameter(Mandatory=$true)][string]$TokenFile,
    [ValidateRange(1024,65535)][int]$Port=13005
)
$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$worker=Join-Path $PSScriptRoot 'worker.py'
$directoryPath=[IO.Path]::GetFullPath($Directory)
$tokenPath=[IO.Path]::GetFullPath($TokenFile)
$ownerPath=Join-Path $directoryPath '.yingce-worker-owner.json'
foreach($path in @($Python,$FFmpeg,$worker)) { if(-not(Test-Path -LiteralPath $path -PathType Leaf)){throw 'The existing local Python/FFmpeg runtime is required'} }
if(Test-Path -LiteralPath $directoryPath){
    if((Get-Item -LiteralPath $directoryPath).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Worker directory cannot be a junction or symlink'}
    if(-not(Test-Path -LiteralPath $ownerPath -PathType Leaf)){throw 'Existing directory has no worker ownership receipt'}
    $owner=Get-Content -LiteralPath $ownerPath -Raw|ConvertFrom-Json
    if([IO.Path]::GetFullPath($owner.repository) -ne $repo -or [IO.Path]::GetFullPath($owner.worker) -ne $worker -or [IO.Path]::GetFullPath($owner.directory) -ne $directoryPath -or $owner.port -ne $Port){throw 'Worker ownership does not match this repository, directory and port'}
}else{
    if(Test-Path -LiteralPath $tokenPath){throw 'A new runtime cannot adopt an unrelated existing token'}
    [IO.Directory]::CreateDirectory($directoryPath)|Out-Null
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($tokenPath))|Out-Null
    $bytes=New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    [IO.File]::WriteAllText($tokenPath,[Convert]::ToHexString($bytes).ToLowerInvariant(),[Text.UTF8Encoding]::new($false))
}
if(-not(Test-Path -LiteralPath $tokenPath -PathType Leaf) -or ((Get-Item -LiteralPath $tokenPath).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Private worker token is missing or unsafe'}
$listener=Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if($listener){
    $process=Get-CimInstance Win32_Process -Filter "ProcessId = $($listener[0].OwningProcess)"
    if(-not $owner -or ($process.ProcessId -ne $owner.pid -and $process.ParentProcessId -ne $owner.pid) -or -not $process.CommandLine.Contains($worker)){throw 'Port belongs to another process; nothing was stopped'}
    $health=Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 3
    if($health.status -ne 'ok'){throw 'Owned worker is unhealthy; inspect its logs before restarting'}
    $owner.pid=$process.ProcessId; $owner|ConvertTo-Json|Set-Content -LiteralPath $ownerPath -Encoding utf8
    [pscustomobject]@{Started=$false;AlreadyRunning=$true;PID=$process.ProcessId;Port=$Port;EngineSHA256=$health.engineSHA256}|ConvertTo-Json
    exit 0
}
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$arguments=@('-X','utf8','-B',('"'+$worker+'"'),'--directory',('"'+$directoryPath+'"'),'--ffmpeg',('"'+[IO.Path]::GetFullPath($FFmpeg)+'"'),'--token-file',('"'+$tokenPath+'"'),'--port',$Port)
$started=Start-Process -FilePath $Python -ArgumentList $arguments -WorkingDirectory $repo -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $directoryPath "worker-$stamp.log") -RedirectStandardError (Join-Path $directoryPath "worker-$stamp.err")
[ordered]@{repository=$repo;worker=$worker;pid=$started.Id;port=$Port;directory=$directoryPath;created=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json|Set-Content -LiteralPath $ownerPath -Encoding utf8
$deadline=(Get-Date).AddSeconds(20); $health=$null
do{try{$health=Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2;break}catch{Start-Sleep -Milliseconds 250}}while((Get-Date)-lt $deadline)
if(-not $health -or $health.status -ne 'ok'){throw 'Worker did not become healthy; owned process and logs retained'}
$listener=Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop
$actual=Get-CimInstance Win32_Process -Filter "ProcessId = $($listener[0].OwningProcess)"
if(($actual.ProcessId -ne $started.Id -and $actual.ParentProcessId -ne $started.Id) -or -not $actual.CommandLine.Contains($worker)){throw 'Listener did not match the worker that was started'}
[ordered]@{repository=$repo;worker=$worker;pid=$actual.ProcessId;port=$Port;directory=$directoryPath;created=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json|Set-Content -LiteralPath $ownerPath -Encoding utf8
[pscustomobject]@{Started=$true;PID=$actual.ProcessId;Port=$Port;EngineVersion=$health.engineVersion;EngineSHA256=$health.engineSHA256;ModelCalls=$false}|ConvertTo-Json
