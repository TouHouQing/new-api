#Requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ConfigFile,[switch]$ProbeOnly)

$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$configPath=(Resolve-Path -LiteralPath $ConfigFile).Path
$configDirectory=Split-Path -Parent $configPath
$config=Get-Content -LiteralPath $configPath -Raw|ConvertFrom-Json
$allowed=@('version','python','moduleDirectory','receiptDirectory','gatewayPort','windowsRelayPort','dockerRelayPort','comfyUrl','ollamaUrl','textModel','asrPython','asrModelDirectory','agentTokenizerDirectory','targetedCancel','speechOnly','speechPython','speechModelDirectory','speechFFmpeg','agentOnly','mediaOnly','mediaPython','mediaModel','mediaFFmpeg','lipSyncModelDirectory')
if($config.version -ne 1 -or @($config.PSObject.Properties.Name|Where-Object {$_ -notin $allowed}).Count){throw '本地模型配置格式不正确。'}
foreach($field in @('gatewayPort','windowsRelayPort','dockerRelayPort')){
 if($config.$field -isnot [long] -and $config.$field -isnot [int]){throw "本地模型配置缺少端口：$field"}
 if($config.$field -lt 1024 -or $config.$field -gt 65535){throw '本地模型端口必须在 1024–65535 之间。'}
}
if(@($config.gatewayPort,$config.windowsRelayPort,$config.dockerRelayPort|Select-Object -Unique).Count -ne 3){throw '本地模型的三个端口不能重复。'}
foreach($field in @('comfyUrl','ollamaUrl')){
 $url=$null
 if(-not [Uri]::TryCreate($config.$field,[UriKind]::Absolute,[ref]$url) -or $url.Scheme -ne 'http' -or $url.Host -notin @('127.0.0.1','localhost','[::1]') -or $url.UserInfo -or $url.Query -or $url.Fragment -or $url.AbsolutePath -ne '/'){throw 'ComfyUI 与 Ollama 地址必须是无凭据的本机 HTTP 根地址。'}
}
if(-not $config.textModel -or $config.textModel.Length -gt 200 -or $config.textModel -match '[\r\n]'){throw '请配置已安装的本地文本模型。'}
$python=(Resolve-Path -LiteralPath $config.python).Path
if(-not(Test-Path -LiteralPath $python -PathType Leaf)){throw '配置的 Python 不存在；启动器不会安装运行时。'}
if($config.moduleDirectory -and (-not [IO.Path]::IsPathFullyQualified($config.moduleDirectory) -or -not(Test-Path -LiteralPath $config.moduleDirectory -PathType Container))){throw '已配置的 Python 依赖目录不存在。'}
$receiptDirectory=[IO.Path]::GetFullPath($config.receiptDirectory)
if(-not [IO.Path]::IsPathFullyQualified($config.receiptDirectory)){throw '回执目录必须使用绝对路径。'}
foreach($field in @('asrPython','asrModelDirectory','agentTokenizerDirectory')){
 if($config.$field -and -not(Test-Path -LiteralPath $config.$field)){throw "已配置的本地依赖不存在：$field"}
}
if($null -ne $config.PSObject.Properties['speechOnly'] -and $config.speechOnly -isnot [bool]){throw 'speechOnly 必须为布尔值。'}
if($null -ne $config.PSObject.Properties['agentOnly'] -and $config.agentOnly -isnot [bool]){throw 'agentOnly 必须为布尔值。'}
if($null -ne $config.PSObject.Properties['mediaOnly'] -and $config.mediaOnly -isnot [bool]){throw 'mediaOnly 必须为布尔值。'}
if(@(@($config.speechOnly,$config.agentOnly,$config.mediaOnly)|Where-Object {$_ -eq $true}).Count -gt 1){throw '配音、Agent 与声音工具须使用独立的配置和端口。'}
if($config.agentOnly -and ($config.speechOnly -or -not $config.agentTokenizerDirectory)){throw 'Agent 连接必须配置经过校验的分词器，并使用独立的文本服务。'}
if($config.speechOnly){
 foreach($field in @('speechPython','speechModelDirectory','speechFFmpeg')){if(-not $config.$field -or -not(Test-Path -LiteralPath $config.$field)){throw "本地配音依赖不存在：$field"}}
}
if($config.mediaOnly){foreach($field in @('mediaPython','mediaModel','mediaFFmpeg')){if(-not $config.$field -or -not(Test-Path -LiteralPath $config.$field -PathType Leaf)){throw "本地声音工具依赖不存在：$field"}}}
if($config.lipSyncModelDirectory -and (-not $config.mediaOnly -or -not [IO.Path]::IsPathFullyQualified($config.lipSyncModelDirectory) -or -not(Test-Path -LiteralPath (Join-Path $config.lipSyncModelDirectory 'musetalk/models/unet.py') -PathType Leaf))){throw '口型处理须使用声音工具配置及已有的本地 MuseTalk 目录。'}
$gatewayScript=Join-Path $repo $(if($config.mediaOnly){'model-gateway/media_gateway.py'}elseif($config.speechOnly){'model-gateway/audio_gateway.py'}else{'model-gateway/gateway.py'})
$relayScript=Join-Path $repo 'model-gateway/private_relay.py'
$statePath=Join-Path $configDirectory $(if($config.mediaOnly){'.local-media-state.json'}elseif($config.speechOnly){'.local-speech-state.json'}elseif($config.agentOnly){'.local-agent-state.json'}else{'.local-model-state.json'})
$previous=if(Test-Path -LiteralPath $statePath){Get-Content -LiteralPath $statePath -Raw|ConvertFrom-Json}else{$null}
if($previous -and [IO.Path]::GetFullPath($previous.repository) -ne $repo){throw '本地模型运行记录属于其他仓库。'}
if($previous -and ($previous.gatewayPort -ne $config.gatewayPort -or $previous.windowsPort -ne $config.windowsRelayPort -or $previous.dockerPort -ne $config.dockerRelayPort)){throw '已有连接记录使用不同端口；请为新的端口组合使用独立配置目录。'}
function Invoke-ModelLinux([string[]]$Arguments){
 $result=(& wsl.exe --user root --exec @Arguments 2>$null)-join "`n"
 if($LASTEXITCODE -ne 0){throw '本地模型私网连接检查失败；请检查 WSL 与 Docker。'}
 return $result.Trim()
}
function Read-GatewayHealth([string]$Address){
 try{
  $reply=Invoke-RestMethod -Uri ($Address+'/api/health') -TimeoutSec 5
  if($config.mediaOnly){if($reply.media -isnot [bool] -or $reply.targeted_cancel -isnot [bool]){return $null}}
  elseif($config.speechOnly){if($reply.speech -isnot [bool] -or $reply.targeted_cancel -isnot [bool]){return $null}}
  elseif($reply.comfyui -isnot [bool] -or $reply.ollama -isnot [bool] -or $reply.targeted_cancel -isnot [bool]){return $null}
  if($config.agentOnly -and $reply.agent_tokenizer_ready -isnot [bool]){return $null}
  return $reply
 }catch{return $null}
}
function Test-ConfiguredModelReady($Value){
 if($null -eq $Value){return $false}
 if($config.mediaOnly){return $Value.media -eq $true -and (-not $config.lipSyncModelDirectory -or $Value.lip_sync -eq $true)}
 if($config.speechOnly){return $Value.speech -eq $true}
 if($config.agentOnly -and $Value.agent_tokenizer_ready -ne $true){return $false}
 return $Value.comfyui -eq $true -and $Value.ollama -eq $true
}
$route=Invoke-ModelLinux @('ip','-4','route','show','default')
$bridge=Invoke-ModelLinux @('ip','-4','-o','addr','show','docker0')
$windowsAddress=[regex]::Match($route,'via (\d+(?:\.\d+){3})').Groups[1].Value
$dockerAddress=[regex]::Match($bridge,'inet (\d+(?:\.\d+){3})/').Groups[1].Value
if(-not $windowsAddress -or -not $dockerAddress -or -not(Get-NetIPAddress -AddressFamily IPv4|Where-Object {$_.IPAddress -eq $windowsAddress -and $_.InterfaceAlias -like '*WSL*'})){throw '无法确认 WSL 与 Docker 的私网接口。'}
$gatewayUrl="http://127.0.0.1:$($config.gatewayPort)"
function Test-ModelTransport {
 try{
  $predicate=if($config.mediaOnly){"isinstance(d.get('media'),bool) and isinstance(d.get('targeted_cancel'),bool)"}elseif($config.speechOnly){"isinstance(d.get('speech'),bool) and isinstance(d.get('targeted_cancel'),bool)"}else{"isinstance(d.get('comfyui'),bool) and isinstance(d.get('ollama'),bool) and isinstance(d.get('targeted_cancel'),bool)"}
  $command="import json,urllib.request; d=json.load(urllib.request.urlopen('http://${dockerAddress}:$($config.dockerRelayPort)/api/health',timeout=3)); assert $predicate; print(json.dumps(d))"
  return (Invoke-ModelLinux @('python3','-c',$command))|ConvertFrom-Json
 }catch{return $null}
}
if($ProbeOnly){
 $health=Read-GatewayHealth $gatewayUrl;$transport=Test-ModelTransport
 $ready=(Test-ConfiguredModelReady $health) -and (Test-ConfiguredModelReady $transport)
 if($config.speechOnly){[pscustomobject]@{ready=[bool]$ready;gatewayReady=($null -ne $health);transportReady=($null -ne $transport);speech=[bool]$health.speech;changedServices=$false;publicListener=$false}|ConvertTo-Json -Compress;if(-not $ready){exit 1};exit 0}
 [pscustomobject]@{ready=[bool]$ready;gatewayReady=($null -ne $health);transportReady=($null -ne $transport);comfyui=[bool]$health.comfyui;ollama=[bool]$health.ollama;changedServices=$false;publicListener=$false}|ConvertTo-Json -Compress
 if(-not $ready){exit 1};exit 0
}
if(-not(Test-Path -LiteralPath $receiptDirectory)){New-Item -ItemType Directory -Path $receiptDirectory|Out-Null}
$logDirectory=Join-Path $configDirectory 'model-transport-logs';New-Item -ItemType Directory -Force -Path $logDirectory|Out-Null
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss-fff'
function Start-ModelProcess([string]$File,[string[]]$Arguments,[string]$Name){
 if($config.speechOnly){$Name='speech-'+$Name}
 elseif($config.agentOnly){$Name='agent-'+$Name}
 return Start-Process -FilePath $File -ArgumentList $Arguments -WorkingDirectory $repo -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory "$Name-$stamp.log") -RedirectStandardError (Join-Path $logDirectory "$Name-$stamp.err")
}
$windowsPID=if($previous){$previous.windowsPID}else{0}
$linuxHostPID=if($previous){$previous.linuxHostPID}else{0}
function Save-ModelOwner([string]$Stage){
 [ordered]@{repository=$repo;stage=$Stage;gatewayPID=$gatewayPID;gatewayOwned=[bool]$gatewayOwned;windowsPID=$windowsPID;linuxHostPID=$linuxHostPID;windowsAddress=$windowsAddress;dockerAddress=$dockerAddress;gatewayPort=$config.gatewayPort;windowsPort=$config.windowsRelayPort;dockerPort=$config.dockerRelayPort;receiptDirectory=$receiptDirectory}|ConvertTo-Json|Set-Content -LiteralPath $statePath -Encoding utf8
}
$health=Read-GatewayHealth $gatewayUrl
$gatewayOwned=$false;$createdGateway=$false
$listener=@(Get-NetTCPConnection -State Listen -LocalPort $config.gatewayPort -ErrorAction SilentlyContinue)
if($listener.Count){
 if(@($listener|Where-Object {$_.LocalAddress -ne '127.0.0.1'}).Count -or $listener.Count -ne 1){throw '模型网关端口存在其他监听器，请核对后重试。'}
 $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listener[0].OwningProcess)
 if(-not $health -or $process.ExecutablePath -ne $python -or -not $process.CommandLine.Contains('gateway.py')){throw '模型网关端口被无法确认的服务占用；未停止或替换它。'}
 $gatewayPID=$process.ProcessId
 $gatewayOwned=$previous -and $previous.gatewayOwned -and $previous.gatewayPID -eq $gatewayPID -and $process.CommandLine.Contains($gatewayScript)
}else{
 $environment=@{PYTHONPATH=[string]$config.moduleDirectory;MODEL_GATEWAY_PORT=[string]$config.gatewayPort;MODEL_RECEIPT_DIR=$receiptDirectory;COMFY_URL=$config.comfyUrl.TrimEnd('/');OLLAMA_URL=$config.ollamaUrl.TrimEnd('/');TEXT_MODEL=$config.textModel;MODEL_GATEWAY_TARGETED_CANCEL=$(if($config.targetedCancel -eq $true){'1'}else{'0'});ASR_PYTHON=[string]$config.asrPython;ASR_MODEL_DIR=[string]$config.asrModelDirectory;AGENT_TOKENIZER_DIR=[string]$config.agentTokenizerDirectory}
 if($config.speechOnly){$environment.SPEECH_PYTHON=[string]$config.speechPython;$environment.SPEECH_MODEL_DIR=[string]$config.speechModelDirectory;$environment.SPEECH_FFMPEG=[string]$config.speechFFmpeg}
 if($config.mediaOnly){$environment.MEDIA_PYTHON=[string]$config.mediaPython;$environment.MEDIA_MODEL=[string]$config.mediaModel;$environment.MEDIA_FFMPEG=[string]$config.mediaFFmpeg;$environment.LIP_SYNC_MODEL_DIR=[string]$config.lipSyncModelDirectory}
 $saved=@{}
 try{
  foreach($name in $environment.Keys){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process');[Environment]::SetEnvironmentVariable($name,$environment[$name],'Process')}
  $process=Start-ModelProcess $python @('-X','utf8','-B',('"'+$gatewayScript+'"')) 'gateway';$gatewayPID=$process.Id;$gatewayOwned=$true;$createdGateway=$true
 }finally{foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}}
 $deadline=(Get-Date).AddSeconds(25)
 do{$health=Read-GatewayHealth $gatewayUrl;if($health){break};if($process.HasExited){throw '本地模型网关启动失败，请查看私有运行日志。'};Start-Sleep -Milliseconds 300}while((Get-Date)-lt $deadline)
 if(-not $health){throw '本地模型网关未就绪，原回执和诊断日志已保留。'}
}
Save-ModelOwner 'gateway'
if(-not(Test-ConfiguredModelReady $health)){if($config.mediaOnly){throw '离线声音分离模型、校验值或运行依赖尚未就绪。'}elseif($config.speechOnly){throw '离线配音模型或运行依赖尚未就绪。'}elseif($config.agentOnly){throw '本地 Agent 分词器未就绪或与当前模型不匹配，请核对校验文件。'}else{throw '请先启动 ComfyUI 与 Ollama，再重新运行本地生产启动器。'}}
$windowsPort=$config.windowsRelayPort;$dockerPort=$config.dockerRelayPort
$windowsListener=@(Get-NetTCPConnection -State Listen -LocalAddress $windowsAddress -LocalPort $windowsPort -ErrorAction SilentlyContinue)
$createdWindows=$false;$createdLinux=$false
if($windowsListener.Count){
 $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$windowsListener[0].OwningProcess)
 $legacy=Join-Path $configDirectory '.windows-relay-pid'
 $expected=if($previous){$previous.windowsPID}elseif(Test-Path -LiteralPath $legacy){[int](Get-Content -LiteralPath $legacy)}else{0}
 if($windowsListener.Count -ne 1 -or $process.ProcessId -ne $expected -or $process.ExecutablePath -ne $python -or -not $process.CommandLine.Contains('private_relay.py') -or -not $process.CommandLine.Contains("--listen $windowsAddress") -or -not $process.CommandLine.Contains("--upstream-port $($config.gatewayPort)")){throw 'Windows 私网转发端口属于其他进程；未停止或替换它。'}
 $windowsPID=$process.ProcessId
}else{$process=Start-ModelProcess $python @('-X','utf8','-B',('"'+$relayScript+'"'),'--listen',$windowsAddress,'--port',$windowsPort,'--upstream','127.0.0.1','--upstream-port',$config.gatewayPort) 'windows-relay';$windowsPID=$process.Id;$createdWindows=$true}
Save-ModelOwner 'windows-relay'
$linuxScript=Invoke-ModelLinux @('wslpath','-a','-u',$relayScript)
$linuxRunning=$null;$legacy=Join-Path $configDirectory '.linux-relay-host-pid'
$expected=if($previous){$previous.linuxHostPID}elseif(Test-Path -LiteralPath $legacy){[int](Get-Content -LiteralPath $legacy)}else{0}
if($expected){
 $candidate=Get-CimInstance Win32_Process -Filter ('ProcessId='+$expected)
 if($candidate -and $candidate.Name -eq 'wsl.exe' -and $candidate.CommandLine.Contains($linuxScript) -and $candidate.CommandLine.Contains("--listen $dockerAddress") -and $candidate.CommandLine.Contains("--port $dockerPort") -and $candidate.CommandLine.Contains("--upstream $windowsAddress") -and $candidate.CommandLine.Contains("--upstream-port $windowsPort")){$linuxRunning=$candidate}
}
$bound=Invoke-ModelLinux @('ss','-H','-ltn',"sport = :$dockerPort")
if($bound -and -not $linuxRunning){throw 'Linux 私网转发端口属于无法确认的进程；未停止或替换它。'}
if(-not $linuxRunning){$process=Start-ModelProcess 'wsl.exe' @('--user','root','--exec','python3','-B',('"'+$linuxScript+'"'),'--listen',$dockerAddress,'--port',$dockerPort,'--upstream',$windowsAddress,'--upstream-port',$windowsPort) 'linux-relay';$linuxHostPID=$process.Id;$createdLinux=$true}else{$linuxHostPID=$linuxRunning.ProcessId}
# Persist ownership before the final probe so a failed startup can be retried
# without abandoning its already-created processes or touching other services.
Save-ModelOwner 'linux-relay'
$deadline=(Get-Date).AddSeconds(15);$transport=$null
do{$transport=Test-ModelTransport;if(Test-ConfiguredModelReady $transport){break};Start-Sleep -Milliseconds 300}while((Get-Date)-lt $deadline)
if(-not(Test-ConfiguredModelReady $transport)){throw '容器到本地模型的私网连接尚未就绪；请保留回执并检查私有运行日志。'}
Save-ModelOwner 'ready'
if($config.mediaOnly){[pscustomobject]@{ready=$true;gatewayReady=$true;transportReady=$true;media=$true;gatewayCreated=$createdGateway;windowsRelayCreated=$createdWindows;linuxRelayCreated=$createdLinux;publicListener=$false;baseURL="http://host.docker.internal:$dockerPort"}|ConvertTo-Json -Compress;exit 0}
if($config.speechOnly){[pscustomobject]@{ready=$true;gatewayReady=$true;transportReady=$true;speech=$true;gatewayCreated=$createdGateway;windowsRelayCreated=$createdWindows;linuxRelayCreated=$createdLinux;publicListener=$false;baseURL="http://host.docker.internal:$dockerPort"}|ConvertTo-Json -Compress;exit 0}
[pscustomobject]@{ready=$true;gatewayReady=$true;transportReady=$true;comfyui=$transport.comfyui;ollama=$transport.ollama;gatewayCreated=$createdGateway;windowsRelayCreated=$createdWindows;linuxRelayCreated=$createdLinux;publicListener=$false;baseURL="http://host.docker.internal:$dockerPort"}|ConvertTo-Json -Compress
