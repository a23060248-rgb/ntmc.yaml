param(
  [Parameter(Mandatory = $true)][string]$TemplatePath,
  [Parameter(Mandatory = $true)][string]$OutputJson
)

$ErrorActionPreference = "Stop"
$word = $null
$document = $null

try {
  if (-not (Test-Path -LiteralPath $TemplatePath)) { throw "Word template not found: $TemplatePath" }
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $document = $word.Documents.Open($TemplatePath, $false, $true)

  $bookmarkNames = @()
  $bookmarkDetails = @()
  foreach ($bookmark in $document.Bookmarks) {
    $bookmarkNames += [string]$bookmark.Name
    $bookmarkDetails += [ordered]@{
      name = [string]$bookmark.Name
      text = [string]$bookmark.Range.Text
      storyType = [int]$bookmark.Range.StoryType
      start = [int]$bookmark.Range.Start
      end = [int]$bookmark.Range.End
    }
  }
  $stories = @()
  foreach ($storyRange in $document.StoryRanges) {
    $currentRange = $storyRange
    $sequence = 0
    while ($null -ne $currentRange) {
      $stories += [ordered]@{
        storyType = [int]$currentRange.StoryType
        sequence = $sequence
        text = [string]$currentRange.Text
      }
      $sequence += 1
      $currentRange = $currentRange.NextStoryRange
    }
  }
  $result = [ordered]@{
    path = $TemplatePath
    pages = $document.ComputeStatistics(2)
    tables = $document.Tables.Count
    inlineShapes = $document.InlineShapes.Count
    shapes = $document.Shapes.Count
    bookmarks = $bookmarkNames
    bookmarkDetails = $bookmarkDetails
    stories = $stories
    text = [string]$document.Content.Text
  }
  $directory = Split-Path -Parent $OutputJson
  if (-not (Test-Path -LiteralPath $directory)) { New-Item -ItemType Directory -Force -Path $directory | Out-Null }
  $result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $OutputJson -Encoding UTF8
}
finally {
  if ($null -ne $document) { $document.Close($false) }
  if ($null -ne $word) { $word.Quit() }
  if ($null -ne $document) { [Runtime.InteropServices.Marshal]::ReleaseComObject($document) | Out-Null }
  if ($null -ne $word) { [Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
