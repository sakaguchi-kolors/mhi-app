#Requires -Version 5.1
# Auto-recover stopped services. Restart API only when the process is down or DB is down.
# Timeouts during ETL are ignored so a long ingest is not killed.
param(
  [string]$AppRoot = 'C:\apps\mhi-app',
  [string]$ServiceName = 'MhiProgressApi',
  [int]$FailThreshold = 3,
  [int]$CooldownMinutes = 10,
  [int]$TimeoutSec = 10
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

function Write-Log([string]$Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  Write-Host $line
  $logDir = Join-Path $AppRoot 'logs'
  if (Test-Path $logDir) {
    Add-Content -Path (Join-Path $logDir 'ops-watch.log') -Value $line -Encoding UTF8
  }
}

function Write-AppEvent([int]$EventId, [string]$EntryType, [string]$Message) {
  try {
    Write-EventLog -LogName Application -Source 'MhiApp' -EventId $EventId -EntryType $EntryType -Message $Message
  } catch {
    # Source is registered by install-ops-tasks.ps1. Ignore if missing.
  }
}

function Get-WatchState([string]$Path) {
  if (-not (Test-Path $Path)) {
    return [pscustomobject]@{ failCount = 0; lastRestartAt = $null }
  }
  try {
    return (Get-Content $Path -Raw | ConvertFrom-Json)
  } catch {
    return [pscustomobject]@{ failCount = 0; lastRestartAt = $null }
  }
}

function Save-WatchState([string]$Path, $State) {
  $json = @{
    failCount      = [int]$State.failCount
    lastRestartAt  = $State.lastRestartAt
    lastResult     = $State.lastResult
    updatedAt      = (Get-Date).ToString('o')
  } | ConvertTo-Json
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($Path, $json, $utf8)
}

function Test-IngestRunning([string]$Root) {
  $jobFile = Join-Path $Root 'app\backend\data\ingest-job.json'
  if (-not (Test-Path $jobFile)) { return $false }
  try {
    $jobs = Get-Content $jobFile -Raw | ConvertFrom-Json
    return $jobs.current.state -eq 'running'
  } catch {
    return $false
  }
}

function Ensure-ServiceRunning([string]$Name) {
  if (-not $Name) { return $false }
  $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if (-not $svc) { return $false }
  if ($svc.Status -eq 'Running') { return $false }
  Write-Log "start stopped service $Name ($($svc.Status))"
  Start-Service -Name $Name -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  $after = Get-Service -Name $Name
  if ($after.Status -eq 'Running') {
    Write-AppEvent 2003 'Warning' "Started stopped service $Name"
    Write-Log "started $Name"
    return $true
  }
  Write-Log "failed to start $Name ($($after.Status))"
  Write-AppEvent 2003 'Error' "Failed to start service $Name ($($after.Status))"
  return $false
}

function Get-PostgresServiceName {
  $hit = Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'postgresql*' } | Select-Object -First 1
  if ($hit) { return $hit.Name }
  return $null
}

$logDir = Join-Path $AppRoot 'logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$statePath = Join-Path $logDir 'ops-watch-state.json'
$envFile = Join-Path $AppRoot 'app\backend\.env'
$apiPort = Get-EnvValue $envFile 'API_PORT' '8787'
$healthUrl = "http://127.0.0.1:$apiPort/api/health"

Ensure-ServiceRunning (Get-PostgresServiceName) | Out-Null
Ensure-ServiceRunning 'W3SVC' | Out-Null
Ensure-ServiceRunning $ServiceName | Out-Null

$state = Get-WatchState $statePath
$ingestRunning = Test-IngestRunning $AppRoot

$health = $null
$kind = 'ok'
try {
  $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec $TimeoutSec
  if ($health.ok -eq $true) {
    $kind = 'ok'
  } else {
    $kind = 'unhealthy'
  }
} catch {
  $msg = $_.Exception.Message
  if ($msg -match 'タイムアウト|timeout|timed out') {
    $kind = 'timeout'
  } elseif ($msg -match '接続|refused|actively refused|Unable to connect') {
    $kind = 'refused'
  } else {
    $kind = 'error'
  }
}

if ($kind -eq 'ok') {
  $state.failCount = 0
  $state.lastResult = 'ok'
  Save-WatchState $statePath $state
  Write-Log "ok db=$($health.db) batch=$($health.batch)"
  return
}

# Timeout / error during ingest looks like a hang. Do not restart the API.
if ($ingestRunning -or $health.batch -eq 'running') {
  $state.lastResult = "skip-ingest:$kind"
  Save-WatchState $statePath $state
  Write-Log "skip restart (ingest running) kind=$kind"
  Write-AppEvent 2004 'Information' "Health $kind while ingest running. API restart skipped."
  return
}

# Timeout alone is not enough to restart (CPU-heavy ETL / recompute).
if ($kind -eq 'timeout') {
  $state.lastResult = 'timeout'
  Save-WatchState $statePath $state
  Write-Log "timeout (no restart)"
  return
}

$state.failCount = [int]$state.failCount + 1
$state.lastResult = $kind
Write-Log "fail kind=$kind count=$($state.failCount)/$FailThreshold"

$cooldown = $false
if ($state.lastRestartAt) {
  try {
    $last = [datetime]::Parse($state.lastRestartAt)
    if ((Get-Date) - $last -lt [TimeSpan]::FromMinutes($CooldownMinutes)) { $cooldown = $true }
  } catch { $cooldown = $false }
}

if ($state.failCount -ge $FailThreshold -and -not $cooldown) {
  Write-Log "restart $ServiceName"
  Restart-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3
  $state.failCount = 0
  $state.lastRestartAt = (Get-Date).ToString('o')
  Write-AppEvent 2002 'Warning' "Restarted $ServiceName after health failures (kind=$kind)"
} elseif ($cooldown) {
  Write-Log "cooldown after last restart"
}

Save-WatchState $statePath $state
