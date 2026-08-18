#Requires -Version 5.1
# 先方がインターネットに出られない前提のオフラインキットを作る。
# 必ず Windows（ビルド用 EC2）で実行すること。Mac では Windows 用 Prisma エンジンが作れない。
#
# 使い方:
#   cd app\deploy
#   .\make-offline-kit.ps1
#
# 出力:
#   dist-release\mhi-app-offline-YYYYMMDD.zip
param(
  [string]$Version = (Get-Date -Format 'yyyyMMdd'),
  [string]$OutDir = '',
  [switch]$SkipDownload,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not $OutDir) { $OutDir = Join-Path $repoRoot 'dist-release' }
$kitName = "mhi-app-offline-$Version"
$kitRoot = Join-Path $OutDir $kitName
$installers = Join-Path $kitRoot 'installers'
$staging = Join-Path $kitRoot 'staging-mhi-app'
$archive = Join-Path $OutDir "$kitName.zip"

$NodeVersion = '20.18.1'
$Downloads = @(
  @{ Name = "node-v$NodeVersion-x64.msi"; Url = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-x64.msi" }
  @{ Name = 'vc_redist.x64.exe'; Url = 'https://aka.ms/vs/17/release/vc_redist.x64.exe' }
  @{ Name = 'nssm-2.24.zip'; Url = 'https://nssm.cc/release/nssm-2.24.zip' }
  @{ Name = 'rewrite_amd64_en-US.msi'; Url = 'https://download.microsoft.com/download/1/2/8/128E2E22-C1B9-44A4-BE2A-5859ED1D4592/rewrite_amd64_en-US.msi' }
  @{ Name = 'requestRouter_amd64.msi'; Url = 'https://download.microsoft.com/download/E/9/8/E9849D6A-020E-47E4-9FD0-A023E99B54EB/requestRouter_amd64.msi' }
)
$PgCandidates = @(
  'https://get.enterprisedb.com/postgresql/postgresql-18.6-1-windows-x64.exe',
  'https://get.enterprisedb.com/postgresql/postgresql-18.4-1-windows-x64.exe',
  'https://get.enterprisedb.com/postgresql/postgresql-18.1-1-windows-x64.exe'
)

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Save-Url([string]$Url, [string]$Dest) {
  if (Test-Path $Dest) {
    Write-Host "  exists: $(Split-Path $Dest -Leaf)"
    return
  }
  Write-Host "  GET $Url"
  Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing
  if (-not (Test-Path $Dest) -or ((Get-Item $Dest).Length -lt 1024)) {
    throw "Download failed or file too small: $Dest"
  }
}

function Invoke-Native([scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" }
}

function Refresh-Path {
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
    [System.Environment]::GetEnvironmentVariable('Path', 'User')
}

if ($PSVersionTable.PSEdition -eq 'Core' -and -not $IsWindows) {
  throw 'make-offline-kit.ps1 must run on Windows (build EC2).'
}

New-Item -ItemType Directory -Path $installers -Force | Out-Null

Write-Step 'Download installers (build machine has internet)'
if (-not $SkipDownload) {
  foreach ($item in $Downloads) {
    Save-Url $item.Url (Join-Path $installers $item.Name)
  }

  $pgDest = Join-Path $installers 'postgresql-18-windows-x64.exe'
  if (-not (Test-Path $pgDest)) {
    $pgOk = $false
    foreach ($url in $PgCandidates) {
      try {
        Save-Url $url $pgDest
        $pgOk = $true
        break
      } catch {
        Write-Host "  skip: $url" -ForegroundColor Yellow
      }
    }
    if (-not $pgOk) {
      throw "PostgreSQL 18 インストーラを取得できませんでした。$installers に postgresql-18-windows-x64.exe を置いて -SkipDownload で再実行してください。"
    }
  }
} else {
  Write-Host "  SkipDownload: $installers の既存ファイルを使います"
}

$required = @(
  "node-v$NodeVersion-x64.msi",
  'postgresql-18-windows-x64.exe',
  'nssm-2.24.zip',
  'rewrite_amd64_en-US.msi',
  'requestRouter_amd64.msi',
  'vc_redist.x64.exe'
)
foreach ($name in $required) {
  if (-not (Test-Path (Join-Path $installers $name))) {
    throw "installer missing: $name"
  }
}

if (-not $SkipBuild) {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Step 'Install Node.js on build machine (from kit MSI)'
    $msi = Join-Path $installers "node-v$NodeVersion-x64.msi"
    $p = Start-Process msiexec.exe -ArgumentList @('/i', $msi, '/qn', '/norestart') -Wait -PassThru
    if ($p.ExitCode -notin @(0, 3010)) { throw "Node MSI failed: $($p.ExitCode)" }
    Refresh-Path
  }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $nodeExe = 'C:\Program Files\nodejs\node.exe'
    if (Test-Path $nodeExe) {
      $env:Path = "$(Split-Path $nodeExe);$env:Path"
    } else {
      throw 'node が見つかりません。ビルド機に Node.js 20 を入れてください。'
    }
  }

  $backend = Join-Path $repoRoot 'app\backend'
  $frontend = Join-Path $repoRoot 'app\frontend'
  Write-Step 'backend: npm ci && prisma generate && build'
  Push-Location $backend
  Invoke-Native { npm ci }
  Invoke-Native { npm run prisma:generate }
  Invoke-Native { npm run build }
  Pop-Location

  Write-Step 'frontend: npm ci && build'
  Push-Location $frontend
  Invoke-Native { npm ci }
  Invoke-Native { npm run build }
  Pop-Location
} else {
  Write-Host '  SkipBuild: リポジトリ上の dist / node_modules をそのまま使います' -ForegroundColor Yellow
}

$backendMain = Join-Path $repoRoot 'app\backend\dist\main.js'
$frontendIndex = Join-Path $repoRoot 'app\frontend\dist\index.html'
if (-not (Test-Path $backendMain)) { throw "backend dist missing: $backendMain" }
if (-not (Test-Path $frontendIndex)) { throw "frontend dist missing: $frontendIndex" }

Write-Step 'Stage application (include Windows node_modules + dist)'
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null

$xd = @(
  (Join-Path $repoRoot '.git'),
  (Join-Path $repoRoot 'dist-release'),
  (Join-Path $repoRoot 'data'),
  (Join-Path $repoRoot 'logs'),
  (Join-Path $repoRoot 'moc'),
  (Join-Path $repoRoot 'app\frontend\node_modules')
)
$roboArgs = @($repoRoot, $staging, '/E', '/XD') + $xd + @('/XF', '.env', '/NFL', '/NDL', '/NJH', '/NJS', '/nc', '/ns', '/np')
& robocopy @roboArgs | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }

$meta = @(
  "version=$Version"
  "kind=offline"
  "built_at=$((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))"
  "node=$NodeVersion"
)
if (Test-Path (Join-Path $repoRoot '.git')) {
  Push-Location $repoRoot
  $meta += "git_commit=$(git rev-parse --short HEAD)"
  $meta += "git_branch=$(git rev-parse --abbrev-ref HEAD)"
  Pop-Location
}
$meta | Set-Content (Join-Path $kitRoot 'RELEASE.txt') -Encoding UTF8
Copy-Item (Join-Path $kitRoot 'RELEASE.txt') (Join-Path $staging 'RELEASE.txt') -Force

$readme = @"
MHI 進捗管理 オフラインキット
version=$Version

先方 / AWS検証（インターネット不要）:

  1. この ZIP を展開する
  2. 管理者 PowerShell:
       Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
       cd <展開先>
       .\setup-offline.ps1

アップデート:

  .env を退避してから新しいキットを上書きし、.\deploy-offline.ps1 を実行。
  詳細は doc\オフライン構築手順.md
"@
Set-Content -Path (Join-Path $kitRoot 'README.txt') -Value $readme -Encoding UTF8

$launcher = @'
#Requires -RunAsAdministrator
#Requires -Version 5.1
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $here 'staging-mhi-app\app\deploy\setup-offline.ps1') -KitRoot $here @args
'@
Set-Content -Path (Join-Path $kitRoot 'setup-offline.ps1') -Value $launcher -Encoding UTF8

$deployLauncher = @'
#Requires -RunAsAdministrator
#Requires -Version 5.1
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $here 'staging-mhi-app\app\deploy\deploy-offline.ps1') -KitRoot $here @args
'@
Set-Content -Path (Join-Path $kitRoot 'deploy-offline.ps1') -Value $deployLauncher -Encoding UTF8

Write-Step "Zip $archive"
if (Test-Path $archive) { Remove-Item $archive -Force }
Push-Location $OutDir
& tar.exe -a -c -f (Split-Path $archive -Leaf) $kitName
if ($LASTEXITCODE -ne 0) { throw "zip failed ($LASTEXITCODE)" }
Pop-Location

Write-Host "`n==> Created: $archive" -ForegroundColor Green
Write-Host '    Box に上げて先方へ渡す。先方では setup-offline.ps1（Chocolatey / npm ci なし）'
Write-Host "    展開用フォルダ: $kitRoot （zip 後も残しています）"
