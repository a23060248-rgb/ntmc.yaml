# 本機 PostgreSQL：在這個資料夾建立叢集、啟動、建庫、灌入 schema 與種子。
# 前置：先安裝 PostgreSQL → winget install -e --id PostgreSQL.PostgreSQL
# 執行：在 db-design 目錄開 PowerShell → powershell -ExecutionPolicy Bypass -File local-db-init.ps1
# 只需跑一次；之後開機用 local-db-start.ps1 啟動即可。

$ErrorActionPreference = 'Stop'
$env:PGCLIENTENCODING = 'UTF8'

$here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $here '_pgdata'
$port    = 5433
$dbName  = 'ntmc_erp'

# 找 PostgreSQL 安裝目錄
$pgRoot = 'C:\Program Files\PostgreSQL'
if (-not (Test-Path $pgRoot)) {
  throw "找不到 PostgreSQL。請先安裝： winget install -e --id PostgreSQL.PostgreSQL"
}
$verDir = Get-ChildItem $pgRoot -Directory | Sort-Object { [int]($_.Name) } -Descending | Select-Object -First 1
$pgBin  = Join-Path $verDir.FullName 'bin'
$initdb = Join-Path $pgBin 'initdb.exe'
$pgctl  = Join-Path $pgBin 'pg_ctl.exe'
$psql   = Join-Path $pgBin 'psql.exe'
Write-Host "使用 PostgreSQL： $pgBin"

# 1) 建立叢集（只做一次；用 trust 本機免密碼，superuser = postgres）
if (-not (Test-Path (Join-Path $dataDir 'PG_VERSION'))) {
  Write-Host "建立資料叢集： $dataDir"
  & $initdb -D $dataDir -U postgres -A trust --encoding=UTF8 --locale=C | Out-Host
} else {
  Write-Host "叢集已存在，略過 initdb。"
}

# 2) 啟動（port 5433，獨立於預設 5432 服務）
Write-Host "啟動資料庫（port $port）..."
& $pgctl -D $dataDir -o "-p $port" -l (Join-Path $dataDir 'server.log') -w start | Out-Host

# 3) 建立資料庫（若不存在）
$exists = (& $psql -h localhost -p $port -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$dbName'" | Out-String).Trim()
if ($exists -ne '1') {
  Write-Host "建立資料庫 $dbName ..."
  & $psql -h localhost -p $port -U postgres -d postgres -c "CREATE DATABASE $dbName" | Out-Host
} else {
  Write-Host "資料庫 $dbName 已存在。"
}

# 4) 依順序灌入（在 db-design 內，import 的 \copy 相對路徑才正確）
Set-Location $here
$files = @(
  'schema.postgres.sql',
  'seed-reference-data.sql',
  'seed-repair-workflow-options.sql',
  'seed-reference-lists.sql',
  'material-import-tamhai.sql',
  'import-master-data.sql',
  'import-pm-templates.sql'
)
foreach ($f in $files) {
  Write-Host "==> 灌入 $f"
  & $psql -h localhost -p $port -U postgres -d $dbName -v ON_ERROR_STOP=1 -f $f | Out-Host
}

# 5) 更新 erp-api/.env 的 DATABASE_URL（指向本機；保留其他行與註解）
$envPath  = Join-Path (Split-Path $here -Parent) 'erp-api\.env'
$localUrl = "postgresql://postgres@localhost:$port/$dbName"
if (Test-Path $envPath) {
  $found = $false
  $out = foreach ($line in (Get-Content $envPath)) {
    if ($line -match '^\s*DATABASE_URL=') { $found = $true; "DATABASE_URL=$localUrl" } else { $line }
  }
  if (-not $found) { $out += "DATABASE_URL=$localUrl" }
  $out | Set-Content -Path $envPath -Encoding utf8
} else {
  "PORT=3001`nDATABASE_URL=$localUrl`nCORS_ORIGIN=*`nDATABASE_SSL=false" | Set-Content -Path $envPath -Encoding utf8
}

Write-Host ""
Write-Host "完成 ✅  本機資料庫已就緒：$localUrl"
Write-Host "下一步啟動 API： cd ..\erp-api ; npm install ; npm start"
Write-Host "之後開機只要跑 local-db-start.ps1 啟動資料庫即可。"
