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
$startupTimeoutSeconds = 45

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

function Get-AptoraPort {
  $aptoraPort = 9372
  if (-not (Test-Path -LiteralPath $envFile)) { return $aptoraPort }
  foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^PORT=(\d+)$') {
      $configuredPort = 0
      if ([int]::TryParse($Matches[1], [ref]$configuredPort) -and $configuredPort -ge 1 -and $configuredPort -le 65535) {
        return $configuredPort
      }
    }
  }
  return $aptoraPort
}

function Test-AptoraHealth {
  $aptoraPort = Get-AptoraPort
  try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:$aptoraPort/api/health" `
      -Method Get -TimeoutSec 2 -UseBasicParsing
    return $response.service -eq 'aptora' -and $response.status -eq 'ok'
  } catch {
    return $false
  }
}

function Wait-AptoraReady([int]$timeoutSeconds) {
  $deadline = [DateTime]::UtcNow.AddSeconds($timeoutSeconds)
  do {
    if (Test-AptoraHealth) { return $true }
    Start-Sleep -Milliseconds 500
  } while ([DateTime]::UtcNow -lt $deadline)
  return $false
}

function Rotate-Log([string]$path) {
  if ((Test-Path -LiteralPath $path) -and (Get-Item -LiteralPath $path).Length -gt 10MB) {
    $archive = "$path.1"
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
    Move-Item -LiteralPath $path -Destination $archive
  }
}

function Start-Aptora {
  if (Test-AptoraHealth) {
    $running = Get-AptoraProcess
    if ($running) { Write-Output "Aptora is already running (PID $($running.Id))." }
    else { Write-Output 'Aptora is already running.' }
    return
  }
  if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile -Force }
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  $stdoutLog = Join-Path $logDir 'server-out.log'
  $stderrLog = Join-Path $logDir 'server-error.log'
  Rotate-Log $stdoutLog
  Rotate-Log $stderrLog
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($task) {
    # Migrate a legacy task-wide disable without turning boot startup back on.
    if (-not $task.Settings.Enabled) {
      Install-AptoraTask
      $task = Get-ScheduledTask -TaskName $taskName
    }
    if ($task.State -ne 'Running') { Start-ScheduledTask -TaskName $taskName }
  } else {
    Import-AptoraEnvironment
    Start-Process -FilePath $nodeExe -ArgumentList @('server/server.js') -WorkingDirectory $installDir `
      -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog | Out-Null
  }
  if (-not (Wait-AptoraReady $startupTimeoutSeconds)) {
    $taskResult = ''
    if ($task) {
      $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue
      if ($taskInfo) { $taskResult = " Scheduled task result: $($taskInfo.LastTaskResult)." }
    }
    throw "Aptora did not become ready within $startupTimeoutSeconds seconds.$taskResult Check $stderrLog"
  }
  $process = Get-AptoraProcess
  if ($process) { Write-Output "Aptora started (PID $($process.Id))." }
  else { Write-Output 'Aptora started.' }
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
    $running.WaitForExit(5000) | Out-Null
    Write-Output 'Aptora stopped.'
  } else { Write-Output 'Aptora is not running.' }
  if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile -Force }
}

function Get-AptoraAutomaticStartup($task) {
  if (-not $task) { return $true }
  # Older Control Panels disabled the task itself to express this preference.
  if (-not $task.Settings.Enabled) { return $false }
  return @($task.Triggers | Where-Object {
    $_.CimClass.CimClassName -eq 'MSFT_TaskBootTrigger' -and $_.Enabled
  }).Count -gt 0
}

function Set-AptoraAutomaticStartup([bool]$enabled) {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if (-not $task) {
    Install-AptoraTask
    $task = Get-ScheduledTask -TaskName $taskName
  }
  $triggers = @($task.Triggers)
  $bootTriggers = @($triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskBootTrigger' })
  if ($bootTriggers.Count -eq 0) {
    $bootTriggers = @(New-ScheduledTaskTrigger -AtStartup)
    $triggers += $bootTriggers
  }
  foreach ($trigger in $bootTriggers) { $trigger.Enabled = $enabled }
  # Keep demand starts possible; changing a trigger does not stop a running instance.
  $settings = $task.Settings
  $settings.Enabled = $true
  $settings.AllowDemandStart = $true
  Set-ScheduledTask -TaskName $taskName -Trigger $triggers -Settings $settings | Out-Null
}

function Install-AptoraTask {
  $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  $taskAction = New-ScheduledTaskAction -Execute $env:ComSpec -Argument "/d /s /c `"`"$backendScript`"`""
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $trigger.Enabled = Get-AptoraAutomaticStartup $existingTask
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  # Always-on backend: no runtime deadline; retry failures at a bounded one-minute cadence.
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
  # Explicit XML duration also handles older ScheduledTasks providers that omit zero.
  $settings.ExecutionTimeLimit = 'PT0S'
  $settings.Enabled = $true
  $settings.AllowDemandStart = $true
  Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  Write-Output 'Automatic startup task installed.'
}

switch ($Action) {
  'Start' { Start-Aptora }
  'Stop' { Stop-Aptora }
  'Restart' { Stop-Aptora; Start-Aptora }
  'Status' {
    if (Test-AptoraHealth) {
      $p = Get-AptoraProcess
      if ($p) { "RUNNING PID=$($p.Id)" } else { 'RUNNING' }
    } else {
      $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
      if ($task -and $task.State -eq 'Running') { 'STARTING' } else { 'STOPPED' }
    }
  }
  'InstallTask' { Install-AptoraTask }
  'RemoveTask' { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue; 'Automatic startup task removed.' }
  'EnableTask' { Set-AptoraAutomaticStartup $true; 'Automatic startup enabled. Manual server control remains available.' }
  'DisableTask' { Set-AptoraAutomaticStartup $false; 'Automatic startup disabled. Manual server control remains available.' }
}
