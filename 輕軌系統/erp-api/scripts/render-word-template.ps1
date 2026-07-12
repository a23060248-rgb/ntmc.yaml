param(
  [Parameter(Mandatory = $true)][string]$TemplatePath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$MappingsPath
)

$ErrorActionPreference = 'Stop'
$word = $null
$document = $null

try {
  if (-not (Test-Path -LiteralPath $TemplatePath)) { throw "Word template not found: $TemplatePath" }
  $outputDirectory = Split-Path -Parent $OutputPath
  if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  }
  $mappings = Get-Content -Raw -Encoding UTF8 -LiteralPath $MappingsPath | ConvertFrom-Json
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $document = $word.Documents.Open($TemplatePath, $false, $true)

  foreach ($mapping in $mappings) {
    $value = if ($null -eq $mapping.value) { '' } else { [string]$mapping.value }
    if ($mapping.targetType -eq 'BOOKMARK' -and $document.Bookmarks.Exists([string]$mapping.target)) {
      $range = $document.Bookmarks.Item([string]$mapping.target).Range
      $range.Text = $value
      $document.Bookmarks.Add([string]$mapping.target, $range) | Out-Null
      continue
    }

    foreach ($storyRange in $document.StoryRanges) {
      $currentRange = $storyRange
      while ($null -ne $currentRange) {
        $find = $currentRange.Find
        $find.ClearFormatting()
        $find.Replacement.ClearFormatting()
        $find.Text = [string]$mapping.target
        $find.Replacement.Text = $value
        $find.Forward = $true
        $find.Wrap = 1
        $find.Format = $false
        $find.MatchWildcards = $false
        $find.Execute($find.Text, $false, $false, $false, $false, $false, $true, 1, $false, $value, 2) | Out-Null
        $currentRange = $currentRange.NextStoryRange
      }
    }
  }

  $extension = [IO.Path]::GetExtension($OutputPath).ToLowerInvariant()
  $format = if ($extension -eq '.docx') { 12 } else { 0 }
  $document.SaveAs2($OutputPath, $format)
}
finally {
  if ($null -ne $document) { $document.Close($false) }
  if ($null -ne $word) { $word.Quit() }
  if ($null -ne $document) { [Runtime.InteropServices.Marshal]::ReleaseComObject($document) | Out-Null }
  if ($null -ne $word) { [Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
