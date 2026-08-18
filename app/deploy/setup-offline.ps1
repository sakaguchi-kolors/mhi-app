#Requires -RunAsAdministrator
#Requires -Version 5.1
# インターネット不要の初回構築。キット同梱のインストーラと完成品を使う。
# Chocolatey / npm ci / prisma generate は行わない。
param(
  [string]$KitRoot = '',
  [switch]$SkipPostgresInstall,
  [switch]$SkipBasicAuth,
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

function New-JwtSecret {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return [Convert]::ToBase64String($bytes)
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

function Refresh-Path {
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
    [System.Environment]::GetEnvironmentVariable('Path', 'User')
}

function Add-MachinePath([string]$Dir) {
  $current = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  if ($current -split ';' -contains $Dir) { return }
  [Environment]::SetEnvironmentVariable('Path', "$current;$Dir", 'Machine')
  Refresh-Path
}

function Find-KitRoot {
  $dir = $PSScriptRoot
  for ($i = 0; $i -lt 8; $i++) {
    if (Test-Path (Join-Path $dir 'installers')) { return $dir }
    $parent = Split-Path $dir -Parent
    if (-not $parent -or $parent -eq $dir) { break }
    $dir = $parent
  }
  throw 'installers/ が見つかりません。キット展開先で setup-offline.ps1 を実行するか -KitRoot を指定してください。'
}

function Get-Installer([string]$Dir, [string]$Pattern) {
  $hit = Get-ChildItem -Path $Dir -Filter $Pattern -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $hit) { throw "installer not found: $Pattern in $Dir" }
  return $hit.FullName
}

function Invoke-Msi([string]$Msi) {
  Write-Host "  msiexec $Msi"
  $p = Start-Process msiexec.exe -ArgumentList @('/i', $Msi, '/qn', '/norestart') -Wait -PassThru
  if ($p.ExitCode -notin @(0, 3010)) { throw "MSI failed ($($p.ExitCode)): $Msi" }
}

function Test-RewriteInstalled {
  if (Get-WebGlobalModule -Name 'RewriteModule' -ErrorAction SilentlyContinue) { return $true }
  return Test-Path 'C:\Windows\System32\inetsrv\rewrite.dll'
}

function Test-ArrInstalled {
  if (Get-WebGlobalModule -Name 'ApplicationRequestRouting' -ErrorAction SilentlyContinue) { return $true }
  return Test-Path 'C:\Program Files\IIS\Application Request Routing\requestRouter.dll'
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

function Get-NodeExe {
  Refresh-Path
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $fallback = 'C:\Program Files\nodejs\node.exe'
  if (Test-Path $fallback) { return $fallback }
  throw 'node.exe が見つかりません。Node.js のインストールを確認してください。'
}

function Get-NssmExe {
  Refresh-Path
  $cmd = Get-Command nssm -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $fallback = 'C:\apps\nssm\nssm.exe'
  if (Test-Path $fallback) { return $fallback }
  throw 'nssm.exe が見つかりません。'
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

function Install-IisWorker {
  Write-Step 'Enabling IIS (Windows feature, no download)'
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
}

if (-not $KitRoot) { $KitRoot = Find-KitRoot }
$KitRoot = (Resolve-Path $KitRoot).Path
$installers = Join-Path $KitRoot 'installers'
$staging = Join-Path $KitRoot 'staging-mhi-app'
if (-not (Test-Path $installers)) { throw "installers not found: $installers" }
if (-not (Test-Path $staging)) { throw "staging-mhi-app not found: $staging" }

if (-not $PgPassword) {
  $PgPassword = New-RandomPassword
  Write-Host "  Generated PostgreSQL password (save this): $PgPassword" -ForegroundColor Yellow
}
if (-not $BasicAuthPassword) {
  $BasicAuthPassword = New-RandomPassword
  Write-Host "  Generated Basic auth password (save this): $BasicAuthPassword" -ForegroundColor Yellow
}

Write-Step 'VC++ Redistributable'
$vc = Get-Installer $installers 'vc_redist*.exe'
$p = Start-Process $vc -ArgumentList @('/install', '/quiet', '/norestart') -Wait -PassThru
if ($p.ExitCode -notin @(0, 1638, 3010)) {
  Write-Host "  vc_redist exit $($p.ExitCode) (continuing if already installed)" -ForegroundColor Yellow
}

Write-Step 'Node.js 20 (local MSI)'
if (-not (Get-Command node -ErrorAction SilentlyContinue) -and -not (Test-Path 'C:\Program Files\nodejs\node.exe')) {
  Invoke-Msi (Get-Installer $installers 'node-v20*-x64.msi')
}
Refresh-Path
Get-NodeExe | Out-Null

Write-Step 'NSSM (local zip)'
$nssmDir = 'C:\apps\nssm'
if (-not (Test-Path (Join-Path $nssmDir 'nssm.exe'))) {
  New-Item -ItemType Directory -Path $nssmDir -Force | Out-Null
  $nssmZip = Get-Installer $installers 'nssm-*.zip'
  $nssmTmp = Join-Path $env:TEMP 'mhi-nssm'
  if (Test-Path $nssmTmp) { Remove-Item $nssmTmp -Recurse -Force }
  Expand-Archive -Path $nssmZip -DestinationPath $nssmTmp -Force
  $nssmBin = Get-ChildItem $nssmTmp -Recurse -Filter 'nssm.exe' |
    Where-Object { $_.FullName -match 'win64|64' } |
    Select-Object -First 1
  if (-not $nssmBin) {
    $nssmBin = Get-ChildItem $nssmTmp -Recurse -Filter 'nssm.exe' | Select-Object -First 1
  }
  if (-not $nssmBin) { throw 'nssm.exe not found in zip' }
  Copy-Item $nssmBin.FullName (Join-Path $nssmDir 'nssm.exe') -Force
}
Add-MachinePath $nssmDir

if (-not $SkipPostgresInstall) {
  $existingPg = Get-PgBinPath
  if ($existingPg) {
    Write-Step "PostgreSQL found: $existingPg"
  } else {
    Write-Step 'PostgreSQL 18 (local installer)'
    $pgExe = Get-Installer $installers 'postgresql-18*.exe'
    # BitRock installer wants space-separated flags (not --key=value).
    # Quote paths with spaces in one ArgumentList string for Start-Process.
    $pgArgs = @(
      '--mode unattended',
      '--unattendedmodeui none',
      "--superpassword $PgPassword",
      '--servicename postgresql-x64-18',
      '--serverport 5432',
      '--disable-components pgAdmin,stackbuilder',
      '--prefix "C:\Program Files\PostgreSQL\18"'
    ) -join ' '
    $p = Start-Process $pgExe -ArgumentList $pgArgs -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "PostgreSQL installer failed: $($p.ExitCode)" }
    Start-Sleep -Seconds 5
    if (-not (Get-PgBinPath)) { throw 'PostgreSQL install finished but psql.exe was not found' }
  }
}

Install-IisWorker

Import-Module WebAdministration -ErrorAction SilentlyContinue

if (-not (Test-RewriteInstalled)) {
  Write-Step 'IIS URL Rewrite (local MSI)'
  Invoke-Msi (Get-Installer $installers 'rewrite*.msi')
}
if (-not (Test-ArrInstalled)) {
  Write-Step 'IIS ARR (local MSI)'
  Invoke-Msi (Get-Installer $installers 'requestRouter*.msi')
}
if (-not (Test-ArrInstalled)) { throw 'ARR is not installed' }

Write-Step 'Enabling ARR proxy'
Import-Module WebAdministration
Set-WebConfigurationProperty -pspath 'MACHINE/WEBROOT/APPHOST' -filter 'system.webServer/proxy' -name 'enabled' -value 'True'

Write-Step "Copy app to $AppRoot"
New-Item -ItemType Directory -Path $AppRoot -Force | Out-Null
New-Item -ItemType Directory -Path $SiteRoot -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $AppRoot 'logs') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $AppRoot 'data\csv') -Force | Out-Null
robocopy $staging $AppRoot /E /XD data logs /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }

$appDir = Join-Path $AppRoot 'app'
if (-not (Test-Path $appDir)) { throw "app/ not found: $appDir" }

$sampleCsv = Join-Path $appDir 'sample-data'
$csvDir = Join-Path $AppRoot 'data\csv'
$requiredCsv = @(
  @{ Dest = 'FLEXSCHE結果出力5(残工程数見直し).csv'; Pattern = 'FLEXSCHE*.csv' },
  @{ Dest = 'OCTPuS工程実績.csv'; Pattern = 'OCTPuS*.csv' },
  @{ Dest = 'PBS部品計画納期リスト.csv'; Pattern = 'PBS*.csv' },
  @{ Dest = 'SHOP_JOBマスタ.csv'; Pattern = 'SHOP_JOB*.csv' }
)
$kitCsv = Join-Path $KitRoot 'csv-for-aws'
$csvSources = @($sampleCsv, $kitCsv) | Where-Object { Test-Path $_ }
foreach ($entry in $requiredCsv) {
  $name = $entry.Dest
  $dest = Join-Path $csvDir $name
  if (Test-Path $dest) { continue }
  $copied = $false
  foreach ($srcDir in $csvSources) {
    $src = Join-Path $srcDir $name
    if (Test-Path $src) {
      Copy-Item $src $dest -Force
      $copied = $true
      break
    }
    $glob = Get-ChildItem -Path (Join-Path $srcDir $entry.Pattern) -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($glob) {
      Copy-Item $glob.FullName $dest -Force
      $copied = $true
      break
    }
  }
  if (-not $copied) {
    throw "CSV missing: $name (place files in app\sample-data or kit\csv-for-aws before setup)"
  }
}

Write-Step 'Creating backend/.env'
$envExample = Join-Path $appDir '.env.staging.example'
$envTarget = Join-Path $appDir 'backend\.env'
if (-not (Test-Path $envTarget)) {
  if (-not (Test-Path $envExample)) { throw ".env.staging.example not found: $envExample" }
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
$pgBin = Get-PgBinPath
if (-not $pgBin) { throw 'PostgreSQL bin directory not found' }
$psql = Join-Path $pgBin 'psql.exe'
$env:PGPASSWORD = $PgPassword
$roleSql = "DO `$`$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mop') THEN CREATE ROLE mop LOGIN PASSWORD '$PgPassword'; END IF; END `$`$;"
& $psql -U postgres -h localhost -c $roleSql
if ($LASTEXITCODE -ne 0) { throw 'Failed to create PostgreSQL role mop' }
$dbCheck = & $psql -U postgres -h localhost -tc "SELECT 1 FROM pg_database WHERE datname = 'mop'"
if ($dbCheck.Trim() -ne '1') {
  & $psql -U postgres -h localhost -c 'CREATE DATABASE mop OWNER mop;'
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create PostgreSQL database mop' }
}
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

Write-Step 'Registering Windows Service'
$backend = Join-Path $appDir 'backend'
$nodeExe = Get-NodeExe
$nssmExe = Get-NssmExe
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service) {
  Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
  & $nssmExe remove $ServiceName confirm
}
& $nssmExe install $ServiceName $nodeExe 'dist\main.js'
& $nssmExe set $ServiceName AppDirectory $backend
& $nssmExe set $ServiceName AppStdout (Join-Path $AppRoot 'logs\api.out.log')
& $nssmExe set $ServiceName AppStderr (Join-Path $AppRoot 'logs\api.err.log')
& $nssmExe set $ServiceName AppRotateFiles 1
& $nssmExe set $ServiceName AppExit Default Restart
& $nssmExe set $ServiceName Start SERVICE_AUTO_START

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

Write-Step 'First deploy (SkipNpm)'
& (Join-Path $appDir 'deploy\deploy.ps1') -FirstRun -SkipNpm -RepoRoot $appDir -SiteRoot $SiteRoot -ServiceName $ServiceName

Write-Host "`nSetup complete (offline)." -ForegroundColor Green
Write-Host "  Site: $SiteName  http://<server>/"
if (-not $SkipBasicAuth) {
  Write-Host "  Basic auth: $BasicAuthUser / $BasicAuthPassword"
}
Write-Host '  Then open /setup to create admin account'
Write-Host '  Save the PostgreSQL password shown above.'
