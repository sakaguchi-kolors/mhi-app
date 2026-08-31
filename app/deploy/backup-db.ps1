#Requires -Version 5.1
# PostgreSQL dump + sidecar files (.env / ingest JSON). Intended for Task Scheduler.
param(
  [string]$AppRoot = 'C:\apps\mhi-app',
  [string]$BackupRoot = 'C:\apps\mhi-backup',
  [int]$KeepDays = 60
)

$ErrorActionPreference = 'Stop'

function Get-EnvValue([string]$File, [string]$Key, [string]$Default = '') {
  if (-not (Test-Path $File)) { return $Default }
  foreach ($line in Get-Content $File) {
    if ($line -match "^\s*$Key\s*=\s*(.+)\s*$") {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return $Default
}

function Get-PgBinPath {
  foreach ($ver in @('18', '17', '16', '15')) {
    $bin = "C:\Program Files\PostgreSQL\$ver\bin"
    if (Test-Path (Join-Path $bin 'pg_dump.exe')) { return $bin }
  }
  $pgRoot = 'C:\Program Files\PostgreSQL'
  if (-not (Test-Path $pgRoot)) { return $null }
  foreach ($dir in Get-ChildItem $pgRoot -Directory | Sort-Object Name -Descending) {
    $bin = Join-Path $dir.FullName 'bin'
    if (Test-Path (Join-Path $bin 'pg_dump.exe')) { return $bin }
  }
  return $null
}

function Parse-DatabaseUrl([string]$Url) {
  if ($Url -match '^postgres(?:ql)?://([^:]+):([^@]+)@([^:/]+):?(\d*)/([^?]+)') {
    $port = $Matches[4]
    if (-not $port) { $port = '5432' }
    return @{
      User     = [uri]::UnescapeDataString($Matches[1])
      Password = [uri]::UnescapeDataString($Matches[2])
      Host     = $Matches[3]
      Port     = $port
      Database = $Matches[5].TrimEnd('/')
    }
  }
  throw "DATABASE_URL is not a postgresql URL: $Url"
}

function Write-Log([string]$Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  Write-Host $line
  $logDir = Join-Path $AppRoot 'logs'
  if (Test-Path $logDir) {
    Add-Content -Path (Join-Path $logDir 'ops-backup.log') -Value $line -Encoding UTF8
  }
}

$envFile = Join-Path $AppRoot 'app\backend\.env'
if (-not (Test-Path $envFile)) {
  throw ".env not found: $envFile"
}

$dbUrl = Get-EnvValue $envFile 'DATABASE_URL' ''
if (-not $dbUrl) { throw 'DATABASE_URL is empty in backend\.env' }
$conn = Parse-DatabaseUrl $dbUrl

$pgBin = Get-PgBinPath
if (-not $pgBin) { throw 'pg_dump.exe not found under C:\Program Files\PostgreSQL' }
$pgDump = Join-Path $pgBin 'pg_dump.exe'

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$dest = Join-Path $BackupRoot $stamp
New-Item -ItemType Directory -Path $dest -Force | Out-Null

$dumpFile = Join-Path $dest 'mop.dump'
Write-Log "dump start -> $dumpFile"

$env:PGPASSWORD = $conn.Password
try {
  & $pgDump -Fc --no-password -h $conn.Host -p $conn.Port -U $conn.User -d $conn.Database -f $dumpFile
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }
  if (-not (Test-Path $dumpFile) -or ((Get-Item $dumpFile).Length -le 0)) {
    throw "pg_dump produced an empty file: $dumpFile"
  }
} catch {
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  Write-Log "dump failed: $($_.Exception.Message)"
  throw
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Copy-Item $envFile (Join-Path $dest 'backend.env') -Force

$dataDir = Join-Path $AppRoot 'app\backend\data'
foreach ($name in @('ingest-schedule.json', 'ingest-job.json')) {
  $src = Join-Path $dataDir $name
  if (Test-Path $src) {
    Copy-Item $src (Join-Path $dest $name) -Force
  }
}

$dumpMb = [math]::Round((Get-Item $dumpFile).Length / 1MB, 1)
Write-Log "dump ok ${dumpMb}MB $dest"

$cutoff = (Get-Date).Date.AddDays(-$KeepDays)
$removed = 0
Get-ChildItem $BackupRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
  $dirDate = $null
  if ($_.Name -match '^(\d{4}-\d{2}-\d{2})_') {
    try { $dirDate = [datetime]::ParseExact($Matches[1], 'yyyy-MM-dd', $null) } catch { $dirDate = $null }
  }
  if (-not $dirDate) { $dirDate = $_.LastWriteTime.Date }
  if ($dirDate -lt $cutoff) {
    Remove-Item $_.FullName -Recurse -Force
    $removed++
  }
}
Write-Log "retention KeepDays=$KeepDays removed=$removed"
