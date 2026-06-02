param(
  [string]$TemplatePath = ".\vehicle-position-slots-tamhai-ts101.csv",
  [string]$TrainPath = ".\train-master-reference.csv",
  [string]$OutputPath = ".\vehicle-position-slots-tamhai.csv"
)

$template = Import-Csv -LiteralPath $TemplatePath
$trains = Import-Csv -LiteralPath $TrainPath |
  Where-Object { $_.site_code -eq "D" -and $_.is_active -eq "true" } |
  Sort-Object { [int]$_.display_order }

$moduleNos = $template |
  Where-Object { $_.ModuleNo -match '^M[1-5]$' } |
  Select-Object -ExpandProperty ModuleNo -Unique

$rows = New-Object System.Collections.Generic.List[object]

foreach ($train in $trains) {
  $trainNo = ($train.train_no -replace '\D', '')
  $trainToken = "TS$trainNo"

  foreach ($moduleNo in $moduleNos) {
    $rows.Add([pscustomobject]@{
      SourceSheet = "generated"
      SourceRowNo = ""
      SiteCode = "D"
      TargetCode = "TS"
      TrainNo = $trainNo
      ModuleNo = $moduleNo
      SlotName = "$($train.train_no) $moduleNo"
      LocationId = "50-D-$trainToken-$moduleNo"
      ParentLocationId = ""
      SlotKind = "MODULE"
      IsInstallable = "False"
      NeedsReview = "False"
      OriginalAttribute = "MODULE"
    })
  }

  foreach ($slot in $template) {
    if ($slot.IsInstallable -ne "True" -or [string]::IsNullOrWhiteSpace($slot.LocationId)) {
      continue
    }

    $rows.Add([pscustomobject]@{
      SourceSheet = $slot.SourceSheet
      SourceRowNo = $slot.SourceRowNo
      SiteCode = "D"
      TargetCode = "TS"
      TrainNo = $trainNo
      ModuleNo = $slot.ModuleNo
      SlotName = $slot.SlotName
      LocationId = $slot.LocationId.Replace("TS101", $trainToken)
      ParentLocationId = $slot.ParentLocationId.Replace("TS101", $trainToken)
      SlotKind = $slot.SlotKind
      IsInstallable = $slot.IsInstallable
      NeedsReview = $slot.NeedsReview
      OriginalAttribute = $slot.OriginalAttribute
    })
  }
}

$rows | Export-Csv -LiteralPath $OutputPath -NoTypeInformation -Encoding UTF8

Write-Output "exported: $OutputPath"
Write-Output "trains: $($trains.Count)"
Write-Output "rows: $($rows.Count)"
$rows | Group-Object SlotKind | Sort-Object Name | ForEach-Object {
  Write-Output "$($_.Name): $($_.Count)"
}
$needsReview = @($rows | Where-Object { $_.NeedsReview -eq "True" })
Write-Output "needs_review: $($needsReview.Count)"
