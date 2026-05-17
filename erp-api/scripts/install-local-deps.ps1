$ErrorActionPreference = "Stop"

$npm = "C:\Program Files\nodejs\npm.cmd"
$runtime = Join-Path $env:LOCALAPPDATA "erp-api-runtime"
$cache = Join-Path $env:LOCALAPPDATA "npm-cache-erp-api"

if (-not (Test-Path -LiteralPath $npm)) {
  throw "npm.cmd not found at $npm"
}

New-Item -ItemType Directory -Force -Path $runtime | Out-Null

& $npm install `
  --prefix $runtime `
  express@^4.21.2 `
  pg@^8.13.1 `
  cors@^2.8.5 `
  dotenv@^16.4.7 `
  --no-audit `
  --no-fund `
  --cache $cache

if ($LASTEXITCODE -ne 0) {
  throw "npm install failed with exit code $LASTEXITCODE"
}

Write-Host "Dependencies installed to $runtime"
