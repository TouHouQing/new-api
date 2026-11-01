#Requires -Version 7.0
[CmdletBinding()]
param(
    [string]$EnvFile,
    [string]$ModelConfig,
    [string]$SpeechConfig,
    [string]$AgentModelConfig,
    [string]$MediaConfig,
    [string]$AnalysisConfig,
    [ValidateRange(1,65535)][int]$HttpsPort = 13444,
    [switch]$NoBrowser,
    [switch]$ProbeOnly,
    [switch]$KeepaliveOnly
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $EnvFile) { $EnvFile = Join-Path $repoRoot '.local/project-workbench-debug/production/.env' }
if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) { throw '本地生产配置不存在，请先完成仓库的本地生产配置。' }
$EnvFile = (Resolve-Path -LiteralPath $EnvFile).Path
if($ModelConfig){$ModelConfig=(Resolve-Path -LiteralPath $ModelConfig).Path}else{
    $candidate=Join-Path (Split-Path -Parent $EnvFile) '.local-models.json'
    if(Test-Path -LiteralPath $candidate -PathType Leaf){$ModelConfig=$candidate}
}
if($SpeechConfig){$SpeechConfig=(Resolve-Path -LiteralPath $SpeechConfig).Path}else{
    $candidate=Join-Path (Split-Path -Parent $EnvFile) '.local-speech-models.json'
    if(Test-Path -LiteralPath $candidate -PathType Leaf){$SpeechConfig=$candidate}
}
if($AgentModelConfig){$AgentModelConfig=(Resolve-Path -LiteralPath $AgentModelConfig).Path}else{
    $candidate=Join-Path (Split-Path -Parent $EnvFile) '.local-agent-models.json'
    if(Test-Path -LiteralPath $candidate -PathType Leaf){$AgentModelConfig=$candidate}
}
$wslCommand = Get-Command wsl.exe -ErrorAction Stop
if($MediaConfig){$MediaConfig=(Resolve-Path -LiteralPath $MediaConfig).Path}else{
    $candidate=Join-Path (Split-Path -Parent $EnvFile) '.local-media-models.json'
    if(Test-Path -LiteralPath $candidate -PathType Leaf){$MediaConfig=$candidate}
}
$localUrl = "https://localhost:$HttpsPort"
if($AnalysisConfig){$AnalysisConfig=(Resolve-Path -LiteralPath $AnalysisConfig).Path}else{
    $candidate=Join-Path (Split-Path -Parent $EnvFile) '.local-analysis.json'
    if(Test-Path -LiteralPath $candidate -PathType Leaf){$AnalysisConfig=$candidate}
}

function Invoke-ProductionLinux([string[]]$LinuxArguments) {
    & $wslCommand.Source --user root --exec @LinuxArguments
    if ($LASTEXITCODE -ne 0) { throw '本地 Linux 命令失败；请检查上方诊断。配置内容不会输出。' }
}

function Start-ProductionWslKeepalive {
    # systemd services alone do not keep a WSL distribution open. This owned
    # foreground process prevents idle shutdown from interrupting database I/O.
    $existing = @(Get-CimInstance Win32_Process -Filter "name='wsl.exe'" | Where-Object {
        $_.CommandLine -and $_.CommandLine.Contains('yingce-platform-local-keepalive', [StringComparison]::Ordinal)
    })
    if ($existing.Count) { return $false }
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $wslCommand.Source
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    foreach ($argument in @('--user','root','--exec','/bin/bash','-c','exec -a yingce-platform-local-keepalive sleep infinity')) {
        $info.ArgumentList.Add($argument)
    }
    $process = [Diagnostics.Process]::Start($info)
    try {
        if ($process.WaitForExit(1000)) { throw 'WSL 保活进程未能启动，请检查本地 WSL。' }
    } finally { $process.Dispose() }
    return $true
}

function Test-ProductionLocalHealth {
    # Only a loopback health probe skips certificate verification. Login and
    # application traffic continue through the configured local HTTPS endpoint.
    try {
        $reply = Invoke-WebRequest -Uri ($localUrl + '/api/health/ready') -SkipCertificateCheck -TimeoutSec 8
        return $reply.StatusCode -eq 200
    } catch { return $false }
}

if ($ProbeOnly) {
    $healthy = Test-ProductionLocalHealth
    $modelsReady=$null
    if($ModelConfig){
        $probe=& (Join-Path $PSScriptRoot 'start-model-transport-local.ps1') -ConfigFile $ModelConfig -ProbeOnly|ConvertFrom-Json
        $modelsReady=[bool]$probe.ready
    }
    $speechReady=$null
    if($SpeechConfig){$probe=& (Join-Path $PSScriptRoot 'start-model-transport-local.ps1') -ConfigFile $SpeechConfig -ProbeOnly|ConvertFrom-Json;$speechReady=[bool]$probe.ready}
    $result=[ordered]@{ healthy=$healthy; url=$localUrl; localModelsConfigured=[bool]$ModelConfig; localModelsReady=$modelsReady; changedServices=$false }
    if($SpeechConfig){$result.localSpeechReady=$speechReady}
    $agentReady=$null
    if($AgentModelConfig){$probe=& (Join-Path $PSScriptRoot 'start-model-transport-local.ps1') -ConfigFile $AgentModelConfig -ProbeOnly|ConvertFrom-Json;$agentReady=[bool]$probe.ready;$result.localAgentReady=$agentReady}
    $mediaReady=$null
    if($MediaConfig){$probe=& (Join-Path $PSScriptRoot 'start-model-transport-local.ps1') -ConfigFile $MediaConfig -ProbeOnly|ConvertFrom-Json;$mediaReady=[bool]$probe.ready;$result.localMediaReady=$mediaReady}
    $analysisReady=$null
    if($AnalysisConfig){$probe=& (Join-Path $PSScriptRoot 'start-media-analysis-local.ps1') -ConfigFile $AnalysisConfig -ProbeOnly|ConvertFrom-Json;$analysisReady=[bool]$probe.ready;$result.localAnalysisReady=$analysisReady}
    [pscustomobject]$result | ConvertTo-Json -Compress
    if (-not $healthy -or $modelsReady -eq $false -or $speechReady -eq $false -or $agentReady -eq $false -or $mediaReady -eq $false -or $analysisReady -eq $false) { exit 1 }
    exit 0
}

$createdKeepalive = Start-ProductionWslKeepalive
if ($KeepaliveOnly) {
    [pscustomobject]@{ keepaliveAvailable=$true; created=$createdKeepalive; changedCompose=$false } | ConvertTo-Json -Compress
    exit 0
}

# Start the already installed WSL engine when it is not yet running. No image,
# dependency or model is installed or downloaded by this launcher.
& $wslCommand.Source --user root --exec docker info --format '{{.ServerVersion}}' *> $null
if ($LASTEXITCODE -ne 0) {
    Invoke-ProductionLinux @('/bin/sh','-lc','if command -v dockerd >/dev/null 2>&1; then service docker start; else echo "请先启动本地 Docker 引擎。" >&2; exit 78; fi')
}

# An existing cluster may need longer crash recovery than Compose's dependency
# health window. Let PostgreSQL finish before starting the dependent services.
$databaseName='yingce-platform-production-postgres-1'
$databaseLabels=(& $wslCommand.Source --user root --exec docker inspect --format '{{json .Config.Labels}}' $databaseName 2>$null)-join ''
if($LASTEXITCODE -eq 0){
    $labels=$databaseLabels|ConvertFrom-Json
    if($labels.'com.docker.compose.project' -ne 'yingce-platform-production' -or $labels.'com.docker.compose.service' -ne 'postgres'){throw '同名数据库容器不属于当前本地项目，请核对容器来源。'}
    $state=((& $wslCommand.Source --user root --exec docker inspect --format '{{json .State}}' $databaseName)-join '')|ConvertFrom-Json
    if(-not $state.Running){Invoke-ProductionLinux @('docker','start',$databaseName)|Out-Null}
    $deadline=(Get-Date).AddMinutes(5)
    $announced=$false
    do{
        $raw=(& $wslCommand.Source --user root --exec docker inspect --format '{{json .State}}' $databaseName 2>$null)-join ''
        if($LASTEXITCODE -ne 0){throw '无法读取本地数据库恢复状态，请保留当前数据并检查运行日志。'}
        $state=$raw|ConvertFrom-Json
        if($state.Running -and $state.Health.Status -eq 'healthy'){break}
        if(-not $state.Running){throw '本地数据库在恢复期间停止，请检查 PostgreSQL 原始日志。'}
        if(-not $announced){Write-Host '正在等待本地数据库完成恢复。';$announced=$true}
        if((Get-Date)-ge $deadline){throw '本地数据库仍在恢复，请保留当前数据，核对日志后继续启动。'}
        Start-Sleep -Seconds 2
    }while($true)
}

$linuxRoot = (& $wslCommand.Source --user root --exec wslpath -a -u $repoRoot) -join ''
if ($LASTEXITCODE -ne 0 -or -not $linuxRoot.StartsWith('/')) { throw '无法解析仓库的 WSL 路径。' }
$linuxEnv = (& $wslCommand.Source --user root --exec wslpath -a -u $EnvFile) -join ''
if ($LASTEXITCODE -ne 0 -or -not $linuxEnv.StartsWith('/')) { throw '无法解析配置的 WSL 路径。' }
$composeArguments = @('docker','compose','--project-name','yingce-platform-production','--env-file',$linuxEnv)
foreach ($name in @('docker-compose.deploy.yml','docker-compose.build.yml','docker-compose.production-local.yml')) {
    if (-not (Test-Path -LiteralPath (Join-Path $repoRoot $name) -PathType Leaf)) { throw "缺少部署文件 $name" }
    $composeArguments += @('-f', ($linuxRoot.TrimEnd('/') + '/' + $name))
}
Write-Host '正在启动影策本地生产服务，并等待数据库、任务服务和网页就绪。'
Invoke-ProductionLinux ($composeArguments + @('up','-d','--no-build','--pull','never','--wait','--wait-timeout','180'))
if (-not (Test-ProductionLocalHealth)) { throw '服务尚未通过本地 HTTPS 就绪检查，请保留当前数据后检查容器状态。' }
$modelsReady=$null
if($ModelConfig){
    Write-Host '正在核对本地模型与容器连接，恢复缺失的私网转发。'
    $transport=& (Join-Path $PSScriptRoot 'start-model-transport-local.ps1') -ConfigFile $ModelConfig|ConvertFrom-Json
    if(-not $transport.ready){throw '本地模型连接尚未就绪，请检查 ComfyUI、Ollama 和私有运行日志。'}
    $modelsReady=$true
}
$result=[ordered]@{ healthy=$true; url=$localUrl; keepaliveCreated=$createdKeepalive; existingImagesUsed=$true; localModelsConfigured=[bool]$ModelConfig; localModelsReady=$modelsReady }
if($MediaConfig){
    Write-Host '正在核对离线声音工具与容器连接。'
    $transport=& (Join-Path $PSScriptRoot 'start-model-transport-local.ps1') -ConfigFile $MediaConfig|ConvertFrom-Json
    if(-not $transport.ready){throw '本地声音工具尚未就绪，请检查已安装权重和私有运行日志。'}
    $result.localMediaReady=$true
}
if($SpeechConfig){
    Write-Host '正在核对离线配音服务与容器连接。'
    $transport=& (Join-Path $PSScriptRoot 'start-model-transport-local.ps1') -ConfigFile $SpeechConfig|ConvertFrom-Json
    if(-not $transport.ready){throw '本地配音连接尚未就绪，请检查已安装权重和私有运行日志。'}
    $result.localSpeechReady=$true
}
if($AgentModelConfig){
    Write-Host '正在核对本地 Agent 服务及已校验的分词器。'
    $transport=& (Join-Path $PSScriptRoot 'start-model-transport-local.ps1') -ConfigFile $AgentModelConfig|ConvertFrom-Json
    if(-not $transport.ready){throw '本地 Agent 连接尚未就绪，请检查分词器和私有运行日志。'}
    $result.localAgentReady=$true
}
if($AnalysisConfig){
    Write-Host '正在核对本地节拍、参考视频与跟踪分析服务。'
    $analysis=& (Join-Path $PSScriptRoot 'start-media-analysis-local.ps1') -ConfigFile $AnalysisConfig|ConvertFrom-Json
    if(-not $analysis.ready){throw '本地分析尚未就绪，请检查已安装的运行时和私有日志。'}
    $result.localAnalysisReady=$true
}
[pscustomobject]$result | ConvertTo-Json -Compress
if (-not $NoBrowser) { Start-Process -FilePath ($localUrl + '/projects') }
