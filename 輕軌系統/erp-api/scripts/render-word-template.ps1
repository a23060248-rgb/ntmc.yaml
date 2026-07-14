param(
  [Parameter(Mandatory = $true)][string]$TemplatePath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$MappingsPath
)

$ErrorActionPreference = 'Stop'
$word = $null
$document = $null

function Get-ObjectPathValue {
  param($Object, [string]$Path)
  $current = $Object
  foreach ($part in @($Path -split '\.')) {
    if ($null -eq $current) { return $null }
    $property = $current.PSObject.Properties[$part]
    if ($null -eq $property) { return $null }
    $current = $property.Value
  }
  return $current
}

function Get-ConfigValue {
  param($Config, [string]$Name, $DefaultValue = $null)
  if ($null -eq $Config) { return $DefaultValue }
  $property = $Config.PSObject.Properties[$Name]
  if ($null -eq $property) { return $DefaultValue }
  return $property.Value
}

function Get-BlockRecords {
  param($Value)
  if ($null -eq $Value) { return @() }
  $records = $Value.PSObject.Properties['records']
  if ($null -eq $records -or $null -eq $records.Value) { return @() }
  return @($records.Value)
}

function Get-RecordKey {
  param($Record)
  foreach ($name in @('itemKey', 'itemNo', 'partNo')) {
    $property = $Record.PSObject.Properties[$name]
    if ($null -ne $property -and $null -ne $property.Value) { return [string]$property.Value }
  }
  return ''
}

function Get-DefaultColumns {
  param([string]$BlockType)
  switch ($BlockType) {
    'CHECK_TABLE' {
      return @(
        [pscustomobject]@{ key = 'itemNo'; label = 'No.' },
        [pscustomobject]@{ key = 'description'; label = 'Item' },
        [pscustomobject]@{ key = 'status'; label = 'Result' },
        [pscustomobject]@{ key = 'value'; label = 'Value' },
        [pscustomobject]@{ key = 'remark'; label = 'Remark' }
      )
    }
    'MATERIAL_TABLE' {
      return @(
        [pscustomobject]@{ key = 'partNo'; label = 'Part No.' },
        [pscustomobject]@{ key = 'name'; label = 'Material' },
        [pscustomobject]@{ key = 'actualQty'; label = 'Qty' },
        [pscustomobject]@{ key = 'unit'; label = 'Unit' },
        [pscustomobject]@{ key = 'note'; label = 'Remark' }
      )
    }
    default {
      return @(
        [pscustomobject]@{ key = 'itemKey'; label = 'Point' },
        [pscustomobject]@{ key = 'status'; label = 'Result' },
        [pscustomobject]@{ key = 'value'; label = 'Value' },
        [pscustomobject]@{ key = 'remark'; label = 'Remark' }
      )
    }
  }
}

function Convert-CellValue {
  param($Value)
  if ($null -eq $Value) { return '' }
  if ($Value -is [System.Array]) { return (@($Value) -join ', ') }
  if ($Value -is [System.Management.Automation.PSCustomObject]) {
    return ($Value | ConvertTo-Json -Compress -Depth 20)
  }
  return [string]$Value
}

function Convert-MappedValue {
  param($Value, $CellMapping)
  $transform = [string](Get-ConfigValue $CellMapping 'transform' '')
  switch ($transform) {
    'EQUALS_MARK' {
      $expected = [string](Get-ConfigValue $CellMapping 'equals' '')
      if ([string]$Value -eq $expected) { return Get-ConfigValue $CellMapping 'trueValue' 'V' }
      return Get-ConfigValue $CellMapping 'falseValue' ''
    }
    'IN_SET_MARK' {
      $accepted = @(Get-ConfigValue $CellMapping 'values' @()) | ForEach-Object { [string]$_ }
      if ($accepted -contains [string]$Value) { return Get-ConfigValue $CellMapping 'trueValue' 'V' }
      return Get-ConfigValue $CellMapping 'falseValue' ''
    }
    'PREFIX_SUFFIX' {
      $prefix = [string](Get-ConfigValue $CellMapping 'prefix' '')
      $suffix = [string](Get-ConfigValue $CellMapping 'suffix' '')
      return "$prefix$(Convert-CellValue $Value)$suffix"
    }
    default { return $Value }
  }
}

function Set-WordCellText {
  param($Table, [int]$Row, [int]$Column, $Value)
  if ($Row -lt 1 -or $Column -lt 1 -or $Row -gt $Table.Rows.Count -or $Column -gt $Table.Columns.Count) {
    throw "Word table cell is outside the target table: row=$Row column=$Column"
  }
  $Table.Cell($Row, $Column).Range.Text = Convert-CellValue $Value
}

function Resolve-TargetTable {
  param($Document, $Mapping)
  $index = 0
  if ([int]::TryParse([string]$Mapping.target, [ref]$index) -and $index -ge 1 -and $index -le $Document.Tables.Count) {
    return $Document.Tables.Item($index)
  }
  $configuredIndex = [int](Get-ConfigValue $Mapping.config 'tableIndex' 0)
  if ($configuredIndex -ge 1 -and $configuredIndex -le $Document.Tables.Count) {
    return $Document.Tables.Item($configuredIndex)
  }
  if ($Document.Bookmarks.Exists([string]$Mapping.target)) {
    $range = $Document.Bookmarks.Item([string]$Mapping.target).Range
    if ($range.Tables.Count -gt 0) { return $range.Tables.Item(1) }
  }
  return $null
}

function Add-GeneratedTable {
  param($Document, $Mapping, $Records)
  if (-not $Document.Bookmarks.Exists([string]$Mapping.target)) {
    if ($Mapping.required) { throw "Required Word block bookmark was not found: $($Mapping.target)" }
    return
  }
  $columns = @(Get-ConfigValue $Mapping.config 'columns' $null)
  if ($columns.Count -eq 0 -or $null -eq $columns[0]) { $columns = @(Get-DefaultColumns ([string]$Mapping.blockType)) }
  $range = $Document.Bookmarks.Item([string]$Mapping.target).Range
  $range.Text = ''
  $table = $Document.Tables.Add($range, [Math]::Max($Records.Count + 1, 2), $columns.Count)
  try { $table.Style = 'Table Grid' } catch {}
  try { $table.AutoFitBehavior(1) } catch {}
  for ($columnIndex = 0; $columnIndex -lt $columns.Count; $columnIndex++) {
    Set-WordCellText $table 1 ($columnIndex + 1) $columns[$columnIndex].label
  }
  for ($recordIndex = 0; $recordIndex -lt $Records.Count; $recordIndex++) {
    for ($columnIndex = 0; $columnIndex -lt $columns.Count; $columnIndex++) {
      $value = Get-ObjectPathValue $Records[$recordIndex] ([string]$columns[$columnIndex].key)
      Set-WordCellText $table ($recordIndex + 2) ($columnIndex + 1) $value
    }
  }
}

function Write-TableBlock {
  param($Document, $Mapping)
  $records = @(Get-BlockRecords $Mapping.value)
  $table = Resolve-TargetTable $Document $Mapping
  if ($null -eq $table) {
    if ([string]$Mapping.targetType -eq 'BOOKMARK_RANGE') {
      Add-GeneratedTable $Document $Mapping $records
      return
    }
    if ($Mapping.required) { throw "Required Word block table was not found: $($Mapping.target)" }
    return
  }

  $cellMappings = @(Get-ConfigValue $Mapping.config 'cellMappings' $null)
  $hasExplicitMappings = $false
  if ($cellMappings.Count -gt 0 -and $null -ne $cellMappings[0]) {
    $hasExplicitMappings = $true
    foreach ($cellMapping in $cellMappings) {
      $record = $records | Where-Object { (Get-RecordKey $_) -eq [string]$cellMapping.itemKey } | Select-Object -First 1
      if ($null -eq $record) {
        if ($Mapping.required -and [bool]$cellMapping.required) {
          throw "Required block record was not found: $($cellMapping.itemKey)"
        }
        continue
      }
      $source = if ($cellMapping.source) { [string]$cellMapping.source } else { 'value' }
      $value = Get-ObjectPathValue $record $source
      Set-WordCellText $table ([int]$cellMapping.row) ([int]$cellMapping.column) (Convert-MappedValue $value $cellMapping)
    }
  }

  $aggregateMappings = @(Get-ConfigValue $Mapping.config 'aggregateMappings' $null)
  if ($aggregateMappings.Count -gt 0 -and $null -ne $aggregateMappings[0]) {
    $hasExplicitMappings = $true
    foreach ($aggregateMapping in $aggregateMappings) {
      $itemKeys = @(Get-ConfigValue $aggregateMapping 'itemKeys' @()) | ForEach-Object { [string]$_ }
      $aggregateRecords = @($records | Where-Object { $itemKeys -contains (Get-RecordKey $_) })
      if ($Mapping.required -and [bool](Get-ConfigValue $aggregateMapping 'required' $false) -and $aggregateRecords.Count -ne $itemKeys.Count) {
        throw "Required aggregate block records were not found for row $($aggregateMapping.row)"
      }
      $abnormalValues = @(Get-ConfigValue $aggregateMapping 'abnormalValues' @('異常', 'ABNORMAL')) | ForEach-Object { [string]$_ }
      $normalValues = @(Get-ConfigValue $aggregateMapping 'normalValues' @('正常', 'NORMAL', 'N/A')) | ForEach-Object { [string]$_ }
      $statuses = @($aggregateRecords | ForEach-Object { [string](Get-ObjectPathValue $_ 'status') })
      $isAbnormal = @($statuses | Where-Object { $abnormalValues -contains $_ }).Count -gt 0
      $isNormal = $statuses.Count -gt 0 -and -not $isAbnormal -and @($statuses | Where-Object { $normalValues -notcontains $_ }).Count -eq 0
      $mark = [string](Get-ConfigValue $aggregateMapping 'mark' 'V')
      Set-WordCellText $table ([int]$aggregateMapping.row) ([int]$aggregateMapping.normalColumn) $(if ($isNormal) { $mark } else { '' })
      Set-WordCellText $table ([int]$aggregateMapping.row) ([int]$aggregateMapping.abnormalColumn) $(if ($isAbnormal) { $mark } else { '' })
    }
  }

  $compositeMappings = @(Get-ConfigValue $Mapping.config 'compositeMappings' $null)
  if ($compositeMappings.Count -gt 0 -and $null -ne $compositeMappings[0]) {
    $hasExplicitMappings = $true
    foreach ($compositeMapping in $compositeMappings) {
      if ($null -eq $compositeMapping) { continue }
      $text = [string](Get-ConfigValue $compositeMapping 'template' '')
      foreach ($field in @(Get-ConfigValue $compositeMapping 'fields' @())) {
        $record = $records | Where-Object { (Get-RecordKey $_) -eq [string]$field.itemKey } | Select-Object -First 1
        if ($null -eq $record) {
          if ($Mapping.required -and [bool](Get-ConfigValue $field 'required' $false)) {
            throw "Required composite block record was not found: $($field.itemKey)"
          }
          $replacement = ''
        }
        else {
          $source = [string](Get-ConfigValue $field 'source' 'value')
          $replacement = Convert-CellValue (Get-ObjectPathValue $record $source)
        }
        $text = $text.Replace("{$([string]$field.token)}", $replacement)
      }
      Set-WordCellText $table ([int]$compositeMapping.row) ([int]$compositeMapping.column) $text
    }
  }

  if ($hasExplicitMappings) {
    return
  }

  $columns = @(Get-ConfigValue $Mapping.config 'columns' $null)
  if ($columns.Count -eq 0 -or $null -eq $columns[0]) { $columns = @(Get-DefaultColumns ([string]$Mapping.blockType)) }
  $startRow = [int](Get-ConfigValue $Mapping.config 'startRow' 2)
  while ($table.Rows.Count -lt ($startRow + $records.Count - 1)) { $table.Rows.Add() | Out-Null }
  for ($recordIndex = 0; $recordIndex -lt $records.Count; $recordIndex++) {
    for ($columnIndex = 0; $columnIndex -lt $columns.Count; $columnIndex++) {
      $targetColumn = if ($columns[$columnIndex].column) { [int]$columns[$columnIndex].column } else { $columnIndex + 1 }
      Set-WordCellText $table ($startRow + $recordIndex) $targetColumn (Get-ObjectPathValue $records[$recordIndex] ([string]$columns[$columnIndex].key))
    }
  }
}

function Write-SeatBlock {
  param($Document, $Mapping)
  $records = @(Get-BlockRecords $Mapping.value)
  $marked = @($records | Where-Object {
    $_.status -eq '異常' -or [bool](Get-ObjectPathValue $_ 'value.markedX')
  })
  if ([string]$Mapping.targetType -eq 'BOOKMARK_RANGE') {
    if (-not $Document.Bookmarks.Exists([string]$Mapping.target)) {
      if ($Mapping.required) { throw "Required seat-map bookmark was not found: $($Mapping.target)" }
      return
    }
    $range = $Document.Bookmarks.Item([string]$Mapping.target).Range
    $range.Text = (($marked | ForEach-Object { Get-RecordKey $_ }) -join ', ')
    $Document.Bookmarks.Add([string]$Mapping.target, $range) | Out-Null
    return
  }
  $coordinates = Get-ConfigValue $Mapping.config 'coordinates' $null
  $anchor = $null
  if ($Document.Bookmarks.Exists([string]$Mapping.target)) {
    $anchor = $Document.Bookmarks.Item([string]$Mapping.target).Range
  }
  else {
    $inlineShapeIndex = [int](Get-ConfigValue $Mapping.config 'inlineShapeIndex' 0)
    if ($inlineShapeIndex -le 0) { [void][int]::TryParse([string]$Mapping.target, [ref]$inlineShapeIndex) }
    if ($inlineShapeIndex -ge 1 -and $inlineShapeIndex -le $Document.InlineShapes.Count) {
      $anchor = $Document.InlineShapes.Item($inlineShapeIndex).Range
    }
  }
  if ($null -eq $anchor) {
    if ($Mapping.required) { throw "Required seat-map anchor was not found: $($Mapping.target)" }
    return
  }
  foreach ($record in $marked) {
    $itemKey = Get-RecordKey $record
    $coordinateProperty = if ($null -ne $coordinates) { $coordinates.PSObject.Properties[$itemKey] } else { $null }
    if ($null -eq $coordinateProperty) {
      if ($Mapping.required) { throw "Seat-map coordinate is missing: $itemKey" }
      continue
    }
    $coordinate = $coordinateProperty.Value
    $shape = $Document.Shapes.AddTextbox(
      1,
      [single]$coordinate.left,
      [single]$coordinate.top,
      [single](Get-ConfigValue $coordinate 'width' 14),
      [single](Get-ConfigValue $coordinate 'height' 14),
      $anchor
    )
    $shape.RelativeHorizontalPosition = 1
    $shape.RelativeVerticalPosition = 1
    $shape.WrapFormat.Type = 3
    $shape.Fill.Visible = 0
    $shape.Line.Visible = 0
    $shape.TextFrame.TextRange.Text = 'X'
    $shape.TextFrame.TextRange.Font.Bold = -1
    $shape.TextFrame.TextRange.Font.Size = [single](Get-ConfigValue $coordinate 'fontSize' 12)
    $shape.TextFrame.TextRange.Font.Color = 255
    $shape.AlternativeText = "PM-SEAT-X:$itemKey"
  }

  $summaryTable = Get-ConfigValue $Mapping.config 'summaryTable' $null
  if ($null -ne $summaryTable) {
    $tableIndex = [int](Get-ConfigValue $summaryTable 'tableIndex' 0)
    if ($tableIndex -lt 1 -or $tableIndex -gt $Document.Tables.Count) {
      if ($Mapping.required) { throw "Required seat summary table was not found: $tableIndex" }
    }
    else {
      $table = $Document.Tables.Item($tableIndex)
      $mark = [string](Get-ConfigValue $summaryTable 'mark' 'V')
      $hasAbnormal = $marked.Count -gt 0
      Set-WordCellText $table ([int]$summaryTable.row) ([int]$summaryTable.normalColumn) $(if ($hasAbnormal) { '' } else { $mark })
      Set-WordCellText $table ([int]$summaryTable.row) ([int]$summaryTable.abnormalColumn) $(if ($hasAbnormal) { $mark } else { '' })
    }
  }
}

function Write-OtherBlock {
  param($Document, $Mapping)
  if ([string]$Mapping.targetType -eq 'TABLE') {
    $table = Resolve-TargetTable $Document $Mapping
    if ($null -eq $table) {
      if ($Mapping.required) { throw "Required scalar Word block table was not found: $($Mapping.target)" }
      return
    }
    $row = [int](Get-ConfigValue $Mapping.config 'row' 0)
    $column = [int](Get-ConfigValue $Mapping.config 'column' 0)
    if ($row -lt 1 -or $column -lt 1) { throw "Scalar table block requires row and column: $($Mapping.blockCode)" }
    $prefix = [string](Get-ConfigValue $Mapping.config 'prefix' '')
    $suffix = [string](Get-ConfigValue $Mapping.config 'suffix' '')
    Set-WordCellText $table $row $column "$prefix$(Convert-CellValue $Mapping.value)$suffix"
    return
  }
  if (-not $Document.Bookmarks.Exists([string]$Mapping.target)) {
    if ($Mapping.required) { throw "Required Word block bookmark was not found: $($Mapping.target)" }
    return
  }
  $range = $Document.Bookmarks.Item([string]$Mapping.target).Range
  $range.Text = Convert-CellValue $Mapping.value
  $Document.Bookmarks.Add([string]$Mapping.target, $range) | Out-Null
}

function Write-BlockMapping {
  param($Document, $Mapping)
  switch ([string]$Mapping.blockType) {
    'SEAT_MAP' { Write-SeatBlock $Document $Mapping; return }
    'CHECK_TABLE' { Write-TableBlock $Document $Mapping; return }
    'MATERIAL_TABLE' { Write-TableBlock $Document $Mapping; return }
    'MEASUREMENT_TABLE' { Write-TableBlock $Document $Mapping; return }
    default { Write-OtherBlock $Document $Mapping; return }
  }
}

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
    if ([string]$mapping.kind -eq 'BLOCK') {
      Write-BlockMapping $document $mapping
      continue
    }
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
