[CmdletBinding()]
param(
  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
$systemRoot = Split-Path -Parent $PSScriptRoot
$dbStart = Join-Path $systemRoot 'db-design\local-db-start.ps1'
$apiLauncher = Join-Path $PSScriptRoot 'start-api-detached.cjs'
$apiHealth = 'http://127.0.0.1:3001/api/health'
$frontendUrl = 'http://127.0.0.1:3001/'
$indexPath = Join-Path $systemRoot 'frontend\dist\index.html'
$node = (Get-Command node.exe -ErrorAction Stop).Source

Write-Host '1/3 Starting local PostgreSQL...'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dbStart
if ($LASTEXITCODE -ne 0) {
  throw "PostgreSQL startup failed (exit code $LASTEXITCODE)."
}

function Test-ApiHealth {
  try {
    $response = Invoke-RestMethod -Uri $apiHealth -TimeoutSec 2
    return [bool]$response.ok
  } catch {
    return $false
  }
}

Write-Host '2/3 Starting ERP API...'
if (-not (Test-ApiHealth)) {
  $apiPid = & $node $apiLauncher
  if ($LASTEXITCODE -ne 0 -or -not $apiPid) {
    throw 'ERP API background process failed to start.'
  }

  $ready = $false
  foreach ($attempt in 1..30) {
    Start-Sleep -Milliseconds 500
    if (Test-ApiHealth) {
      $ready = $true
      break
    }
  }
  if (-not $ready) {
    $errorLog = Join-Path $systemRoot '.local-rehearsal\light-rail-api.err.log'
    if (Test-Path -LiteralPath $errorLog) {
      Get-Content -LiteralPath $errorLog -Tail 20 | Out-Host
    }
    throw 'ERP API did not pass its health check in time.'
  }
}

if (-not (Test-Path -LiteralPath $indexPath)) {
  throw "Single HTML build not found: $indexPath. Run npm run build in frontend first."
}

Write-Host '3/3 Light rail maintenance system is ready.'
Write-Host "API: $apiHealth"
Write-Host "Frontend: $frontendUrl"

if (-not $NoOpen) {
  Start-Process -FilePath $frontendUrl
}
