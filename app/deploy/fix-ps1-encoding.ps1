#Requires -Version 5.1
# ASCII only so Windows PowerShell 5.1 can always parse this file.
# Adds UTF-8 BOM to sibling deploy scripts (Japanese strings otherwise break parsing).
$utf8 = New-Object System.Text.UTF8Encoding $false
$utf8bom = New-Object System.Text.UTF8Encoding $true
$dir = $PSScriptRoot
$names = @(
  'make-offline-kit.ps1',
  'setup-offline.ps1',
  'deploy-offline.ps1',
  'deploy.ps1',
  'setup-server.ps1',
  'backup-db.ps1',
  'rotate-logs.ps1',
  'install-ops-tasks.ps1'
)
foreach ($name in $names) {
  $path = Join-Path $dir $name
  if (-not (Test-Path $path)) { continue }
  $text = [System.IO.File]::ReadAllText($path, $utf8)
  [System.IO.File]::WriteAllText($path, $text, $utf8bom)
  Write-Host "BOM: $name"
}
