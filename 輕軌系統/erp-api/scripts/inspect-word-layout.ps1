param(
  [Parameter(Mandatory = $true)][string]$TemplatePath,
  [Parameter(Mandatory = $true)][string]$OutputJson
)

$ErrorActionPreference = 'Stop'
$word = $null
$document = $null

function Clean-WordText {
  param($Value)
  return (([string]$Value) -replace "[\r\a]", '').Trim()
}

function Get-PageNumber {
  param($Range)
  try { return [int]$Range.Information(3) } catch { return $null }
}

function Get-RangePosition {
  param($Range, [int]$InformationCode)
  try { return [double]$Range.Information($InformationCode) } catch { return $null }
}

try {
  if (-not (Test-Path -LiteralPath $TemplatePath)) { throw "Word template not found: $TemplatePath" }
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $document = $word.Documents.Open($TemplatePath, $false, $true)

  $tables = @()
  for ($tableIndex = 1; $tableIndex -le $document.Tables.Count; $tableIndex++) {
    $table = $document.Tables.Item($tableIndex)
    $cells = @()
    foreach ($cell in $table.Range.Cells) {
      $cells += [ordered]@{
        row = [int]$cell.RowIndex
        column = [int]$cell.ColumnIndex
        page = Get-PageNumber $cell.Range
        start = [int]$cell.Range.Start
        end = [int]$cell.Range.End
        text = Clean-WordText $cell.Range.Text
      }
    }
    $tables += [ordered]@{
      index = $tableIndex
      pageStart = Get-PageNumber $table.Range
      start = [int]$table.Range.Start
      end = [int]$table.Range.End
      rows = [int]$table.Rows.Count
      columns = [int]$table.Columns.Count
      cells = $cells
    }
  }

  $inlineShapes = @()
  for ($shapeIndex = 1; $shapeIndex -le $document.InlineShapes.Count; $shapeIndex++) {
    $shape = $document.InlineShapes.Item($shapeIndex)
    $inlineShapes += [ordered]@{
      index = $shapeIndex
      page = Get-PageNumber $shape.Range
      start = [int]$shape.Range.Start
      end = [int]$shape.Range.End
      left = Get-RangePosition $shape.Range 5
      top = Get-RangePosition $shape.Range 6
      width = [double]$shape.Width
      height = [double]$shape.Height
      alternativeText = [string]$shape.AlternativeText
      title = [string]$shape.Title
      type = [int]$shape.Type
    }
  }

  $shapes = @()
  for ($shapeIndex = 1; $shapeIndex -le $document.Shapes.Count; $shapeIndex++) {
    $shape = $document.Shapes.Item($shapeIndex)
    $shapes += [ordered]@{
      index = $shapeIndex
      name = [string]$shape.Name
      page = Get-PageNumber $shape.Anchor
      anchorStart = [int]$shape.Anchor.Start
      left = [double]$shape.Left
      top = [double]$shape.Top
      width = [double]$shape.Width
      height = [double]$shape.Height
      relativeHorizontalPosition = [int]$shape.RelativeHorizontalPosition
      relativeVerticalPosition = [int]$shape.RelativeVerticalPosition
      alternativeText = [string]$shape.AlternativeText
      type = [int]$shape.Type
    }
  }

  $result = [ordered]@{
    path = (Resolve-Path -LiteralPath $TemplatePath).Path
    pages = [int]$document.ComputeStatistics(2)
    tables = $tables
    inlineShapes = $inlineShapes
    shapes = $shapes
  }
  $directory = Split-Path -Parent $OutputJson
  if (-not (Test-Path -LiteralPath $directory)) { New-Item -ItemType Directory -Force -Path $directory | Out-Null }
  $result | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $OutputJson -Encoding UTF8
}
finally {
  if ($null -ne $document) { $document.Close($false) }
  if ($null -ne $word) { $word.Quit() }
  if ($null -ne $document) { [Runtime.InteropServices.Marshal]::ReleaseComObject($document) | Out-Null }
  if ($null -ne $word) { [Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
