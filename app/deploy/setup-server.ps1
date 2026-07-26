#Requires -RunAsAdministrator
#Requires -Version 5.1
param(
  [switch]$SkipPostgresInstall,
  [switch]$SkipBasicAuth,
  [string]$RepoUrl = '',
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
  Write-Step 'Installing Chocolatey'
  Set-ExecutionPolicy Bypass -Scope Process -Force
  [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
  Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
}

function Install-IisModules {
  Write-Step 'Enabling IIS'
  Install-WindowsFeature -Name Web-Server, Web-WebServer, Web-Common-Http, Web-Static-Content,
    Web-Default-Doc, Web-Dir-Browsing, Web-Http-Errors, Web-Http-Logging, Web-Request-Monitor,
    Web-Filtering, Web-Stat-Compression, Web-Mgmt-Tools, Web-Mgmt-Console -IncludeManagementTools | Out-Null

  Import-Module WebAdministration -ErrorAction SilentlyContinue

  if (-not (Get-WebGlobalModule -Name 'RewriteModule' -ErrorAction SilentlyContinue)) {
    Write-Step 'Installing URL Rewrite'
    $rewriteMsi = Join-Path $env:TEMP 'rewrite_amd64.msi'
    Invoke-WebRequest -Uri 'https://download.microsoft.com/download/1/2/8/128E2E22-C1B9-44A4-BE2A-5859ED1D4592/rewrite_amd64_en-US.msi' -OutFile $rewriteMsi
    Start-Process msiexec.exe -ArgumentList "/i `"$rewriteMsi`" /qn" -Wait
  }

  if (-not (Get-WebGlobalModule -Name 'ApplicationRequestRouting' -ErrorAction SilentlyContinue)) {
    Write-Step 'Installing Application Request Routing'
    $arrMsi = Join-Path $env:TEMP 'requestRouter_amd64.msi'
    Invoke-WebRequest -Uri 'https://download.microsoft.com/download/E/9/8/E9849D6A-020E-47E4-9BD2-CB48C2E026E0/requestRouter_amd64.msi' -OutFile $arrMsi
    Start-Process msiexec.exe -ArgumentList "/i `"$arrMsi`" /qn" -Wait
  }

  Write-Step 'Enabling ARR proxy'
  Import-Module WebAdministration
  Set-WebConfigurationProperty -pspath 'MACHINE/WEBROOT/APPHOST' -filter 'system.webServer/proxy' -name 'enabled' -value 'True'
}

function New-JwtSecret {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return [Convert]::ToBase64String($bytes)
}

Ensure-Chocolatey

Write-Step 'Installing Node.js, Git, NSSM'
choco install nodejs-lts git nssm -y --no-progress
$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')

if (-not $SkipPostgresInstall) {
  Write-Step 'Installing PostgreSQL 16'
  choco install postgresql16 --params "/Password:$PgPassword" -y --no-progress
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
}

Install-IisModules

Write-Step 'Creating directories'
New-Item -ItemType Directory -Path $AppRoot -Force | Out-Null
New-Item -ItemType Directory -Path $SiteRoot -Force | Out-Null
New-Item -ItemType Directory -Path 'C:\apps\mhi-app\logs' -Force | Out-Null
New-Item -ItemType Directory -Path 'C:\apps\mhi-app\data\csv' -Force | Out-Null

if ($RepoUrl -and -not (Test-Path (Join-Path $AppRoot '.git'))) {
  Write-Step "Cloning repo: $RepoUrl"
  git clone $RepoUrl $AppRoot
}

$appDir = Join-Path $AppRoot 'app'
if (-not (Test-Path $appDir)) {
  throw "app/ not found: $appDir"
}

$sampleCsv = Join-Path $appDir 'sample-data'
if ((Test-Path $sampleCsv) -and -not (Get-ChildItem 'C:\apps\mhi-app\data\csv' -ErrorAction SilentlyContinue)) {
  Copy-Item -Path (Join-Path $sampleCsv '*') -Destination 'C:\apps\mhi-app\data\csv' -Force
}

Write-Step 'Creating backend/.env'
$envExample = Join-Path $appDir '.env.staging.example'
$envTarget = Join-Path $appDir 'backend\.env'
if (-not (Test-Path $envTarget)) {
  if (-not (Test-Path $envExample)) {
    throw ".env.staging.example not found: $envExample"
  }
  Copy-Item $envExample $envTarget
  $jwt = New-JwtSecret
  $dbUrl = "postgresql://mop:${PgPassword}@localhost:5432/mop?schema=public"
  (Get-Content $envTarget -Raw) `
    -replace 'JWT_SECRET=.*', "JWT_SECRET=$jwt" `
    -replace 'PGPASSWORD=.*', "PGPASSWORD=$PgPassword" `
    -replace 'DATABASE_URL=.*', "DATABASE_URL=$dbUrl" |
    Set-Content $envTarget -Encoding UTF8
  Write-Host "  Created: $envTarget"
}

Write-Step 'Creating PostgreSQL database'
if (-not $SkipPostgresInstall) {
  $pgBin = 'C:\Program Files\PostgreSQL\16\bin'
  if (-not (Test-Path $pgBin)) {
    $pgBin = (Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName + '\bin'
  }
  $psql = Join-Path $pgBin 'psql.exe'
  $env:PGPASSWORD = $PgPassword

  $roleSql = "DO `$`$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mop') THEN CREATE ROLE mop LOGIN PASSWORD '$PgPassword'; END IF; END `$`$;"
  & $psql -U postgres -h localhost -c $roleSql

  $dbCheck = & $psql -U postgres -h localhost -tc 'SELECT 1 FROM pg_database WHERE datname = ''mop'''
  if ($dbCheck.Trim() -ne '1') {
    & $psql -U postgres -h localhost -c 'CREATE DATABASE mop OWNER mop;'
  }
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Step 'Registering Windows Service'
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

Write-Step 'Creating IIS site'
Import-Module WebAdministration
if (Test-Path "IIS:\Sites\$SiteName") {
  Remove-Website -Name $SiteName
}
New-Website -Name $SiteName -PhysicalPath $SiteRoot -Port 80 -Force | Out-Null

if (-not $SkipBasicAuth) {
  Write-Step 'Configuring IIS Basic auth'
  Set-WebConfigurationProperty -Filter '/system.webServer/security/authentication/anonymousAuthentication' -Name enabled -Value $false -PSPath "IIS:\Sites\$SiteName"
  Set-WebConfigurationProperty -Filter '/system.webServer/security/authentication/basicAuthentication' -Name enabled -Value $true -PSPath "IIS:\Sites\$SiteName"

  if (-not (Get-LocalUser -Name $BasicAuthUser -ErrorAction SilentlyContinue)) {
    $sec = ConvertTo-SecureString $BasicAuthPassword -AsPlainText -Force
    New-LocalUser -Name $BasicAuthUser -Password $sec -PasswordNeverExpires -UserMayNotChangePassword | Out-Null
  }
  Write-Host "  Basic auth user: $BasicAuthUser / $BasicAuthPassword"
}

Write-Step 'Running first deploy'
& (Join-Path $appDir 'deploy\deploy.ps1') -FirstRun

Write-Host "`nSetup complete." -ForegroundColor Green
Write-Host "  Site: $SiteName  http://<public-ip>/"
Write-Host "  Basic auth: $BasicAuthUser / $BasicAuthPassword"
Write-Host "  Then open /setup to create admin account"
