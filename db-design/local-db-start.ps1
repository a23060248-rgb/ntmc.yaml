# 啟動本機資料夾叢集（port 5433）
$ErrorActionPreference = 'Stop'
$here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $here '_pgdata'
$port    = 5433

if (-not (Test-Path (Join-Path $dataDir 'PG_VERSION'))) {
  throw "尚未建立叢集，請先執行 local-db-init.ps1"
}
$verDir = Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory | Sort-Object { [int]($_.Name) } -Descending | Select-Object -First 1
$pgctl  = Join-Path $verDir.FullName 'bin\pg_ctl.exe'

& $pgctl -D $dataDir -o "-p $port" -l (Join-Path $dataDir 'server.log') -w start | Out-Host
Write-Host "資料庫已啟動：postgresql://postgres@localhost:$port/ntmc_erp"
