#Requires -Version 5.1
param(
  [switch]$FirstRun,
  [switch]$GitPull,
  [switch]$DryRun,
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$SiteRoot = 'C:\inetpub\mhi',
  [string]$ServiceName = 'MhiProgressApi'
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Invoke-Native([scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE"
  }
}

function Get-EnvValue([string]$File, [string]$Key, [string]$Default) {
  if (-not (Test-Path $File)) { return $Default }
  foreach ($line in Get-Content $File) {
    if ($line -match "^\s*$Key\s*=\s*(.+)\s*$") {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return $Default
}

function Test-ServiceExists([string]$Name) {
  return [bool](Get-Service -Name $Name -ErrorAction SilentlyContinue)
}

function Invoke-DeployStep([string]$Message, [scriptblock]$Action) {
  Write-Step $Message
  if ($DryRun) {
    Write-Host '  [DryRun] skipped' -ForegroundColor Yellow
    return
  }
  & $Action
}

Write-Step 'Deploy started'
Write-Host "RepoRoot : $RepoRoot"
Write-Host "SiteRoot : $SiteRoot"
if ($DryRun) { Write-Host 'Mode     : DryRun (no changes will be made)' -ForegroundColor Yellow }

if ($SiteRoot -notlike 'C:\inetpub\*') {
  throw "SiteRoot must be under C:\inetpub (got: $SiteRoot)"
}

# 先方本番は GitHub 非利用のため、既定では git pull しない。
# 開発側の検証環境で git 運用する場合のみ -GitPull を付ける。
if ($GitPull) {
  $gitRoot = Split-Path $RepoRoot -Parent
  if (Test-Path (Join-Path $gitRoot '.git')) {
    Invoke-DeployStep 'git pull' {
      Push-Location $gitRoot
      Invoke-Native { git pull }
      Pop-Location
    }
  } else {
    Write-Host '  -GitPull specified but .git not found; using files on disk as-is' -ForegroundColor Yellow
  }
} else {
  Write-Host '  Using source files on disk (no git pull). Update source before deploy if needed.' -ForegroundColor DarkGray
}

$backend = Join-Path $RepoRoot 'backend'
$frontend = Join-Path $RepoRoot 'frontend'
$envFile = Join-Path $backend '.env'

if (-not (Test-Path $envFile)) {
  throw ".env not found: $envFile"
}

$apiPort = Get-EnvValue $envFile 'API_PORT' '8787'

Invoke-DeployStep 'backend: npm ci && build' {
  Push-Location $backend
  Invoke-Native { npm ci }
  Invoke-Native { npm run prisma:generate }
  Invoke-Native { npm run build }
  Pop-Location
}

Invoke-DeployStep 'frontend: npm ci && build' {
  Push-Location $frontend
  Invoke-Native { npm ci }
  Invoke-Native { npm run build }
  Pop-Location
}

if (Test-ServiceExists $ServiceName) {
  Invoke-DeployStep "Stopping Windows Service ($ServiceName)" {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
  }
}

Invoke-DeployStep 'backend: prisma migrate deploy' {
  Push-Location $backend
  Invoke-Native { npm run prisma:deploy }
  Pop-Location
}

if ($FirstRun) {
  Invoke-DeployStep 'First run: seed + etl' {
    Push-Location $backend
    Invoke-Native { npm run seed }
    Invoke-Native { npm run etl }
    Pop-Location
  }
}

Invoke-DeployStep "Copy frontend to IIS: $SiteRoot" {
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
}

Invoke-DeployStep 'Restarting Windows Service' {
  if (-not (Test-ServiceExists $ServiceName)) {
    throw "Service '$ServiceName' not found. Run setup-server.ps1 first."
  }
  Restart-Service -Name $ServiceName -Force
  Start-Sleep -Seconds 3
}

if ($DryRun) {
  Write-Host "`nDryRun complete. Re-run without -DryRun to deploy." -ForegroundColor Green
  return
}

Write-Step 'Health check'
$healthUrl = "http://127.0.0.1:$apiPort/api/auth/setup"
$healthOk = $false
$resp = $null
for ($i = 0; $i -lt 10; $i++) {
  try {
    $resp = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 5
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
Write-Host "  API: $healthUrl"
Write-Host '  Web: http://<public-ip>/'
if ($resp.needsSetup) {
  Write-Host '  Open /setup to create admin account' -ForegroundColor Yellow
}
