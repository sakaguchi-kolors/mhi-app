#Requires -RunAsAdministrator
#Requires -Version 5.1
# オフラインキットによるアップデート。npm ci はしない。
param(
  [string]$KitRoot = '',
  [string]$AppRoot = 'C:\apps\mhi-app',
  [string]$SiteRoot = 'C:\inetpub\mhi',
  [string]$ServiceName = 'MhiProgressApi'
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Find-KitRoot {
  $dir = $PSScriptRoot
  for ($i = 0; $i -lt 8; $i++) {
    if (Test-Path (Join-Path $dir 'installers')) { return $dir }
    if (Test-Path (Join-Path $dir 'staging-mhi-app')) { return $dir }
    $parent = Split-Path $dir -Parent
    if (-not $parent -or $parent -eq $dir) { break }
    $dir = $parent
  }
  throw 'キット展開先が見つかりません。-KitRoot を指定してください。'
}

if (-not $KitRoot) { $KitRoot = Find-KitRoot }
$KitRoot = (Resolve-Path $KitRoot).Path
$staging = Join-Path $KitRoot 'staging-mhi-app'
if (-not (Test-Path $staging)) { throw "staging-mhi-app not found: $staging" }

$envTarget = Join-Path $AppRoot 'app\backend\.env'
$envBackup = 'C:\apps\backend.env.backup'
if (-not (Test-Path $envTarget)) {
  throw ".env not found: $envTarget  （初回は setup-offline.ps1 を使ってください）"
}

Write-Step 'Backup .env'
New-Item -ItemType Directory -Path 'C:\apps' -Force | Out-Null
Copy-Item $envTarget $envBackup -Force

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  Write-Step "Stopping $ServiceName"
  Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
}

Write-Step "Overwrite $AppRoot from kit (keep data / logs)"
robocopy $staging $AppRoot /MIR /XD data logs backup /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }

Write-Step 'Restore .env'
Copy-Item $envBackup $envTarget -Force

$appDir = Join-Path $AppRoot 'app'
Write-Step 'Deploy (SkipNpm)'
& (Join-Path $appDir 'deploy\deploy.ps1') -SkipNpm -RepoRoot $appDir -SiteRoot $SiteRoot -ServiceName $ServiceName

if (Test-Path (Join-Path $AppRoot 'RELEASE.txt')) {
  Write-Host "`nRELEASE.txt:" -ForegroundColor Cyan
  Get-Content (Join-Path $AppRoot 'RELEASE.txt')
}
