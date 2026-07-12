param(
  [string]$ExpectedLegacySha256 = "46647B38352C3B543E7A78FE63B801008D237AF49C88F5E0A2557AF7DBFB2E73"
)

$ErrorActionPreference = "Stop"
$apiRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$projectRoot = Split-Path -Parent $apiRoot
$gitRoot = (& git -C $projectRoot rev-parse --show-toplevel).Trim()
if (-not $gitRoot) { throw "Git repository root could not be resolved" }
$frontendRoot = Join-Path $projectRoot "frontend"
$reportDir = Join-Path $projectRoot ".local-rehearsal"
$checks = [System.Collections.Generic.List[string]]::new()

function Invoke-CheckedCommand {
  param(
    [string]$Label,
    [string]$WorkingDirectory,
    [string]$Command,
    [string[]]$Arguments
  )

  Push-Location $WorkingDirectory
  try {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE" }
    $checks.Add("- $Label`: PASS")
  } finally {
    Pop-Location
  }
}

$legacyMatch = Get-ChildItem -LiteralPath $gitRoot -File -Filter "*.html" |
  Where-Object { (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash -eq $ExpectedLegacySha256 } |
  Select-Object -First 1
if (-not $legacyMatch) { throw "Legacy HTML with the expected SHA256 was not found" }
$legacyPath = $legacyMatch.FullName
$legacyBefore = $ExpectedLegacySha256

$nodeVersion = (& node --version).Trim()
$npmVersion = (& npm.cmd --version).Trim()
$postgresVersion = (& psql --version).Trim()
$wordVersion = "not-detected"
$officeRegistry = "HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\Configuration"
if (Test-Path $officeRegistry) {
  $wordVersion = (Get-ItemProperty -Path $officeRegistry).VersionToReport
}

Invoke-CheckedCommand "API syntax check" $apiRoot "npm.cmd" @("run", "check")
Invoke-CheckedCommand "API tests" $apiRoot "npm.cmd" @("test")
Invoke-CheckedCommand "Frontend tests" $frontendRoot "npm.cmd" @("test")
Invoke-CheckedCommand "Frontend single-file build" $frontendRoot "npm.cmd" @("run", "build")
Invoke-CheckedCommand "Git unstaged diff check" $gitRoot "git" @("diff", "--check")
Invoke-CheckedCommand "Git staged diff check" $gitRoot "git" @("diff", "--cached", "--check")

$legacyAfter = (Get-FileHash -Algorithm SHA256 -LiteralPath $legacyPath).Hash
if ($legacyAfter -ne $legacyBefore) { throw "Legacy HTML changed during verification" }
$checks.Add("- Legacy SHA256 unchanged: PASS")

New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportPath = Join-Path $reportDir "baseline-$stamp.md"
$gitStatus = (& git -C $gitRoot status --short) -join "`n"
$report = @(
  "# Baseline verification $stamp",
  "",
  "- Node: $nodeVersion",
  "- npm: $npmVersion",
  "- PostgreSQL client: $postgresVersion",
  "- Microsoft Word/Office: $wordVersion",
  "- Legacy file: $($legacyMatch.Name)",
  "- Legacy SHA256: $legacyAfter",
  "",
  "## Checks",
  ""
) + $checks + @(
  "",
  "## Git status captured before handoff",
  "",
  "``````text",
  $gitStatus,
  "``````"
)
$report | Set-Content -LiteralPath $reportPath -Encoding UTF8
Write-Host "Baseline verification passed: $reportPath"
