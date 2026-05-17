param(
  [string]$SourceDir = "G:\我的雲端硬碟\code\物料",
  [string]$OutDir = "G:\我的雲端硬碟\code\db-design"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Read-Xlsx {
  param([string]$Path)

  $zip = [System.IO.Compression.ZipFile]::OpenRead($Path)
  try {
    $shared = @()
    $ssEntry = $zip.GetEntry("xl/sharedStrings.xml")
    if ($ssEntry) {
      $sr = New-Object System.IO.StreamReader($ssEntry.Open())
      [xml]$ss = $sr.ReadToEnd()
      $sr.Close()
      $ns = New-Object System.Xml.XmlNamespaceManager($ss.NameTable)
      $ns.AddNamespace("x", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
      foreach ($si in $ss.SelectNodes("//x:si", $ns)) {
        $texts = @()
        foreach ($t in $si.SelectNodes(".//x:t", $ns)) { $texts += $t.InnerText }
        $shared += ($texts -join "")
      }
    }

    $wbEntry = $zip.GetEntry("xl/workbook.xml")
    $wbReader = New-Object System.IO.StreamReader($wbEntry.Open())
    [xml]$wb = $wbReader.ReadToEnd()
    $wbReader.Close()

    $relsEntry = $zip.GetEntry("xl/_rels/workbook.xml.rels")
    $relsReader = New-Object System.IO.StreamReader($relsEntry.Open())
    [xml]$rels = $relsReader.ReadToEnd()
    $relsReader.Close()

    $relMap = @{}
    foreach ($rel in $rels.Relationships.Relationship) { $relMap[$rel.Id] = $rel.Target }

    $nsWb = New-Object System.Xml.XmlNamespaceManager($wb.NameTable)
    $nsWb.AddNamespace("x", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
    $nsWb.AddNamespace("r", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")

    $sheets = @{}
    foreach ($sheet in $wb.SelectNodes("//x:sheet", $nsWb)) {
      $rid = $sheet.GetAttribute("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
      $target = $relMap[$rid]
      $entryName = if ($target.StartsWith("/")) { $target.TrimStart("/") } else { "xl/" + $target }
      $entryName = $entryName -replace "\\", "/"
      $entry = $zip.GetEntry($entryName)
      if (-not $entry) { continue }

      $reader = New-Object System.IO.StreamReader($entry.Open())
      [xml]$xml = $reader.ReadToEnd()
      $reader.Close()

      $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
      $ns.AddNamespace("x", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")

      $rows = @()
      foreach ($row in $xml.SelectNodes("//x:sheetData/x:row", $ns)) {
        $cells = @{}
        foreach ($c in $row.SelectNodes("./x:c", $ns)) {
          $ref = $c.r
          $letters = ([regex]::Match($ref, "^[A-Z]+")).Value
          $idx = 0
          foreach ($ch in $letters.ToCharArray()) {
            $idx = $idx * 26 + ([int][char]$ch - [int][char]"A" + 1)
          }
          $idx = $idx - 1

          $value = ""
          $vNode = $c.SelectSingleNode("./x:v", $ns)
          if ($c.t -eq "s") {
            $raw = if ($vNode) { $vNode.InnerText } else { "" }
            if ($raw -ne "") { $value = $shared[[int]$raw] }
          } elseif ($c.t -eq "inlineStr") {
            $texts = @()
            foreach ($t in $c.SelectNodes(".//x:t", $ns)) { $texts += $t.InnerText }
            $value = $texts -join ""
          } else {
            if ($vNode) { $value = $vNode.InnerText }
          }
          $cells[$idx] = $value
        }

        if ($cells.Count -gt 0) {
          $max = ($cells.Keys | Measure-Object -Maximum).Maximum
          $arr = for ($i = 0; $i -le $max; $i++) {
            if ($cells.ContainsKey($i)) { [string]$cells[$i] } else { "" }
          }
          if ((($arr -join "").Trim()).Length -gt 0) { $rows += ,$arr }
        }
      }
      $sheets[$sheet.name] = $rows
    }
    return $sheets
  } finally {
    $zip.Dispose()
  }
}

function Normalize-Code {
  param([string]$Value)
  return (($Value -replace "\s+", "").Trim()).ToUpperInvariant()
}

function Sql-Text {
  param($Value)
  if ($null -eq $Value -or [string]$Value -eq "") { return "NULL" }
  $text = [string]$Value
  $text = $text -replace "`r|`n", " "
  $text = $text -replace "'", "''"
  return "'" + $text + "'"
}

function Sql-Bool {
  param([bool]$Value)
  if ($Value) { return "true" }
  return "false"
}

function Sql-Number {
  param($Value)
  $text = ([string]$Value).Trim()
  if ($text -eq "") { return "0" }
  $num = 0.0
  if ([double]::TryParse($text, [ref]$num)) { return ([string]::Format([Globalization.CultureInfo]::InvariantCulture, "{0}", $num)) }
  return "0"
}

function Warehouse-Code {
  param([string]$Name)
  switch ($Name) {
    "淡海機廠主庫房" { return "TH-CENTER" }
    "淡海輕軌中心倉庫" { return "TH-CENTER" }
    "安坑機廠主庫房 B2" { return "AK-CENTER" }
    "安坑輕軌中心倉庫" { return "AK-CENTER" }
    "淡海分存站(機械工廠)" { return "TH-SUB" }
    "淡海輕軌分存站" { return "TH-SUB" }
    "淡海14號分存站" { return "TH-SUB-14" }
    "淡海19號分存站" { return "TH-SUB-19" }
    "安坑暫存區 C215" { return "AK-TEMP-C215" }
    "安坑橋下倉庫 01" { return "AK-BRIDGE-01" }
    "安坑橋下倉庫 02" { return "AK-BRIDGE-02" }
    "安坑輕軌分存站" { return "AK-BRIDGE-01" }
    "淡海輕軌電子零件倉" { return "TH-ELECTRONIC" }
    default {
      $hash = [Math]::Abs($Name.GetHashCode())
      return "TH-WH-" + ($hash % 100000).ToString("00000")
    }
  }
}

function Warehouse-LocationType {
  param([string]$Name)
  if ($Name -match "中心倉庫|主庫房") { return "CENTER_WAREHOUSE" }
  if ($Name -match "分存站|橋下倉庫") { return "SUB_STATION" }
  if ($Name -match "暫存") { return "FIELD" }
  if ($Name -match "報廢") { return "SCRAP" }
  if ($Name -match "外修|廠商") { return "VENDOR" }
  if ($Name -match "車上|裝車") { return "VEHICLE" }
  if ($Name -match "個人|保管") { return "PERSON" }
  if ($Name -match "現場|機廠|倉|庫") { return "FIELD" }
  return "OTHER"
}

function Default-StockStatus {
  param([string]$LocationType)
  switch ($LocationType) {
    "CENTER_WAREHOUSE" { return "AVAILABLE" }
    "SCRAP" { return "SCRAPPED" }
    "VENDOR" { return "REPAIR" }
    "VEHICLE" { return "IN_USE" }
    default { return "ISSUED" }
  }
}

function Is-IssueDestination {
  param([string]$StockStatus)
  return ($StockStatus -ne "AVAILABLE")
}

function Guess-Serialized {
  param([string]$SystemCode, [string]$Name, [string]$Spec)
  if ($SystemCode -eq "96") { return $true }
  $text = "$Name $Spec"
  return $text -match "控制器|模組|馬達|電機|壓縮機|感測器|泵|閥|主機|電源供應|面板|換流器|集電弓"
}

function Guess-Repairable {
  param([string]$SystemCode, [string]$Name, [string]$Spec)
  if ($SystemCode -eq "95" -or $SystemCode -eq "96") { return $false }
  $text = "$Name $Spec"
  return $text -match "控制器|模組|馬達|電機|壓縮機|泵|主機|換流器"
}

function Material-Type {
  param([string]$SystemCode)
  if ($SystemCode -eq "95") { return "工具" }
  if ($SystemCode -eq "96") { return "儀器" }
  return "車輛設備物料"
}

function Material-Property {
  param([string]$SystemCode)
  if ($SystemCode -eq "50") { return "專屬物料" }
  return "一般物料"
}

function Build-CodeMaps {
  param([hashtable]$Sheets)

  $systemMap = @{}
  $categoryMap = @{}
  foreach ($sheetName in $Sheets.Keys) {
    $match = [regex]::Match($sheetName, "\((\d+)\)")
    if (-not $match.Success) { continue }
    $systemCode = $match.Groups[1].Value
    $systemName = ($sheetName -replace "\s*\(\d+\)", "").Trim()
    $systemMap[$systemCode] = $systemName

    foreach ($row in $Sheets[$sheetName]) {
      for ($i = 0; $i -lt ($row.Count - 1); $i++) {
        $code = Normalize-Code $row[$i]
        $name = ([string]$row[$i + 1]).Trim()
        if ($code -match "^[A-Z0-9]{2}$" -and $name -ne "" -and $name -notmatch "類別碼|系統名稱|類別碼名稱") {
          $categoryMap["$systemCode.$code"] = $name
        }
      }
    }
  }
  return [pscustomobject]@{ SystemMap = $systemMap; CategoryMap = $categoryMap }
}

function Convert-MaterialRows {
  param(
    [string]$Path,
    [string]$SourceName,
    [hashtable]$SystemMap,
    [hashtable]$CategoryMap
  )

  $sheets = Read-Xlsx -Path $Path
  $rows = $sheets["淡海"]
  if (-not $rows) { return @() }

  $items = @()
  for ($i = 1; $i -lt $rows.Count; $i++) {
    $row = $rows[$i]
    if ($row.Count -lt 8) { continue }
    $partNo = ([string]$row[1]).Trim()
    $name = ([string]$row[2]).Trim()
    if ($partNo -eq "" -or $name -eq "") { continue }

    $parts = $partNo.Split(".")
    $systemCode = if ($parts.Count -gt 0) { Normalize-Code $parts[0] } else { "" }
    $categoryCode = if ($parts.Count -gt 1) { Normalize-Code $parts[1] } else { "" }
    $sequenceNo = if ($parts.Count -gt 2) { Normalize-Code $parts[2] } else { "" }
    $typeCode = if ($parts.Count -gt 3) { Normalize-Code $parts[3] } else { "" }
    $categoryKey = "$systemCode.$categoryCode"
    $spec = ([string]$row[3]).Trim()
    $warehouse = ([string]$row[5]).Trim()
    $warehouseCode = Warehouse-Code $warehouse
    $locationType = Warehouse-LocationType $warehouse
    $stockStatus = Default-StockStatus $locationType
    $stock = Sql-Number $row[7]

    $items += [pscustomobject]@{
      SourceFile = [System.IO.Path]::GetFileName($Path)
      SourceName = $SourceName
      SourceRowNo = $i + 1
      OriginalAttribute = ([string]$row[0]).Trim()
      PartNo = $partNo
      MaterialName = $name
      Spec = $spec
      Unit = ([string]$row[4]).Trim()
      WarehouseName = $warehouse
      WarehouseCode = $warehouseCode
      WarehouseLocationType = $locationType
      StockStatus = $stockStatus
      IsIssueDestination = Is-IssueDestination $stockStatus
      BinCode = ([string]$row[6]).Trim()
      StockQty = [decimal]$stock
      PreservationDate = ([string]$row[8]).Trim()
      SystemCode = $systemCode
      SystemName = if ($SystemMap.ContainsKey($systemCode)) { $SystemMap[$systemCode] } else { "" }
      CategoryCode = $categoryCode
      CategoryName = if ($CategoryMap.ContainsKey($categoryKey)) { $CategoryMap[$categoryKey] } else { "" }
      SequenceNo = $sequenceNo
      TypeCode = $typeCode
      MaterialType = Material-Type $systemCode
      MaterialProperty = Material-Property $systemCode
      Repairable = Guess-Repairable $systemCode $name $spec
      IsSerialized = Guess-Serialized $systemCode $name $spec
    }
  }
  return $items
}

if (-not (Test-Path -LiteralPath $OutDir)) {
  New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
}

$codeWorkbook = Join-Path $SourceDir "淡海輕軌物料編碼原則(1111130).xlsx"
$codeSheets = Read-Xlsx -Path $codeWorkbook
$maps = Build-CodeMaps -Sheets $codeSheets

$allItems = @()
$allItems += Convert-MaterialRows -Path (Join-Path $SourceDir "淡海車輛設備物料.xlsx") -SourceName "淡海車輛設備物料" -SystemMap $maps.SystemMap -CategoryMap $maps.CategoryMap
$allItems += Convert-MaterialRows -Path (Join-Path $SourceDir "淡海95工具.xlsx") -SourceName "淡海95工具" -SystemMap $maps.SystemMap -CategoryMap $maps.CategoryMap
$allItems += Convert-MaterialRows -Path (Join-Path $SourceDir "淡海96儀器.xlsx") -SourceName "淡海96儀器" -SystemMap $maps.SystemMap -CategoryMap $maps.CategoryMap

$csvPath = Join-Path $OutDir "material-catalog-tamhai.csv"
$jsonPath = Join-Path $OutDir "material-catalog-tamhai.json"
$sqlPath = Join-Path $OutDir "material-import-tamhai.sql"
$summaryPath = Join-Path $OutDir "material-import-summary.md"

$allItems | Export-Csv -LiteralPath $csvPath -NoTypeInformation -Encoding UTF8
$allItems | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

$uniqueMaterials = $allItems | Group-Object PartNo | ForEach-Object {
  $first = $_.Group | Select-Object -First 1
  $totalStock = ($_.Group | Measure-Object StockQty -Sum).Sum
  $bins = ($_.Group | ForEach-Object { $_.WarehouseName + "/" + $_.BinCode + ":" + $_.StockQty } | Sort-Object -Unique) -join "; "
  [pscustomobject]@{
    PartNo = $first.PartNo
    MaterialName = $first.MaterialName
    Spec = $first.Spec
    Unit = $first.Unit
    SystemName = $first.SystemName
    SystemCode = $first.SystemCode
    CategoryCode = $first.CategoryCode
    CategoryName = $first.CategoryName
    MaterialType = $first.MaterialType
    MaterialProperty = $first.MaterialProperty
    Repairable = $first.Repairable
    IsSerialized = $first.IsSerialized
    TotalStock = $totalStock
    Bins = $bins
  }
}

$warehouses = $allItems | Group-Object WarehouseCode | ForEach-Object {
  $_.Group | Select-Object -First 1
}

$bins = $allItems | Where-Object { $_.BinCode -ne "" } | Group-Object WarehouseCode, BinCode | ForEach-Object {
  $_.Group | Select-Object -First 1
}

$sql = New-Object System.Collections.Generic.List[string]
$sql.Add("-- 淡海物料資料匯入")
$sql.Add("-- Source: 淡海輕軌物料編碼原則(1111130)、淡海車輛設備物料、淡海95工具、淡海96儀器")
$sql.Add("-- Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
$sql.Add("")
$sql.Add("BEGIN;")
$sql.Add("")
$sql.Add("CREATE TABLE IF NOT EXISTS warehouse_bin (")
$sql.Add("  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),")
$sql.Add("  warehouse_id uuid NOT NULL REFERENCES warehouse(id),")
$sql.Add("  bin_code text NOT NULL,")
$sql.Add("  description text,")
$sql.Add("  is_active boolean NOT NULL DEFAULT true,")
$sql.Add("  created_at timestamptz NOT NULL DEFAULT now(),")
$sql.Add("  updated_at timestamptz NOT NULL DEFAULT now(),")
$sql.Add("  CONSTRAINT warehouse_bin_unique UNIQUE (warehouse_id, bin_code)")
$sql.Add(");")
$sql.Add("")
$sql.Add("CREATE TABLE IF NOT EXISTS inventory_bin_balance (")
$sql.Add("  material_id uuid NOT NULL REFERENCES material(id),")
$sql.Add("  warehouse_id uuid NOT NULL REFERENCES warehouse(id),")
$sql.Add("  warehouse_bin_id uuid NOT NULL REFERENCES warehouse_bin(id),")
$sql.Add("  stock_status text NOT NULL DEFAULT 'AVAILABLE',")
$sql.Add("  qty numeric(14, 3) NOT NULL DEFAULT 0,")
$sql.Add("  updated_at timestamptz NOT NULL DEFAULT now(),")
$sql.Add("  PRIMARY KEY (material_id, warehouse_id, warehouse_bin_id, stock_status)")
$sql.Add(");")
$sql.Add("")
$sql.Add("CREATE TABLE IF NOT EXISTS material_import_source (")
$sql.Add("  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),")
$sql.Add("  import_batch text NOT NULL,")
$sql.Add("  source_file text NOT NULL,")
$sql.Add("  source_row_no integer NOT NULL,")
$sql.Add("  original_attribute text,")
$sql.Add("  part_no text NOT NULL,")
$sql.Add("  material_name text NOT NULL,")
$sql.Add("  spec text,")
$sql.Add("  unit text,")
$sql.Add("  warehouse_code text,")
$sql.Add("  warehouse_name text,")
$sql.Add("  warehouse_location_type text,")
$sql.Add("  bin_code text,")
$sql.Add("  stock_status text,")
$sql.Add("  stock_qty numeric(14, 3),")
$sql.Add("  preservation_date_text text,")
$sql.Add("  system_code text,")
$sql.Add("  system_name text,")
$sql.Add("  category_code text,")
$sql.Add("  category_name text,")
$sql.Add("  sequence_no text,")
$sql.Add("  type_code text,")
$sql.Add("  imported_at timestamptz NOT NULL DEFAULT now(),")
$sql.Add("  CONSTRAINT material_import_source_unique UNIQUE (import_batch, source_file, source_row_no)")
$sql.Add(");")
$sql.Add("")

foreach ($w in $warehouses) {
  $sql.Add("INSERT INTO warehouse (warehouse_code, warehouse_name, location_type, default_stock_status, is_issue_destination) VALUES ($(Sql-Text $w.WarehouseCode), $(Sql-Text $w.WarehouseName), $(Sql-Text $w.WarehouseLocationType), $(Sql-Text $w.StockStatus), $(Sql-Bool $w.IsIssueDestination)) ON CONFLICT (warehouse_code) DO UPDATE SET warehouse_name = EXCLUDED.warehouse_name, location_type = EXCLUDED.location_type, default_stock_status = EXCLUDED.default_stock_status, is_issue_destination = EXCLUDED.is_issue_destination, updated_at = now();")
}
$sql.Add("")

foreach ($b in $bins) {
  $sql.Add("INSERT INTO warehouse_bin (warehouse_id, bin_code) SELECT w.id, $(Sql-Text $b.BinCode) FROM warehouse w WHERE w.warehouse_code = $(Sql-Text $b.WarehouseCode) ON CONFLICT (warehouse_id, bin_code) DO UPDATE SET updated_at = now();")
}
$sql.Add("")

foreach ($m in $uniqueMaterials) {
  $note = "匯入來源: 淡海物料清單; 系統碼=$($m.SystemCode); 類別碼=$($m.CategoryCode); 類別=$($m.CategoryName); 儲位=$($m.Bins)"
  $sql.Add("INSERT INTO material (part_no, material_name, spec, unit, system_code, system_name, category_code, category_name, sequence_no, type_code, material_type, material_property, repairable, is_serialized, safety_level, reorder_point, review_note, is_active) VALUES ($(Sql-Text $m.PartNo), $(Sql-Text $m.MaterialName), $(Sql-Text $m.Spec), $(Sql-Text $m.Unit), $(Sql-Text $m.SystemCode), $(Sql-Text $m.SystemName), $(Sql-Text $m.CategoryCode), $(Sql-Text $m.CategoryName), $(Sql-Text $m.SequenceNo), $(Sql-Text $m.TypeCode), $(Sql-Text $m.MaterialType), $(Sql-Text $m.MaterialProperty), $(Sql-Bool $m.Repairable), $(Sql-Bool $m.IsSerialized), NULL, 0, $(Sql-Text $note), true) ON CONFLICT (part_no) DO UPDATE SET material_name = EXCLUDED.material_name, spec = EXCLUDED.spec, unit = EXCLUDED.unit, system_code = EXCLUDED.system_code, system_name = EXCLUDED.system_name, category_code = EXCLUDED.category_code, category_name = EXCLUDED.category_name, sequence_no = EXCLUDED.sequence_no, type_code = EXCLUDED.type_code, material_type = EXCLUDED.material_type, material_property = EXCLUDED.material_property, repairable = EXCLUDED.repairable, is_serialized = EXCLUDED.is_serialized, review_note = EXCLUDED.review_note, updated_at = now();")
}
$sql.Add("")

$balanceGroups = $allItems | Group-Object PartNo, WarehouseCode, StockStatus | ForEach-Object {
  $first = $_.Group | Select-Object -First 1
  [pscustomobject]@{
    PartNo = $first.PartNo
    WarehouseCode = $first.WarehouseCode
    StockStatus = $first.StockStatus
    StockQty = ($_.Group | Measure-Object StockQty -Sum).Sum
  }
}
foreach ($g in $balanceGroups) {
  $sql.Add("INSERT INTO inventory_balance (material_id, warehouse_id, stock_status, qty) SELECT m.id, w.id, $(Sql-Text $g.StockStatus), $(Sql-Number $g.StockQty) FROM material m JOIN warehouse w ON w.warehouse_code = $(Sql-Text $g.WarehouseCode) WHERE m.part_no = $(Sql-Text $g.PartNo) ON CONFLICT (material_id, warehouse_id, stock_status) DO UPDATE SET qty = EXCLUDED.qty, updated_at = now();")
}
$sql.Add("")

$binBalanceGroups = $allItems | Where-Object { $_.BinCode -ne "" } | Group-Object PartNo, WarehouseCode, BinCode, StockStatus | ForEach-Object {
  $first = $_.Group | Select-Object -First 1
  [pscustomobject]@{
    PartNo = $first.PartNo
    WarehouseCode = $first.WarehouseCode
    BinCode = $first.BinCode
    StockStatus = $first.StockStatus
    StockQty = ($_.Group | Measure-Object StockQty -Sum).Sum
  }
}
foreach ($g in $binBalanceGroups) {
  $sql.Add("INSERT INTO inventory_bin_balance (material_id, warehouse_id, warehouse_bin_id, stock_status, qty) SELECT m.id, w.id, wb.id, $(Sql-Text $g.StockStatus), $(Sql-Number $g.StockQty) FROM material m JOIN warehouse w ON w.warehouse_code = $(Sql-Text $g.WarehouseCode) JOIN warehouse_bin wb ON wb.warehouse_id = w.id AND wb.bin_code = $(Sql-Text $g.BinCode) WHERE m.part_no = $(Sql-Text $g.PartNo) ON CONFLICT (material_id, warehouse_id, warehouse_bin_id, stock_status) DO UPDATE SET qty = EXCLUDED.qty, updated_at = now();")
}
$sql.Add("")

foreach ($item in $allItems) {
  $sql.Add("INSERT INTO material_import_source (import_batch, source_file, source_row_no, original_attribute, part_no, material_name, spec, unit, warehouse_code, warehouse_name, warehouse_location_type, bin_code, stock_status, stock_qty, preservation_date_text, system_code, system_name, category_code, category_name, sequence_no, type_code) VALUES ('tamhai-2026-05', $(Sql-Text $item.SourceFile), $($item.SourceRowNo), $(Sql-Text $item.OriginalAttribute), $(Sql-Text $item.PartNo), $(Sql-Text $item.MaterialName), $(Sql-Text $item.Spec), $(Sql-Text $item.Unit), $(Sql-Text $item.WarehouseCode), $(Sql-Text $item.WarehouseName), $(Sql-Text $item.WarehouseLocationType), $(Sql-Text $item.BinCode), $(Sql-Text $item.StockStatus), $(Sql-Number $item.StockQty), $(Sql-Text $item.PreservationDate), $(Sql-Text $item.SystemCode), $(Sql-Text $item.SystemName), $(Sql-Text $item.CategoryCode), $(Sql-Text $item.CategoryName), $(Sql-Text $item.SequenceNo), $(Sql-Text $item.TypeCode)) ON CONFLICT (import_batch, source_file, source_row_no) DO UPDATE SET part_no = EXCLUDED.part_no, material_name = EXCLUDED.material_name, spec = EXCLUDED.spec, unit = EXCLUDED.unit, warehouse_code = EXCLUDED.warehouse_code, warehouse_name = EXCLUDED.warehouse_name, warehouse_location_type = EXCLUDED.warehouse_location_type, bin_code = EXCLUDED.bin_code, stock_status = EXCLUDED.stock_status, stock_qty = EXCLUDED.stock_qty, preservation_date_text = EXCLUDED.preservation_date_text, system_code = EXCLUDED.system_code, system_name = EXCLUDED.system_name, category_code = EXCLUDED.category_code, category_name = EXCLUDED.category_name, sequence_no = EXCLUDED.sequence_no, type_code = EXCLUDED.type_code, imported_at = now();")
}
$sql.Add("")
$sql.Add("COMMIT;")
$sql | Set-Content -LiteralPath $sqlPath -Encoding UTF8

$bySource = $allItems | Group-Object SourceName | Sort-Object Name
$bySystem = $allItems | Group-Object SystemCode | Sort-Object Name
$serializedCount = ($uniqueMaterials | Where-Object { $_.IsSerialized }).Count
$repairableCount = ($uniqueMaterials | Where-Object { $_.Repairable }).Count
$zeroStockCount = ($allItems | Where-Object { $_.StockQty -eq 0 }).Count
$availableItems = $allItems | Where-Object { $_.StockStatus -eq "AVAILABLE" }
$issuedItems = $allItems | Where-Object { $_.StockStatus -ne "AVAILABLE" }
$availableQty = ($availableItems | Measure-Object StockQty -Sum).Sum
$issuedQty = ($issuedItems | Measure-Object StockQty -Sum).Sum
if ($null -eq $availableQty) { $availableQty = 0 }
if ($null -eq $issuedQty) { $issuedQty = 0 }
$byStatus = $allItems | Group-Object StockStatus | Sort-Object Name

$summary = New-Object System.Collections.Generic.List[string]
$summary.Add("# 淡海物料匯入摘要")
$summary.Add("")
$summary.Add("來源資料夾：" + $SourceDir)
$summary.Add("")
$summary.Add("## 匯入成果")
$summary.Add("")
$summary.Add("- 原始列數：$($allItems.Count)")
$summary.Add("- 唯一料號：$($uniqueMaterials.Count)")
$summary.Add("- 倉庫數：$(($warehouses | Measure-Object).Count)")
$summary.Add("- 儲位數：$(($bins | Measure-Object).Count)")
$summary.Add("- 推定需序號管理料號：$serializedCount")
$summary.Add("- 推定可修件料號：$repairableCount")
$summary.Add("- 原始庫存量為 0 的列數：$zeroStockCount")
$summary.Add("- 中心倉庫可發料數量：$availableQty")
$summary.Add("- 已領出或非中心位置數量：$issuedQty")
$summary.Add("")
$summary.Add("## 來源分布")
$summary.Add("")
foreach ($g in $bySource) { $summary.Add("- $($g.Name)：$($g.Count) 筆") }
$summary.Add("")
$summary.Add("## 系統碼分布")
$summary.Add("")
foreach ($g in $bySystem) {
  $name = if ($maps.SystemMap.ContainsKey($g.Name)) { $maps.SystemMap[$g.Name] } else { "" }
  $summary.Add("- $($g.Name) $name：$($g.Count) 筆")
}
$summary.Add("")
$summary.Add("## 庫存狀態分布")
$summary.Add("")
foreach ($g in $byStatus) { $summary.Add("- $($g.Name)：$($g.Count) 筆") }
$summary.Add("")
$summary.Add("## 輸出檔案")
$summary.Add("")
$summary.Add("- material-catalog-tamhai.csv：完整物料清單")
$summary.Add("- material-catalog-tamhai.json：前端或 API 可讀的 JSON")
$summary.Add("- material-import-tamhai.sql：可匯入 PostgreSQL schema 的 SQL")
$summary.Add("")
$summary.Add("## 注意")
$summary.Add("")
$summary.Add("- 中心倉庫以 stock_status=AVAILABLE 表示未領料可發料庫存。")
$summary.Add("- 分存站、現場、其他非中心位置以 stock_status=ISSUED/IN_USE/REPAIR/SCRAPPED 表示已領出或不可發料去向。")
$summary.Add("- 儲位已寫入 warehouse_bin 與 inventory_bin_balance，並保留原始列在 material_import_source。")
$summary.Add("- is_serialized 與 repairable 目前是依料號系統碼與品名關鍵字推定，正式上線前需要人工複核。")
$summary | Set-Content -LiteralPath $summaryPath -Encoding UTF8

[pscustomobject]@{
  SourceRows = $allItems.Count
  UniqueMaterials = $uniqueMaterials.Count
  Warehouses = ($warehouses | Measure-Object).Count
  Bins = ($bins | Measure-Object).Count
  AvailableQty = $availableQty
  IssuedOrNonCenterQty = $issuedQty
  SerializedGuess = $serializedCount
  RepairableGuess = $repairableCount
  Csv = $csvPath
  Json = $jsonPath
  Sql = $sqlPath
  Summary = $summaryPath
} | ConvertTo-Json -Depth 4
