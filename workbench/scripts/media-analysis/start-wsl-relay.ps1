param(
    [Parameter(Mandatory=$true)][string]$Python,
    [Parameter(Mandatory=$true)][string]$Directory,
    [ValidateRange(1024,65535)][int]$WorkerPort=13005,
    [ValidateRange(1024,65535)][int]$WindowsPort=18004,
    [ValidateRange(1024,65535)][int]$DockerPort=18003
)
$ErrorActionPreference='Stop'
$repo=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$directoryPath=[IO.Path]::GetFullPath($Directory)
$marker=Join-Path $directoryPath '.yingce-worker-owner.json'
if(-not(Test-Path -LiteralPath $marker -PathType Leaf)){throw 'Start the owned CPU worker first'}
$owner=Get-Content -LiteralPath $marker -Raw|ConvertFrom-Json
if([IO.Path]::GetFullPath($owner.repository) -ne $repo -or [IO.Path]::GetFullPath($owner.directory) -ne $directoryPath -or $owner.port -ne $WorkerPort){throw 'CPU worker ownership does not match'}
$gatewayText=(wsl -u root -e ip -4 route show default)-join ' '
$dockerText=(wsl -u root -e ip -4 -o addr show docker0)-join ' '
$gateway=[regex]::Match($gatewayText,'via (\d+(?:\.\d+){3})').Groups[1].Value
$dockerAddress=[regex]::Match($dockerText,'inet (\d+(?:\.\d+){3})/').Groups[1].Value
if(-not $gateway -or -not $dockerAddress){throw 'WSL or Docker private interface unavailable'}
if(-not(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -eq $gateway -and $_.InterfaceAlias -like '*WSL*'})){throw 'Refusing to bind outside the Windows WSL interface'}
$relay=Join-Path $repo 'model-gateway/private_relay.py'
$statePath=Join-Path $directoryPath '.analysis-relay-state.json'
$previous=if(Test-Path -LiteralPath $statePath){Get-Content -LiteralPath $statePath -Raw|ConvertFrom-Json}else{$null}
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$existing=Get-NetTCPConnection -State Listen -LocalAddress $gateway -LocalPort $WindowsPort -ErrorAction SilentlyContinue
if($existing){
    $process=Get-CimInstance Win32_Process -Filter "ProcessId = $($existing[0].OwningProcess)"
    if(-not $previous -or $process.ProcessId -ne $previous.windowsPID -or -not $process.CommandLine.Contains('private_relay.py') -or -not $process.CommandLine.Contains("--upstream-port $WorkerPort")){throw 'Windows relay port belongs to another process'}
    $windowsPID=$process.ProcessId
}else{
    $process=Start-Process -FilePath $Python -ArgumentList @('-X','utf8','-B',('"'+$relay+'"'),'--listen',$gateway,'--port',$WindowsPort,'--upstream','127.0.0.1','--upstream-port',$WorkerPort) -WorkingDirectory $repo -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $directoryPath "relay-windows-$stamp.log") -RedirectStandardError (Join-Path $directoryPath "relay-windows-$stamp.err")
    $windowsPID=$process.Id
}
$linuxScript=((& wsl -u root -e wslpath -a $relay)-join '').Trim()
if(-not $linuxScript.StartsWith('/mnt/')){throw 'Relay path did not resolve to this workspace'}
$linuxRunning=$null
if($previous){
    $candidate=Get-CimInstance Win32_Process -Filter "ProcessId = $($previous.linuxHostPID)"
    if($candidate -and $candidate.Name -eq 'wsl.exe' -and $candidate.CommandLine.Contains($linuxScript) -and $candidate.CommandLine.Contains("--listen $dockerAddress") -and $candidate.CommandLine.Contains("--port $DockerPort")){$linuxRunning=$candidate}
}
$portText=((& wsl -u root -e ss -H -ltn "sport = :$DockerPort")-join ' ').Trim()
if($portText -and -not $linuxRunning){throw 'Linux relay port already belongs to an unverified process'}
if(-not $linuxRunning){
    $linuxRunning=Start-Process -FilePath 'wsl.exe' -ArgumentList @('-u','root','-e','python3','-B',$linuxScript,'--listen',$dockerAddress,'--port',$DockerPort,'--upstream',$gateway,'--upstream-port',$WindowsPort) -WorkingDirectory $repo -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $directoryPath "relay-linux-$stamp.log") -RedirectStandardError (Join-Path $directoryPath "relay-linux-$stamp.err")
    $linuxPID=$linuxRunning.Id
}else{$linuxPID=$linuxRunning.ProcessId}
[ordered]@{repository=$repo;windowsPID=$windowsPID;linuxHostPID=$linuxPID;windowsAddress=$gateway;dockerAddress=$dockerAddress;windowsPort=$WindowsPort;dockerPort=$DockerPort;workerPort=$WorkerPort}|ConvertTo-Json|Set-Content -LiteralPath $statePath -Encoding utf8
$deadline=(Get-Date).AddSeconds(15);$reachable=$false
do{
    $result=(& wsl -u root -e python3 -c "import urllib.request,json; d=json.load(urllib.request.urlopen('http://${dockerAddress}:$DockerPort/health',timeout=2)); assert d['status']=='ok'; print('ready')" 2>$null)-join ''
    if($LASTEXITCODE -eq 0 -and $result -eq 'ready'){$reachable=$true;break}
    Start-Sleep -Milliseconds 500
}while((Get-Date)-lt $deadline)
if(-not $reachable){throw 'CPU relay is not reachable; owned processes retained for diagnosis'}
[pscustomobject]@{Ready=$true;BaseURL="http://host.docker.internal:$DockerPort";WindowsPID=$windowsPID;LinuxHostPID=$linuxPID;PublicListener=$false}|ConvertTo-Json
