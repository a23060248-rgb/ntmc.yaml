# 停止本機資料夾叢集
$ErrorActionPreference = 'Stop'
$here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $here '_pgdata'

if (-not (Test-Path (Join-Path $dataDir 'PG_VERSION'))) {
  throw "找不到叢集（_pgdata）。"
}
$verDir = Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory | Sort-Object { [int]($_.Name) } -Descending | Select-Object -First 1
$pgctl  = Join-Path $verDir.FullName 'bin\pg_ctl.exe'

& $pgctl -D $dataDir -m fast -w stop | Out-Host
Write-Host "資料庫已停止。"
