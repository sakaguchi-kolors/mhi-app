#Requires -RunAsAdministrator
#Requires -Version 5.1
# Register daily backup / log-rotate tasks and enable NSSM daily rotation.
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

$deployDir = $PSScriptRoot
$backupScript = Join-Path $deployDir 'backup-db.ps1'
$rotateScript = Join-Path $deployDir 'rotate-logs.ps1'
if (-not (Test-Path $backupScript)) { throw "missing: $backupScript" }
if (-not (Test-Path $rotateScript)) { throw "missing: $rotateScript" }

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

Write-Step 'Scheduled tasks'
$backupArgs = "-AppRoot `"$AppRoot`" -BackupRoot `"$BackupRoot`" -KeepDays $KeepDays"
$rotateArgs = "-AppRoot `"$AppRoot`" -ServiceName `"$ServiceName`" -KeepDays $KeepDays"
Register-DailyTask 'MhiApp-BackupDb' $backupScript $backupArgs $BackupAt
Register-DailyTask 'MhiApp-RotateLogs' $rotateScript $rotateArgs $RotateAt

Write-Host "`nOps tasks installed." -ForegroundColor Green
Write-Host "  backup : $BackupRoot  (daily $BackupAt, keep $KeepDays days)"
Write-Host "  logs   : $(Join-Path $AppRoot 'logs')  (daily $RotateAt, keep $KeepDays days)"
Write-Host '  run now:  Start-ScheduledTask -TaskName MhiApp-BackupDb'
Write-Host '            Start-ScheduledTask -TaskName MhiApp-RotateLogs'
