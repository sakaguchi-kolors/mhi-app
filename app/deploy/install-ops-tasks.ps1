#Requires -RunAsAdministrator
#Requires -Version 5.1
# Register backup / log-rotate / health-watch tasks, NSSM rotation, and service recovery.
param(
  [string]$AppRoot = 'C:\apps\mhi-app',
  [string]$BackupRoot = 'C:\apps\mhi-backup',
  [string]$ServiceName = 'MhiProgressApi',
  [int]$KeepDays = 60,
  [string]$BackupAt = '03:00',
  [string]$RotateAt = '00:15'
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Get-NssmExe {
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
    [System.Environment]::GetEnvironmentVariable('Path', 'User')
  $cmd = Get-Command nssm -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $fallback = 'C:\apps\nssm\nssm.exe'
  if (Test-Path $fallback) { return $fallback }
  return $null
}

function Register-DailyTask([string]$Name, [string]$ScriptPath, [string]$Arguments, [string]$At) {
  $arg = "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`" $Arguments"
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
  $trigger = New-ScheduledTaskTrigger -Daily -At $At
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
  Register-ScheduledTask -TaskName $Name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  Write-Host "  $Name daily $At"
}

function Register-RepeatingTask([string]$Name, [string]$ScriptPath, [string]$Arguments, [int]$EveryMinutes) {
  $arg = "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`" $Arguments"
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes $EveryMinutes) -RepetitionDuration (New-TimeSpan -Days 3650)
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $Name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  Write-Host "  $Name every ${EveryMinutes}m"
}

function Set-ServiceRecovery([string]$Name) {
  if (-not $Name) { return }
  if (-not (Get-Service -Name $Name -ErrorAction SilentlyContinue)) { return }
  & sc.exe failure $Name reset= 86400 actions= restart/10000/restart/30000/restart/60000 | Out-Null
  & sc.exe failureflag $Name 1 | Out-Null
  Write-Host "  recovery $Name"
}

$deployDir = $PSScriptRoot
$backupScript = Join-Path $deployDir 'backup-db.ps1'
$rotateScript = Join-Path $deployDir 'rotate-logs.ps1'
$watchScript = Join-Path $deployDir 'watch-health.ps1'
if (-not (Test-Path $backupScript)) { throw "missing: $backupScript" }
if (-not (Test-Path $rotateScript)) { throw "missing: $rotateScript" }
if (-not (Test-Path $watchScript)) { throw "missing: $watchScript" }

New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $AppRoot 'logs') -Force | Out-Null

Write-Step 'NSSM daily log rotate'
$nssm = Get-NssmExe
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($nssm -and $svc) {
  & $nssm set $ServiceName AppRotateFiles 1
  & $nssm set $ServiceName AppRotateSeconds 86400
  & $nssm set $ServiceName AppRotateOnline 1
  Write-Host "  $ServiceName AppRotateSeconds=86400 AppRotateOnline=1"
} elseif (-not $svc) {
  Write-Host "  skip NSSM: service $ServiceName not found" -ForegroundColor Yellow
} else {
  Write-Host '  skip NSSM: nssm.exe not found' -ForegroundColor Yellow
}

Write-Step 'Service recovery (restart on crash)'
Set-ServiceRecovery $ServiceName
Set-ServiceRecovery 'W3SVC'
$pgSvc = Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'postgresql*' } | Select-Object -First 1
if ($pgSvc) { Set-ServiceRecovery $pgSvc.Name }

Write-Step 'Event log source'
$sourceExists = $false
try { $sourceExists = [System.Diagnostics.EventLog]::SourceExists('MhiApp') } catch { $sourceExists = $false }
if (-not $sourceExists) {
  New-EventLog -LogName Application -Source 'MhiApp'
  Write-Host '  created Application/MhiApp'
} else {
  Write-Host '  Application/MhiApp exists'
}

Write-Step 'Scheduled tasks'
$backupArgs = "-AppRoot `"$AppRoot`" -BackupRoot `"$BackupRoot`" -KeepDays $KeepDays"
$rotateArgs = "-AppRoot `"$AppRoot`" -ServiceName `"$ServiceName`" -KeepDays $KeepDays"
$watchArgs = "-AppRoot `"$AppRoot`" -ServiceName `"$ServiceName`""
Register-DailyTask 'MhiApp-BackupDb' $backupScript $backupArgs $BackupAt
Register-DailyTask 'MhiApp-RotateLogs' $rotateScript $rotateArgs $RotateAt
Register-RepeatingTask 'MhiApp-WatchHealth' $watchScript $watchArgs 5

Write-Host "`nOps tasks installed." -ForegroundColor Green
Write-Host "  backup : $BackupRoot  (daily $BackupAt, keep $KeepDays days)"
Write-Host "  logs   : $(Join-Path $AppRoot 'logs')  (daily $RotateAt, keep $KeepDays days)"
Write-Host "  watch  : /api/health every 5 min (auto-restart, no external notify)"
Write-Host '  run now:  Start-ScheduledTask -TaskName MhiApp-BackupDb'
Write-Host '            Start-ScheduledTask -TaskName MhiApp-RotateLogs'
Write-Host '            Start-ScheduledTask -TaskName MhiApp-WatchHealth'
