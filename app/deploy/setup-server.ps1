#Requires -RunAsAdministrator
#Requires -Version 5.1
param(
  [switch]$SkipPostgresInstall,
  [switch]$SkipBasicAuth,
  [switch]$InstallGit,
  [string]$RepoUrl = '',
  [string]$AppRoot = 'C:\apps\mhi-app',
  [string]$SiteRoot = 'C:\inetpub\mhi',
  [string]$SiteName = 'MhiApp',
  [string]$ServiceName = 'MhiProgressApi',
  [string]$PgPassword = '',
  [string]$BasicAuthUser = 'mhi',
  [string]$BasicAuthPassword = ''
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function New-RandomPassword {
  param([int]$Length = 24)
  $bytes = New-Object byte[] $Length
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return [Convert]::ToBase64String($bytes).Substring(0, $Length) -replace '[+/=]', 'x'
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

function Ensure-Chocolatey {
  if (Get-Command choco -ErrorAction SilentlyContinue) { return }
  Write-Step 'Installing Chocolatey'
  Set-ExecutionPolicy Bypass -Scope Process -Force
  [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
  Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
}

function Test-RewriteInstalled {
  if (Get-WebGlobalModule -Name 'RewriteModule' -ErrorAction SilentlyContinue) { return $true }
  return Test-Path 'C:\Windows\System32\inetsrv\rewrite.dll'
}

function Test-ArrInstalled {
  if (Get-WebGlobalModule -Name 'ApplicationRequestRouting' -ErrorAction SilentlyContinue) { return $true }
  return Test-Path 'C:\Program Files\IIS\Application Request Routing\requestRouter.dll'
}

function Install-ChocoPackageSafe {
  param(
    [string]$Name,
    [string[]]$ExtraArgs = @()
  )
  $chocoArgs = @('install', $Name, '-y', '--no-progress') + $ExtraArgs
  & choco @chocoArgs 2>&1 | Out-Host
  if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 3010) { return }
  Write-Host "  choco $Name exited $LASTEXITCODE (continuing if already installed)" -ForegroundColor Yellow
}

function Get-PgBinPath {
  foreach ($ver in @('18', '17', '16', '15')) {
    $bin = "C:\Program Files\PostgreSQL\$ver\bin"
    if (Test-Path (Join-Path $bin 'psql.exe')) { return $bin }
  }
  $pgRoot = 'C:\Program Files\PostgreSQL'
  if (-not (Test-Path $pgRoot)) { return $null }
  foreach ($dir in Get-ChildItem $pgRoot -Directory | Sort-Object Name -Descending) {
    $bin = Join-Path $dir.FullName 'bin'
    if (Test-Path (Join-Path $bin 'psql.exe')) { return $bin }
  }
  return $null
}

function Ensure-PostgresInstalled {
  if ($SkipPostgresInstall) { return }
  $bin = Get-PgBinPath
  if ($bin) {
    Write-Step "PostgreSQL found: $bin"
    return
  }
  Write-Step 'Installing PostgreSQL 18'
  Install-ChocoPackageSafe 'postgresql18' @("/params:`"/Password:$PgPassword`"")
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
  Start-Sleep -Seconds 5
  if (-not (Get-PgBinPath)) {
    throw 'PostgreSQL install finished but psql.exe was not found'
  }
}

function Test-ServerCore {
  try {
    $type = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').InstallationType
    return $type -eq 'Server Core'
  } catch {
    return $false
  }
}

function Install-WindowsFeatureSafe {
  param(
    [string[]]$Names,
    [switch]$IncludeManagementTools,
    [switch]$Required
  )
  $toInstall = @()
  foreach ($name in $Names) {
    $f = Get-WindowsFeature -Name $name -ErrorAction SilentlyContinue
    if (-not $f) {
      Write-Host "  skip (not in this SKU): $name"
      continue
    }
    if ($f.Installed) { continue }
    if ("$($f.InstallState)" -eq 'Removed') {
      Write-Host "  skip (not in image): $name"
      continue
    }
    $toInstall += $name
  }
  if ($toInstall.Count -eq 0) { return }
  $params = @{ Name = $toInstall }
  if ($IncludeManagementTools) { $params.IncludeManagementTools = $true }
  $result = Install-WindowsFeature @params
  if ($Required -and -not $result.Success) {
    throw "IIS feature install failed: $($toInstall -join ', ')"
  }
  if (-not $result.Success) {
    Write-Host "  optional features not installed: $($toInstall -join ', ')" -ForegroundColor Yellow
  }
}

function Install-IisModules {
  Write-Step 'Enabling IIS'
  $worker = @(
    'Web-Server', 'Web-WebServer', 'Web-Common-Http', 'Web-Static-Content',
    'Web-Default-Doc', 'Web-Dir-Browsing', 'Web-Http-Errors', 'Web-Http-Logging',
    'Web-Request-Monitor', 'Web-Filtering', 'Web-Stat-Compression',
    'Web-Basic-Auth', 'Web-Windows-Auth'
  )
  Install-WindowsFeatureSafe -Names $worker -Required
  if (Test-ServerCore) {
    Write-Host '  Server Core: IIS Manager (GUI) は入れません。画面確認は別 PC のブラウザから。'
  } else {
    Install-WindowsFeatureSafe -Names @('Web-Mgmt-Tools', 'Web-Mgmt-Console') -IncludeManagementTools
  }

  Import-Module WebAdministration -ErrorAction SilentlyContinue

  if (Test-RewriteInstalled) {
    Write-Host '  URL Rewrite already installed'
  } else {
    Write-Step 'Installing URL Rewrite (choco)'
    Install-ChocoPackageSafe 'urlrewrite'
  }

  if (Test-ArrInstalled) {
    Write-Host '  ARR already installed'
  } else {
    Write-Step 'Installing Application Request Routing (choco)'
    if (Test-RewriteInstalled) {
      Install-ChocoPackageSafe 'iis-arr' @('--ignore-dependencies')
    } else {
      Install-ChocoPackageSafe 'iis-arr'
    }
  }

  if (-not (Test-ArrInstalled)) {
    throw 'ARR is not installed. Run: choco install iis-arr -y --ignore-dependencies'
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

if (-not $PgPassword) {
  $PgPassword = New-RandomPassword
  Write-Host "  Generated PostgreSQL password (save this): $PgPassword" -ForegroundColor Yellow
}

if (-not $BasicAuthPassword) {
  $BasicAuthPassword = New-RandomPassword
  Write-Host "  Generated Basic auth password (save this): $BasicAuthPassword" -ForegroundColor Yellow
}

Ensure-Chocolatey

Write-Step 'Installing Node.js, NSSM'
Install-ChocoPackageSafe 'nodejs' @('--version=20.18.1')
if ($InstallGit -or $RepoUrl) {
  Write-Step 'Installing Git (optional; only needed for git-based deploy)'
  Install-ChocoPackageSafe 'git'
}
Install-ChocoPackageSafe 'nssm'
$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')

Ensure-PostgresInstalled

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
  $envContent = (Get-Content $envTarget -Raw) `
    -replace 'JWT_SECRET=.*', "JWT_SECRET=$jwt" `
    -replace 'PGPASSWORD=.*', "PGPASSWORD=$PgPassword" `
    -replace 'DATABASE_URL=.*', "DATABASE_URL=$dbUrl"
  Write-Utf8NoBom $envTarget $envContent
  Write-Host "  Created: $envTarget"
}

Write-Step 'Creating PostgreSQL database'
if (-not $SkipPostgresInstall) {
  $pgBin = Get-PgBinPath
  if (-not $pgBin) { throw 'PostgreSQL bin directory not found' }
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
if (Get-Website -Name 'Default Web Site' -ErrorAction SilentlyContinue) {
  Write-Host '  Stopping Default Web Site (port 80 conflict)'
  Stop-Website -Name 'Default Web Site'
}
if (Test-Path "IIS:\Sites\$SiteName") {
  Remove-Website -Name $SiteName
}
New-Website -Name $SiteName -PhysicalPath $SiteRoot -Port 80 -Force | Out-Null
Start-Website -Name $SiteName

if (-not $SkipBasicAuth) {
  Write-Step 'Configuring IIS Basic auth'
  $appcmd = Join-Path $env:windir 'system32\inetsrv\appcmd.exe'
  & $appcmd unlock config /section:anonymousAuthentication | Out-Null
  & $appcmd unlock config /section:basicAuthentication | Out-Null

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
