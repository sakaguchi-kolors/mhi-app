#Requires -RunAsAdministrator
#Requires -Version 5.1
<#
.SYNOPSIS
  AWS Windows Server 初回セットアップ（IIS + Node + PostgreSQL + Windows Service）

.USAGE
  管理者 PowerShell で実行:
  Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
  cd C:\apps\mhi-app\app\deploy
  .\setup-server.ps1

  オプション:
  .\setup-server.ps1 -SkipPostgresInstall   # PG を別途用意する場合
  .\setup-server.ps1 -SkipBasicAuth         # IIS Basic 認証を設定しない
#>
param(
  [switch]$SkipPostgresInstall,
  [switch]$SkipBasicAuth,
  [string]$RepoUrl = '',                    # 例: https://github.com/org/mhi-app.git
  [string]$AppRoot = 'C:\apps\mhi-app',
  [string]$SiteRoot = 'C:\inetpub\mhi',
  [string]$SiteName = 'MhiApp',
  [string]$ServiceName = 'MhiProgressApi',
  [string]$PgPassword = 'mhi_staging_pw',
  [string]$BasicAuthUser = 'mhi',
  [string]$BasicAuthPassword = 'ChangeMe123!'
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Ensure-Chocolatey {
  if (Get-Command choco -ErrorAction SilentlyContinue) { return }
  Write-Step 'Chocolatey インストール'
  Set-ExecutionPolicy Bypass -Scope Process -Force
  [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
  Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
}

function Install-IisModules {
  Write-Step 'IIS 機能を有効化'
  Install-WindowsFeature -Name Web-Server, Web-WebServer, Web-Common-Http, Web-Static-Content,
    Web-Default-Doc, Web-Dir-Browsing, Web-Http-Errors, Web-Http-Logging, Web-Request-Monitor,
    Web-Filtering, Web-Stat-Compression, Web-Mgmt-Tools, Web-Mgmt-Console -IncludeManagementTools | Out-Null

  if (-not (Get-WebGlobalModule -Name 'RewriteModule' -ErrorAction SilentlyContinue)) {
    Write-Step 'URL Rewrite インストール'
    $rewriteMsi = Join-Path $env:TEMP 'rewrite_amd64.msi'
    Invoke-WebRequest -Uri 'https://download.microsoft.com/download/1/2/8/128E2E22-C1B9-44A4-BE2A-5859ED1D4592/rewrite_amd64_en-US.msi' -OutFile $rewriteMsi
    Start-Process msiexec.exe -ArgumentList "/i `"$rewriteMsi`" /qn" -Wait
  }

  if (-not (Get-WebGlobalModule -Name 'ApplicationRequestRouting' -ErrorAction SilentlyContinue)) {
    Write-Step 'Application Request Routing インストール'
    $arrMsi = Join-Path $env:TEMP 'requestRouter_amd64.msi'
    Invoke-WebRequest -Uri 'https://download.microsoft.com/download/E/9/8/E9849D6A-020E-47E4-9BD2-CB48C2E026E0/requestRouter_amd64.msi' -OutFile $arrMsi
    Start-Process msiexec.exe -ArgumentList "/i `"$arrMsi`" /qn" -Wait
  }

  Write-Step 'ARR プロキシを有効化'
  Import-Module WebAdministration
  Set-WebConfigurationProperty -pspath 'MACHINE/WEBROOT/APPHOST' -filter 'system.webServer/proxy' -name 'enabled' -value 'True'
}

function New-JwtSecret {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return [Convert]::ToBase64String($bytes)
}

Ensure-Chocolatey

Write-Step 'Node.js / Git / NSSM インストール'
choco install nodejs-lts git nssm -y --no-progress
$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')

if (-not $SkipPostgresInstall) {
  Write-Step 'PostgreSQL 16 インストール'
  choco install postgresql16 --params "/Password:$PgPassword" -y --no-progress
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
}

Install-IisModules

Write-Step 'ディレクトリ作成'
New-Item -ItemType Directory -Path $AppRoot -Force | Out-Null
New-Item -ItemType Directory -Path $SiteRoot -Force | Out-Null
New-Item -ItemType Directory -Path 'C:\apps\mhi-app\logs' -Force | Out-Null
New-Item -ItemType Directory -Path 'C:\apps\mhi-app\data\csv' -Force | Out-Null

if ($RepoUrl -and -not (Test-Path (Join-Path $AppRoot '.git'))) {
  Write-Step "リポジトリ clone: $RepoUrl"
  git clone $RepoUrl $AppRoot
}

$appDir = Join-Path $AppRoot 'app'
if (-not (Test-Path $appDir)) {
  throw "app/ が見つかりません: $appDir`n リポジトリを $AppRoot に配置するか -RepoUrl を指定してください。"
}

$sampleCsv = Join-Path $appDir 'sample-data'
if ((Test-Path $sampleCsv) -and -not (Get-ChildItem 'C:\apps\mhi-app\data\csv' -ErrorAction SilentlyContinue)) {
  Copy-Item -Path (Join-Path $sampleCsv '*') -Destination 'C:\apps\mhi-app\data\csv' -Force
}

Write-Step '.env 作成'
$envExample = Join-Path $appDir '.env.staging.example'
$envTarget = Join-Path $appDir 'backend\.env'
if (-not (Test-Path $envTarget)) {
  if (-not (Test-Path $envExample)) {
    throw ".env.staging.example がありません: $envExample"
  }
  Copy-Item $envExample $envTarget
  $jwt = New-JwtSecret
  (Get-Content $envTarget -Raw) `
    -replace 'JWT_SECRET=.*', "JWT_SECRET=$jwt" `
    -replace 'PGPASSWORD=.*', "PGPASSWORD=$PgPassword" `
    -replace 'DATABASE_URL=.*', "DATABASE_URL=postgresql://mop:${PgPassword}@localhost:5432/mop?schema=public" |
    Set-Content $envTarget -Encoding UTF8
  Write-Host "  .env を作成しました: $envTarget"
  Write-Host '  JWT_SECRET は自動生成済み。必要なら編集してください。'
}

Write-Step 'PostgreSQL DB / ユーザー作成'
if (-not $SkipPostgresInstall) {
  $pgBin = 'C:\Program Files\PostgreSQL\16\bin'
  if (-not (Test-Path $pgBin)) {
    $pgBin = (Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName + '\bin'
  }
  $psql = Join-Path $pgBin 'psql.exe'
  $env:PGPASSWORD = $PgPassword
  & $psql -U postgres -h localhost -c "DO `$`$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mop') THEN CREATE ROLE mop LOGIN PASSWORD '$PgPassword'; END IF; END `$`$;"
  $dbExists = & $psql -U postgres -h localhost -tc "SELECT 1 FROM pg_database WHERE datname = 'mop'"
  if ($dbExists.Trim() -ne '1') {
    & $psql -U postgres -h localhost -c 'CREATE DATABASE mop OWNER mop;'
  }
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Step 'Windows Service 登録'
$backend = Join-Path $appDir 'backend'
$nodeExe = (Get-Command node).Source
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service) {
  Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
  & nssm remove $ServiceName confirm
}
& nssm install $ServiceName $nodeExe 'dist\main.js'
& nssm set $ServiceName AppDirectory $backend
& nssm set $ServiceName AppStdout 'C:\apps\mhi-app\logs\api.out.log'
& nssm set $ServiceName AppStderr 'C:\apps\mhi-app\logs\api.err.log'
& nssm set $ServiceName AppRotateFiles 1
& nssm set $ServiceName AppExit Default Restart
& nssm set $ServiceName Start SERVICE_AUTO_START

Write-Step 'IIS サイト作成'
Import-Module WebAdministration
if (Test-Path "IIS:\Sites\$SiteName") {
  Remove-Website -Name $SiteName
}
New-Website -Name $SiteName -PhysicalPath $SiteRoot -Port 80 -Force | Out-Null

if (-not $SkipBasicAuth) {
  Write-Step 'IIS Basic 認証（URL ゲート）'
  Import-Module WebAdministration
  Set-WebConfigurationProperty -Filter '/system.webServer/security/authentication/anonymousAuthentication' -Name enabled -Value $false -PSPath "IIS:\Sites\$SiteName"
  Set-WebConfigurationProperty -Filter '/system.webServer/security/authentication/basicAuthentication' -Name enabled -Value $true -PSPath "IIS:\Sites\$SiteName"

  # ローカルユーザー（IIS Basic 用）
  if (-not (Get-LocalUser -Name $BasicAuthUser -ErrorAction SilentlyContinue)) {
    $sec = ConvertTo-SecureString $BasicAuthPassword -AsPlainText -Force
    New-LocalUser -Name $BasicAuthUser -Password $sec -PasswordNeverExpires -UserMayNotChangePassword | Out-Null
  }
  & "$env:windir\system32\inetsrv\appcmd.exe" set config "$SiteName" /section:system.webServer/security/authentication/basicAuthentication /enabled:true
  Write-Host "  Basic 認証ユーザー: $BasicAuthUser / $BasicAuthPassword"
  Write-Host '  ※ 本番前に必ずパスワードを変更してください'
}

Write-Step '初回デプロイ'
& (Join-Path $appDir 'deploy\deploy.ps1') -FirstRun

Write-Host "`nセットアップ完了" -ForegroundColor Green
Write-Host "  IIS サイト : $SiteName (http://<Elastic-IP>/)"
Write-Host '  次の作業:'
Write-Host '    1. セキュリティグループで 443/80 を開放（RDP は自 IP のみ）'
Write-Host '    2. Elastic IP を割り当て'
Write-Host '    3. （任意）IIS に SSL 証明書を設定'
Write-Host '    4. ブラウザでアクセス → Basic 認証 → /setup で管理者作成'
