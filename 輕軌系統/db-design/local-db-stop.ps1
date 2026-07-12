# 停止本機資料夾叢集
$ErrorActionPreference = 'Stop'
$here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$containerRoot = [System.IO.Path]::GetFullPath((Join-Path $here '..\..'))
$dataDir = if ($env:NTMC_PGDATA) {
  [System.IO.Path]::GetFullPath($env:NTMC_PGDATA)
} else {
  Join-Path $containerRoot '.runtime\pgdata'
}

if (-not (Test-Path (Join-Path $dataDir 'PG_VERSION'))) {
  throw "找不到叢集：$dataDir。"
}
$verDir = Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory | Sort-Object { [int]($_.Name) } -Descending | Select-Object -First 1
$pgctl  = Join-Path $verDir.FullName 'bin\pg_ctl.exe'
$pgReady = Join-Path $verDir.FullName 'bin\pg_isready.exe'

& $pgReady -h 127.0.0.1 -p 5433 | Out-Host
if ($LASTEXITCODE -ne 0) {
  Write-Host '資料庫未執行，不需要停止。'
  exit 0
}

& $pgctl -D $dataDir -m fast -w stop | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "PostgreSQL 停止失敗（pg_ctl exit code $LASTEXITCODE）。"
}
Write-Host "資料庫已停止。"
