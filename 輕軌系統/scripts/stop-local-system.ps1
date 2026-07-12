$ErrorActionPreference = 'Stop'
$systemRoot = Split-Path -Parent $PSScriptRoot
$pidPath = Join-Path $systemRoot '.local-rehearsal\light-rail-api.pid'
$dbStop = Join-Path $systemRoot 'db-design\local-db-stop.ps1'

if (Test-Path -LiteralPath $pidPath) {
  $apiPid = [int](Get-Content -LiteralPath $pidPath -TotalCount 1)
  $process = Get-Process -Id $apiPid -ErrorAction SilentlyContinue
  if ($process -and $process.ProcessName -eq 'node') {
    Stop-Process -Id $apiPid -Force
    Write-Host "ERP API stopped (PID $apiPid)."
  }
  Remove-Item -LiteralPath $pidPath -Force
} else {
  Write-Host 'No running ERP API PID was recorded by this project.'
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dbStop
if ($LASTEXITCODE -ne 0) {
  throw "PostgreSQL shutdown failed (exit code $LASTEXITCODE)."
}
