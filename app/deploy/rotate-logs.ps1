#Requires -Version 5.1
# API / IIS / PostgreSQL log retention. NSSM cuts API logs about every 24 hours;
# this script deletes files older than KeepDays (default 60 = 2 months).
param(
  [string]$AppRoot = 'C:\apps\mhi-app',
  [string]$ServiceName = 'MhiProgressApi',
  [int]$KeepDays = 60
)

$ErrorActionPreference = 'Stop'

function Write-Log([string]$Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  Write-Host $line
  $logDir = Join-Path $AppRoot 'logs'
  if (Test-Path $logDir) {
    Add-Content -Path (Join-Path $logDir 'ops-rotate.log') -Value $line -Encoding UTF8
  }
}

function Remove-OldFiles([string]$Dir, [string[]]$ProtectNames = @()) {
  if (-not (Test-Path $Dir)) { return 0 }
  $cutoff = (Get-Date).AddDays(-$KeepDays)
  $n = 0
  Get-ChildItem $Dir -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
    if ($ProtectNames -contains $_.Name) { return }
    if ($_.LastWriteTime -lt $cutoff) {
      Remove-Item $_.FullName -Force
      $n++
    }
  }
  return $n
}

function Archive-DailyLog([string]$Path) {
  if (-not (Test-Path $Path)) { return }
  $item = Get-Item $Path
  if ($item.Length -le 0) { return }
  if ($item.LastWriteTime.Date -ge (Get-Date).Date) { return }
  $day = $item.LastWriteTime.ToString('yyyy-MM-dd')
  $dest = Join-Path $item.DirectoryName ("{0}.{1}{2}" -f $item.BaseName, $day, $item.Extension)
  if (Test-Path $dest) {
    $dest = Join-Path $item.DirectoryName ("{0}.{1}-{2}{3}" -f $item.BaseName, $day, (Get-Date -Format 'HHmmss'), $item.Extension)
  }
  Move-Item $Path $dest -Force
}

$logDir = Join-Path $AppRoot 'logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

foreach ($name in @('ops-backup.log', 'ops-rotate.log', 'ops-watch.log')) {
  Archive-DailyLog (Join-Path $logDir $name)
}

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
  Write-Log "$ServiceName $($svc.Status)"
}

$apiRemoved = Remove-OldFiles $logDir @('api.out.log', 'api.err.log', 'ops-backup.log', 'ops-rotate.log', 'ops-watch.log', 'ops-watch-state.json')
Write-Log "api logs removed=$apiRemoved dir=$logDir"

$iisRoot = Join-Path $env:SystemDrive 'inetpub\logs\LogFiles'
$iisRemoved = 0
if (Test-Path $iisRoot) {
  Get-ChildItem $iisRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $iisRemoved += Remove-OldFiles $_.FullName
  }
}
Write-Log "iis logs removed=$iisRemoved"

$pgRemoved = 0
$pgRoot = 'C:\Program Files\PostgreSQL'
if (Test-Path $pgRoot) {
  Get-ChildItem $pgRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    foreach ($rel in @('data\log', 'log')) {
      $pgRemoved += Remove-OldFiles (Join-Path $_.FullName $rel)
    }
  }
}
Write-Log "postgres logs removed=$pgRemoved KeepDays=$KeepDays"
