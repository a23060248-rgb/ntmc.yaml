param(
  [Parameter(Mandatory = $true)][string]$SourcePath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$SpecsPath
)

$ErrorActionPreference = 'Stop'
$word = $null
$document = $null
$workingPath = $null

function Find-AnchorRange {
  param(
    [Parameter(Mandatory = $true)]$Document,
    [Parameter(Mandatory = $true)][int]$StoryType,
    [Parameter(Mandatory = $true)][string]$Anchor,
    [Parameter(Mandatory = $true)][int]$Occurrence
  )

  $matchNumber = 0
  foreach ($storyRange in $Document.StoryRanges) {
    if ([int]$storyRange.StoryType -ne $StoryType) { continue }
    $currentRange = $storyRange
    while ($null -ne $currentRange) {
      $storyEnd = [int]$currentRange.End
      $searchStart = [int]$currentRange.Start
      while ($searchStart -lt $storyEnd) {
        $searchRange = $currentRange.Duplicate
        $searchRange.Start = $searchStart
        $searchRange.End = $storyEnd
        $find = $searchRange.Find
        $find.ClearFormatting()
        $find.Text = $Anchor
        $find.Forward = $true
        $find.Wrap = 0
        $find.Format = $false
        $find.MatchWildcards = $false
        if (-not $find.Execute()) { break }

        $matchNumber += 1
        if ($matchNumber -eq $Occurrence) { return $searchRange }
        $searchStart = [Math]::Max([int]$searchRange.End, [int]$searchRange.Start + 1)
      }
      $currentRange = $currentRange.NextStoryRange
    }
  }
  return $null
}

try {
  if (-not (Test-Path -LiteralPath $SourcePath)) { throw "Word source not found: $SourcePath" }
  if (-not (Test-Path -LiteralPath $SpecsPath)) { throw "Bookmark specs not found: $SpecsPath" }

  $resolvedSource = (Resolve-Path -LiteralPath $SourcePath).Path
  $resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
  if ($resolvedSource -eq $resolvedOutput) { throw 'SourcePath and OutputPath must be different' }

  $outputDirectory = Split-Path -Parent $resolvedOutput
  if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  }

  $specs = Get-Content -Raw -Encoding UTF8 -LiteralPath $SpecsPath | ConvertFrom-Json
  if ($null -eq $specs -or @($specs).Count -eq 0) { throw 'At least one bookmark spec is required' }

  $workingPath = Join-Path $outputDirectory ("word-prepare-{0}{1}" -f ([guid]::NewGuid().ToString('N')), [IO.Path]::GetExtension($resolvedSource))
  Copy-Item -LiteralPath $resolvedSource -Destination $workingPath -Force

  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $document = $word.Documents.Open($workingPath, $false, $false)

  foreach ($spec in @($specs)) {
    $bookmark = [string]$spec.bookmark
    $anchor = [string]$spec.anchor
    $storyType = [int]$spec.storyType
    $occurrence = if ($null -eq $spec.occurrence) { 1 } else { [int]$spec.occurrence }
    if ([string]::IsNullOrWhiteSpace($bookmark) -or [string]::IsNullOrWhiteSpace($anchor)) {
      throw 'Each bookmark spec requires bookmark and anchor values'
    }
    if ($occurrence -lt 1) { throw "Invalid occurrence for bookmark $bookmark" }

    $range = Find-AnchorRange -Document $document -StoryType $storyType -Anchor $anchor -Occurrence $occurrence
    if ($null -eq $range) { throw "Anchor '$anchor' occurrence $occurrence was not found for bookmark $bookmark" }
    if ($document.Bookmarks.Exists($bookmark)) { $document.Bookmarks.Item($bookmark).Delete() }
    $document.Bookmarks.Add($bookmark, $range) | Out-Null
  }

  # Always save the prepared rehearsal copy as DOCX. The source file is never modified.
  $document.SaveAs2($resolvedOutput, 12)
}
finally {
  if ($null -ne $document) { $document.Close($false) }
  if ($null -ne $word) { $word.Quit() }
  if ($null -ne $document) { [Runtime.InteropServices.Marshal]::ReleaseComObject($document) | Out-Null }
  if ($null -ne $word) { [Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null }
  if ($null -ne $workingPath -and (Test-Path -LiteralPath $workingPath)) { Remove-Item -LiteralPath $workingPath -Force }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
