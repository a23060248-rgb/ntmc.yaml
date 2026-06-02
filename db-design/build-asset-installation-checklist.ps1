param(
  [string]$PositionPath = ".\vehicle-position-slots-tamhai.csv",
  [string]$OutputPath = ".\asset-installation-field-checklist-tamhai.csv"
)

$scriptPath = Join-Path $PSScriptRoot "build-asset-installation-checklist.mjs"
node $scriptPath $PositionPath $OutputPath
