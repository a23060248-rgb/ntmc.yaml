param(
  [string]$ConnectionString = "postgresql://root@YOUR_HOST:YOUR_PORT/zeabur",
  [switch]$Reset
)

$ErrorActionPreference = "Stop"

function Invoke-Psql {
  param([string[]]$Arguments)

  & psql $Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "psql failed with exit code $LASTEXITCODE"
  }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

if (-not $env:PGPASSWORD) {
  $securePassword = Read-Host "請輸入 Zeabur PostgreSQL 密碼" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  try {
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

$env:PGCLIENTENCODING = "UTF8"

if ($Reset) {
  Write-Host "Resetting public schema..."
  Invoke-Psql @(
    $ConnectionString,
    "-v", "ON_ERROR_STOP=1",
    "-c", "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO root; GRANT ALL ON SCHEMA public TO public;"
  )
}

Write-Host "Importing schema.postgres.sql..."
Invoke-Psql @($ConnectionString, "-v", "ON_ERROR_STOP=1", "-f", ".\schema.postgres.sql")

Write-Host "Importing seed-reference-data.sql..."
Invoke-Psql @($ConnectionString, "-v", "ON_ERROR_STOP=1", "-f", ".\seed-reference-data.sql")

Write-Host "Importing material-import-tamhai.sql..."
Invoke-Psql @($ConnectionString, "-v", "ON_ERROR_STOP=1", "-f", ".\material-import-tamhai.sql")

Write-Host "Checking import result..."
Invoke-Psql @(
  $ConnectionString,
  "-c",
  "SELECT 'material' AS table_name, count(*) FROM material UNION ALL SELECT 'warehouse', count(*) FROM warehouse UNION ALL SELECT 'warehouse_bin', count(*) FROM warehouse_bin UNION ALL SELECT 'inventory_balance', count(*) FROM inventory_balance UNION ALL SELECT 'inventory_bin_balance', count(*) FROM inventory_bin_balance;"
)

Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
