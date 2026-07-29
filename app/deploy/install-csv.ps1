#Requires -Version 5.1
<#
  提供用 CSV を C:\apps\mhi-app\data\csv に配置して ETL を実行する。
  使い方（EC2 上）:
    1) dist-release/csv-for-aws/ を RDP で EC2 にコピー（例: C:\Temp\csv-for-aws）
    2) 管理者 PowerShell:
         cd C:\apps\mhi-app\app\deploy
         .\install-csv.ps1 -SourceDir C:\Temp\csv-for-aws
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$SourceDir,
  [string]$CsvDir = 'C:\apps\mhi-app\data\csv',
  [switch]$SkipEtl
)

$ErrorActionPreference = 'Stop'

$files = @(
  'FLEXSCHE結果出力5(残工程数見直し).csv',
  'OCTPuS工程実績.csv',
  'PBS部品計画納期リスト.csv',
  'SHOP_JOBマスタ.csv'
)

if (-not (Test-Path $SourceDir)) {
  throw "SourceDir not found: $SourceDir"
}

foreach ($f in $files) {
  $src = Join-Path $SourceDir $f
  if (-not (Test-Path $src)) {
    throw "Missing file: $src"
  }
}

$backup = "$CsvDir-backup-$(Get-Date -Format yyyyMMdd-HHmmss)"
if (Test-Path $CsvDir) {
  Write-Host "Backup: $CsvDir -> $backup"
  Copy-Item $CsvDir $backup -Recurse -Force
}

New-Item -ItemType Directory -Path $CsvDir -Force | Out-Null

Write-Host "Copy CSV -> $CsvDir"
foreach ($f in $files) {
  Copy-Item (Join-Path $SourceDir $f) (Join-Path $CsvDir $f) -Force
  $size = (Get-Item (Join-Path $CsvDir $f)).Length
  Write-Host "  OK $f ($([math]::Round($size / 1MB, 1)) MB)"
}

if ($SkipEtl) {
  Write-Host 'SkipEtl: copy only. Run: cd C:\apps\mhi-app\app\backend; npm run etl'
  exit 0
}

Write-Host "`nRunning ETL (OCTPuS が大容量の場合は数分〜十数分)..."
Push-Location 'C:\apps\mhi-app\app\backend'
try {
  npm run etl
} finally {
  Pop-Location
}

Write-Host "`nDone. Open the site and verify parts list." -ForegroundColor Green
