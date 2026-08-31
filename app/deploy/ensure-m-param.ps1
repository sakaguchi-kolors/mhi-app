#Requires -Version 5.1
# m_param 既定パラメータ（SHOP_LT_DAYS 等）を DB に ensure する。
# setup-offline.ps1 / deploy.ps1 -FirstRun 直後に実行（20260818 キット以前の seed 不具合回避）。
param(
  [string]$BackendDir = 'C:\apps\mhi-app\app\backend',
  [string]$Psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
)

$ErrorActionPreference = 'Stop'

$envPath = Join-Path $BackendDir '.env'
if (-not (Test-Path $envPath)) { throw ".env not found: $envPath" }
if (-not (Test-Path $Psql)) { throw "psql not found: $Psql" }

Get-Content $envPath | ForEach-Object {
  if ($_ -match '^(PGUSER|PGPASSWORD|PGDATABASE|PGHOST|PGPORT)=(.+)$') {
    Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2]
  }
}
if (-not $env:PGUSER) { $env:PGUSER = 'mop' }
if (-not $env:PGDATABASE) { $env:PGDATABASE = 'mop' }
if (-not $env:PGHOST) { $env:PGHOST = 'localhost' }
if (-not $env:PGPORT) { $env:PGPORT = '5432' }
if (-not $env:PGPASSWORD) { throw 'PGPASSWORD not found in .env' }

$env:PGCLIENTENCODING = 'UTF8'

$sqlFile = Join-Path $PSScriptRoot 'ensure-m-param.sql'
if (-not (Test-Path $sqlFile)) { throw "SQL not found: $sqlFile" }

Write-Host 'Ensuring m_param default keys (SHOP_LT_DAYS, ...)...' -ForegroundColor Cyan
& $Psql -h $env:PGHOST -p $env:PGPORT -U $env:PGUSER -d $env:PGDATABASE -f $sqlFile
& $Psql -h $env:PGHOST -p $env:PGPORT -U $env:PGUSER -d $env:PGDATABASE -c 'SELECT key, value FROM m_param ORDER BY key;'
Write-Host 'Done.' -ForegroundColor Green
