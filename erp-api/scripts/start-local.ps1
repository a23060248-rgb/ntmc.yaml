param(
  [int]$Port = 3001
)

$ErrorActionPreference = "Stop"

$node = "C:\Program Files\nodejs\node.exe"
$runtimeNodeModules = Join-Path $env:LOCALAPPDATA "erp-api-runtime\node_modules"
$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (-not (Test-Path -LiteralPath $node)) {
  throw "node.exe not found at $node"
}

if (-not (Test-Path -LiteralPath $runtimeNodeModules)) {
  throw "Dependencies not found. Run scripts\install-local-deps.ps1 first."
}

$env:NODE_PATH = $runtimeNodeModules
$env:PORT = [string]$Port

Set-Location $projectRoot
& $node ".\src\server.js"
