# Non-mutating Windows regression checks. Uses real CIM settings/trigger objects
# with in-memory task registration and lifecycle doubles; no SYSTEM task is created.
$ErrorActionPreference = 'Stop'
Import-Module ScheduledTasks
$repoRoot = Split-Path -Parent $PSScriptRoot
$controlPath = Join-Path $repoRoot 'deployment\windows\server-control.ps1'
$qaTokens = $null
$qaErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($controlPath, [ref]$qaTokens, [ref]$qaErrors)
if ($qaErrors.Count) { throw ($qaErrors | Out-String) }
$functions = @('Get-AptoraAutomaticStartup', 'Set-AptoraAutomaticStartup', 'Install-AptoraTask', 'Start-Aptora', 'Stop-Aptora')
foreach ($definition in $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $false)) {
  if ($definition.Name -in $functions) { . ([scriptblock]::Create($definition.Extent.Text)) }
}
$taskName = 'Aptora Startup Preference QA'
$script:qaExpectedTaskName = $taskName
$backendScript = Join-Path $repoRoot 'deployment\windows\run-backend.bat'
$pidFile = Join-Path $repoRoot '.build\startup-preference-qa\absent.pid'
$logDir = Join-Path $repoRoot '.build\startup-preference-qa\logs'
$startupTimeoutSeconds = 1
$script:qaTask = $null
$script:qaEvents = @()
$script:qaChecks = 0
function Assert($condition, [string]$message) {
  if (-not $condition) { throw "FAIL: $message" }
  $script:qaChecks++
}
function Get-ScheduledTask {
  param($TaskName, $ErrorAction)
  Assert ($TaskName -eq $script:qaExpectedTaskName) 'QA task name'
  $script:qaTask
}
function Register-ScheduledTask {
  param($TaskName, $Action, $Trigger, $Principal, $Settings, [switch]$Force)
  Assert ($TaskName -eq $script:qaExpectedTaskName -and $Force) 'Single task registration with Force'
  $state = if ($script:qaTask -and $script:qaTask.State -eq 'Running') { 'Running' } else { 'Ready' }
  $script:qaTask = [pscustomobject]@{ State = $state; Actions = @($Action); Triggers = @($Trigger); Principal = $Principal; Settings = $Settings }
  $script:qaEvents += 'Register'
}
function Set-ScheduledTask {
  param($TaskName, $Trigger, $Settings)
  Assert ($TaskName -eq $script:qaExpectedTaskName) 'Single task update'
  $script:qaTask.Triggers = @($Trigger)
  $script:qaTask.Settings = $Settings
  $script:qaEvents += 'Update'
}
function Start-ScheduledTask {
  param($TaskName)
  Assert ($TaskName -eq $script:qaExpectedTaskName) 'Manual start target'
  Assert ($script:qaTask.Settings.Enabled -and $script:qaTask.Settings.AllowDemandStart) 'Manual start allowed'
  $script:qaTask.State = 'Running'
  $script:qaEvents += 'Start'
}
function Stop-ScheduledTask {
  param($TaskName, $ErrorAction)
  Assert ($TaskName -eq $script:qaExpectedTaskName) 'Manual stop target'
  $script:qaTask.State = 'Ready'
  $script:qaEvents += 'Stop'
}
function Test-AptoraHealth { $script:qaTask.State -eq 'Running' }
function Wait-AptoraReady { param($timeoutSeconds) Test-AptoraHealth }
function Get-AptoraProcess { $null }
function Rotate-Log { param($path) }
function Start-Sleep { param($Seconds, $Milliseconds) }
function Assert-Policy([bool]$startup) {
  Assert ($script:qaTask.Settings.Enabled) 'Task enabled'
  Assert ($script:qaTask.Settings.AllowDemandStart) 'Demand start allowed'
  Assert ((Get-AptoraAutomaticStartup $script:qaTask) -eq $startup) 'Startup preference preserved'
  Assert ($script:qaTask.Triggers.Count -eq 1 -and $script:qaTask.Triggers[0].CimClass.CimClassName -eq 'MSFT_TaskBootTrigger') 'Single AtStartup trigger'
  Assert ($script:qaTask.Triggers[0].Enabled -eq $startup) 'Boot-trigger Enabled stores preference'
  Assert ($script:qaTask.Settings.ExecutionTimeLimit -eq 'PT0S') 'Unlimited runtime retained'
  Assert ($script:qaTask.Settings.RestartCount -eq 999 -and $script:qaTask.Settings.RestartInterval -eq 'PT1M') 'Restart policy retained'
  Assert ($script:qaTask.Principal.UserId -eq 'SYSTEM' -and $script:qaTask.Principal.LogonType -eq 'ServiceAccount') 'SYSTEM retained'
}
Install-AptoraTask
Assert-Policy $true
foreach ($preference in @($true, $false)) {
  Stop-Aptora
  Set-AptoraAutomaticStartup $preference
  Assert-Policy $preference
  # Model Scheduler boot eligibility from the actual CIM trigger/settings.
  if ($script:qaTask.Settings.Enabled -and $script:qaTask.Triggers[0].Enabled) { Start-ScheduledTask -TaskName $taskName }
  Assert ((Test-AptoraHealth) -eq $preference) 'Boot starts only when preferred (simulated)'
  Stop-Aptora
  Start-Aptora
  Assert (Test-AptoraHealth) 'Manual Start works under either preference (mocked)'
  $before = $script:qaEvents.Count
  Start-Aptora
  Assert ($script:qaEvents.Count -eq $before) 'Already-running Start is idempotent'
  Set-AptoraAutomaticStartup (-not $preference)
  Assert (Test-AptoraHealth) 'Changing preference leaves the current instance running'
  Set-AptoraAutomaticStartup $preference
  Stop-Aptora
  Assert (-not (Test-AptoraHealth)) 'Manual Stop works under either preference (mocked)'
  Start-Aptora
  $script:qaEvents = @()
  Stop-Aptora
  Start-Aptora
  Assert (($script:qaEvents -join ',') -eq 'Stop,Start') 'Restart ordering works under either preference (mocked)'
  Stop-Aptora
  Install-AptoraTask
  Assert-Policy $preference
  Install-AptoraTask
  Assert-Policy $preference
  Start-Aptora
  Assert (Test-AptoraHealth) 'Manual Start works after repeated upgrade refreshes (mocked)'
}
Stop-Aptora
$script:qaTask.Settings.Enabled = $false
$script:qaTask.Triggers[0].Enabled = $true
$script:qaTask.State = 'Disabled'
Install-AptoraTask
Assert-Policy $false
Start-Aptora
Assert (Test-AptoraHealth) 'Legacy disabled task upgrade permits manual Start (mocked)'
Stop-Aptora
$script:qaTask.Settings.Enabled = $false
$script:qaTask.Triggers[0].Enabled = $true
$script:qaTask.State = 'Disabled'
Start-Aptora
Assert-Policy $false
Assert (Test-AptoraHealth) 'Manual Start repairs legacy disabled task without enabling boot (mocked)'
Stop-Aptora
$script:qaTask.Triggers = @()
Set-AptoraAutomaticStartup $false
Assert-Policy $false
$script:qaTask = $null
Set-AptoraAutomaticStartup $false
Assert-Policy $false
$extra = New-ScheduledTaskTrigger -Once -At ([DateTime]::Now.AddDays(1))
$script:qaTask.Triggers += $extra
Set-AptoraAutomaticStartup $true
Assert ($script:qaTask.Triggers.Count -eq 2 -and $script:qaTask.Triggers[1] -eq $extra) 'Preference update preserves non-boot triggers'
$panel = Get-Content (Join-Path $repoRoot 'deployment\windows\AptoraControlPanel.bat') -Raw
foreach ($action in @('EnableTask', 'DisableTask', 'Start', 'Stop', 'Restart')) {
  Assert ($panel.Contains('server-control.ps1" ' + $action)) "Existing Control Panel action $action retained"
}
Assert ($ast.Extent.Text.Contains("'EnableTask' { Set-AptoraAutomaticStartup `$true")) 'Enable action changes only startup preference'
Assert ($ast.Extent.Text.Contains("'DisableTask' { Set-AptoraAutomaticStartup `$false")) 'Disable action changes only startup preference'
Assert ($ast.Extent.Text.Contains("`$taskName = 'Aptora Server'")) 'Production task name unchanged'
Assert (-not $ast.Extent.Text.Contains('Disable-ScheduledTask')) 'Automatic-start disable no longer disables the whole task'
Write-Output "PASS: $script:qaChecks startup-preference checks (native CIM, in-memory Scheduler; no live task changes)."
