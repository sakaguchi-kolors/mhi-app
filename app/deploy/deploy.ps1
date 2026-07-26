#Requires -Version 5.1
param(
  [switch]$FirstRun,
  [switch]$SkipGitPull,
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$SiteRoot = 'C:\inetpub\mhi',
  [string]$ServiceName = 'MhiProgressApi'
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Test-ServiceExists([string]$Name) {
  return [bool](Get-Service -Name $Name -ErrorAction SilentlyContinue)
}

Write-Step 'Deploy started'
Write-Host "RepoRoot : $RepoRoot"
Write-Host "SiteRoot : $SiteRoot"

if (-not $SkipGitPull) {
  $gitRoot = Split-Path $RepoRoot -Parent
  if (Test-Path (Join-Path $gitRoot '.git')) {
    Write-Step 'git pull'
    Push-Location $gitRoot
    git pull
    Pop-Location
  } else {
    Write-Host '  Skipping git pull (not a git repo)'
  }
}

$backend = Join-Path $RepoRoot 'backend'
$frontend = Join-Path $RepoRoot 'frontend'
$envFile = Join-Path $backend '.env'

if (-not (Test-Path $envFile)) {
  throw ".env not found: $envFile"
}

Write-Step 'backend: npm ci && build'
Push-Location $backend
npm ci
npm run prisma:generate
npm run build
npm run prisma:deploy
Pop-Location

Write-Step 'frontend: npm ci && build'
Push-Location $frontend
npm ci
npm run build
Pop-Location

if ($FirstRun) {
  Write-Step 'First run: seed + etl'
  Push-Location $backend
  npm run seed
  npm run etl
  Pop-Location
}

Write-Step "Copy frontend to IIS: $SiteRoot"
if (-not (Test-Path $SiteRoot)) {
  New-Item -ItemType Directory -Path $SiteRoot -Force | Out-Null
}

$dist = Join-Path $frontend 'dist'
if (-not (Test-Path (Join-Path $dist 'index.html'))) {
  throw "frontend/dist not found. Check build output."
}

Get-ChildItem $SiteRoot -Force | Remove-Item -Recurse -Force
Copy-Item -Path (Join-Path $dist '*') -Destination $SiteRoot -Recurse -Force
Copy-Item -Path (Join-Path $PSScriptRoot 'web.config') -Destination $SiteRoot -Force

Write-Step 'Restarting Windows Service'
if (-not (Test-ServiceExists $ServiceName)) {
  throw "Service '$ServiceName' not found. Run setup-server.ps1 first."
}
Restart-Service -Name $ServiceName -Force
Start-Sleep -Seconds 3

Write-Step 'Health check'
$healthOk = $false
$resp = $null
for ($i = 0; $i -lt 10; $i++) {
  try {
    $resp = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/auth/setup' -TimeoutSec 5
    if ($null -ne $resp.needsSetup) {
      $healthOk = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 2
  }
}

if (-not $healthOk) {
  throw 'API health check failed. See C:\apps\mhi-app\logs\'
}

Write-Host "`nDeploy complete." -ForegroundColor Green
Write-Host '  API: http://127.0.0.1:8787/api/auth/setup'
Write-Host '  Web: http://<public-ip>/'
if ($resp.needsSetup) {
  Write-Host '  Open /setup to create admin account' -ForegroundColor Yellow
}
