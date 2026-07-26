#Requires -Version 5.1
<#
.SYNOPSIS
  MHI 進捗管理 — 検証環境デプロイ

.USAGE
  cd C:\apps\mhi-app\app\deploy
  .\deploy.ps1                 # 通常デプロイ
  .\deploy.ps1 -FirstRun       # 初回（seed + etl も実行）
  .\deploy.ps1 -SkipGitPull    # git pull をスキップ

.PARAMETER RepoRoot
  リポジトリの app/ ディレクトリ（既定: スクリプトの親の親）
.PARAMETER SiteRoot
  IIS 物理パス（既定: C:\inetpub\mhi）
.PARAMETER ServiceName
  NestJS Windows Service 名（既定: MhiProgressApi）
#>
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

Write-Step 'デプロイ開始'
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
    Write-Host '  git リポジトリではないため pull をスキップ'
  }
}

$backend = Join-Path $RepoRoot 'backend'
$frontend = Join-Path $RepoRoot 'frontend'
$envFile = Join-Path $backend '.env'

if (-not (Test-Path $envFile)) {
  throw ".env がありません: $envFile`n  .env.staging.example をコピーして値を設定してください。"
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
  Write-Step '初回: seed + etl'
  Push-Location $backend
  npm run seed
  npm run etl
  Pop-Location
}

Write-Step "IIS 成果物配置 -> $SiteRoot"
if (-not (Test-Path $SiteRoot)) {
  New-Item -ItemType Directory -Path $SiteRoot -Force | Out-Null
}

$dist = Join-Path $frontend 'dist'
if (-not (Test-Path (Join-Path $dist 'index.html'))) {
  throw "frontend/dist が見つかりません。build を確認してください。"
}

Get-ChildItem $SiteRoot -Force | Remove-Item -Recurse -Force
Copy-Item -Path (Join-Path $dist '*') -Destination $SiteRoot -Recurse -Force
Copy-Item -Path (Join-Path $PSScriptRoot 'web.config') -Destination $SiteRoot -Force

Write-Step 'Windows Service 再起動'
if (-not (Test-ServiceExists $ServiceName)) {
  throw "サービス '$ServiceName' がありません。setup-server.ps1 を先に実行してください。"
}
Restart-Service -Name $ServiceName -Force
Start-Sleep -Seconds 3

Write-Step 'ヘルスチェック'
$healthOk = $false
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
  throw 'API ヘルスチェック失敗。サービスログを確認してください: C:\apps\mhi-app\logs\'
}

Write-Host "`nデプロイ完了" -ForegroundColor Green
Write-Host '  API : http://127.0.0.1:8787/api/auth/setup'
Write-Host "  Web : https://<your-domain-or-ip>/"
if ($resp.needsSetup) {
  Write-Host '  初回: /setup で管理者アカウントを作成してください' -ForegroundColor Yellow
}
