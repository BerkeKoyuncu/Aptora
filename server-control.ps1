param(
  [ValidateSet('Start','Stop','Restart','Status','InstallTask','RemoveTask','EnableTask','DisableTask')]
  [string]$Action = 'Status'
)

$ErrorActionPreference = 'Stop'
$installDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $env:ProgramData 'Aptora'
$envFile = Join-Path $dataDir 'aptora.env'
$pidFile = Join-Path $dataDir 'aptora.pid'
$logDir = Join-Path $dataDir 'logs'
$nodeExe = Join-Path $installDir 'bin\node.exe'
$backendScript = Join-Path $installDir 'run-backend.bat'
$taskName = 'Aptora Server'

function Import-AptoraEnvironment {
  if (-not (Test-Path -LiteralPath $envFile)) { throw "Production configuration not found: $envFile" }
  foreach ($line in Get-Content -LiteralPath $envFile) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) { continue }
    $parts = $line.Split('=', 2)
    if ($parts.Count -eq 2) { [Environment]::SetEnvironmentVariable($parts[0], $parts[1], 'Process') }
  }
}

function Get-AptoraProcess {
  if (-not (Test-Path -LiteralPath $pidFile)) { return $null }
  $savedPid = 0
  if (-not [int]::TryParse((Get-Content -LiteralPath $pidFile -Raw).Trim(), [ref]$savedPid)) { return $null }
  $process = Get-Process -Id $savedPid -ErrorAction SilentlyContinue
  if (-not $process -or $process.ProcessName -ne 'node') { return $null }
  try {
    if (-not $process.Path -or
        [IO.Path]::GetFullPath($process.Path) -ne [IO.Path]::GetFullPath($nodeExe)) { return $null }
  } catch { return $null }
  return $process
}

function Rotate-Log([string]$path) {
  if ((Test-Path -LiteralPath $path) -and (Get-Item -LiteralPath $path).Length -gt 10MB) {
    $archive = "$path.1"
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
    Move-Item -LiteralPath $path -Destination $archive
  }
}

function Start-Aptora {
  $running = Get-AptoraProcess
  if ($running) { Write-Output "Aptora is already running (PID $($running.Id))."; return }
  if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile -Force }
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  $stdoutLog = Join-Path $logDir 'server-out.log'
  $stderrLog = Join-Path $logDir 'server-error.log'
  Rotate-Log $stdoutLog
  Rotate-Log $stderrLog
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($task) {
    Start-ScheduledTask -TaskName $taskName
  } else {
    Import-AptoraEnvironment
    Start-Process -FilePath $nodeExe -ArgumentList @('server/server.js') -WorkingDirectory $installDir `
      -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog | Out-Null
  }
  Start-Sleep -Seconds 3
  $process = Get-AptoraProcess
  if (-not $process) { throw "Aptora failed to start. Check $stderrLog" }
  Write-Output "Aptora started (PID $($process.Id))."
}

function Stop-Aptora {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($task -and $task.State -eq 'Running') {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
  }
  $running = Get-AptoraProcess
  if ($running) {
    Stop-Process -Id $running.Id -Force
    $running.WaitForExit(5000)
    Write-Output 'Aptora stopped.'
  } else { Write-Output 'Aptora is not running.' }
  if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile -Force }
}

function Install-AptoraTask {
  $taskAction = New-ScheduledTaskAction -Execute $env:ComSpec -Argument "/d /s /c `"`"$backendScript`"`""
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  Write-Output 'Automatic startup task installed.'
}

switch ($Action) {
  'Start' { Start-Aptora }
  'Stop' { Stop-Aptora }
  'Restart' { Stop-Aptora; Start-Aptora }
  'Status' { $p = Get-AptoraProcess; if ($p) { "RUNNING PID=$($p.Id)" } else { 'STOPPED' } }
  'InstallTask' { Install-AptoraTask }
  'RemoveTask' { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue; 'Automatic startup task removed.' }
  'EnableTask' { Enable-ScheduledTask -TaskName $taskName | Out-Null; 'Automatic startup enabled.' }
  'DisableTask' { Disable-ScheduledTask -TaskName $taskName | Out-Null; 'Automatic startup disabled.' }
}
