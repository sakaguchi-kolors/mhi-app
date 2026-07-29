#Requires -Version 5.1
# 先方サーバーへ納品する ZIP を作成する（GitHub 非利用のデプロイ向け）
# 使い方: cd app\deploy; .\make-release.ps1
param(
  [string]$Version = (Get-Date -Format 'yyyyMMdd'),
  [string]$OutDir = ''
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
if (-not $OutDir) { $OutDir = Join-Path $repoRoot 'dist-release' }
$archive = Join-Path $OutDir "mhi-app-release-$Version.zip"
$staging = Join-Path $OutDir 'staging-mhi-app'

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

Write-Host "==> Staging release (version: $Version)" -ForegroundColor Cyan

$exclude = @('.git', 'node_modules', 'dist', 'frontend\dist', 'backend\dist', '.env', 'backend\.env', 'data', 'logs', 'dist-release', '.DS_Store')
robocopy $repoRoot $staging /MIR /XD $exclude /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }

$meta = @(
  "version=$Version"
  "built_at=$((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))"
)
if (Test-Path (Join-Path $repoRoot '.git')) {
  Push-Location $repoRoot
  $meta += "git_commit=$(git rev-parse --short HEAD)"
  $meta += "git_branch=$(git rev-parse --abbrev-ref HEAD)"
  Pop-Location
}
$meta | Set-Content (Join-Path $staging 'RELEASE.txt') -Encoding UTF8

if (Test-Path $archive) { Remove-Item $archive -Force }
Compress-Archive -Path $staging -DestinationPath $archive -Force
Remove-Item $staging -Recurse -Force

Write-Host "==> Created: $archive" -ForegroundColor Green
Write-Host '    先方サーバーで展開 → C:\apps\mhi-app\ として配置 → app\deploy\deploy.ps1'
