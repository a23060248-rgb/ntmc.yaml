param(
  [Parameter(Mandatory = $true)][string]$TemplatePath,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$word = $null
$document = $null

try {
  if (-not (Test-Path -LiteralPath $TemplatePath)) {
    throw "Word document not found: $TemplatePath"
  }

  $resolvedTemplate = (Resolve-Path -LiteralPath $TemplatePath).Path
  $resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
  $outputDirectory = Split-Path -Parent $resolvedOutput
  if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  }

  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $document = $word.Documents.Open($resolvedTemplate, $false, $true)
  $document.ExportAsFixedFormat($resolvedOutput, 17)
}
finally {
  if ($null -ne $document) { $document.Close($false) }
  if ($null -ne $word) { $word.Quit() }
  if ($null -ne $document) { [Runtime.InteropServices.Marshal]::ReleaseComObject($document) | Out-Null }
  if ($null -ne $word) { [Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
