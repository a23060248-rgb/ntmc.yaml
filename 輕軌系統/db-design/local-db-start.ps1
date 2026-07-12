# 啟動本機資料夾叢集（port 5433）
$ErrorActionPreference = 'Stop'
$here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$containerRoot = [System.IO.Path]::GetFullPath((Join-Path $here '..\..'))
$dataDir = if ($env:NTMC_PGDATA) {
  [System.IO.Path]::GetFullPath($env:NTMC_PGDATA)
} else {
  Join-Path $containerRoot '.runtime\pgdata'
}
$port    = 5433

if (-not (Test-Path (Join-Path $dataDir 'PG_VERSION'))) {
  throw "尚未建立叢集：$dataDir。請先執行 local-db-init.ps1"
}
$verDir = Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory | Sort-Object { [int]($_.Name) } -Descending | Select-Object -First 1
$pgctl  = Join-Path $verDir.FullName 'bin\pg_ctl.exe'
$pgReady = Join-Path $verDir.FullName 'bin\pg_isready.exe'

& $pgReady -h 127.0.0.1 -p $port | Out-Host
if ($LASTEXITCODE -eq 0) {
  Write-Host "資料庫已在執行：postgresql://postgres@localhost:$port/ntmc_erp"
  exit 0
}

& $pgctl -D $dataDir -o "-p $port" -l (Join-Path $dataDir 'server.log') -w start | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "PostgreSQL 啟動失敗（pg_ctl exit code $LASTEXITCODE）。"
}

& $pgReady -h 127.0.0.1 -p $port | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "PostgreSQL 啟動後仍未通過 pg_isready。"
}
Write-Host "資料庫已啟動：postgresql://postgres@localhost:$port/ntmc_erp"
