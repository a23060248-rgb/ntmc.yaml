# 匯入與上線指南

## 全新建庫

全新資料庫建議順序：

```sql
\i schema.postgres.sql
\i seed-reference-data.sql
\i seed-repair-workflow-options.sql
\i material-import-tamhai.sql
\i migration-material-master-usage.sql
\i migration-document-sequence-inventory-document.sql
```

說明：

| 檔案 | 用途 |
| --- | --- |
| `schema.postgres.sql` | 建立主要資料表、view、trigger。 |
| `seed-reference-data.sql` | 建立基礎參考資料。 |
| `seed-repair-workflow-options.sql` | 建立 R 維修流程選項。 |
| `material-import-tamhai.sql` | 匯入淡海物料、倉庫、儲位與初始庫存。 |
| `migration-material-master-usage.sql` | 補物料料號拆解與用量歷史表，並回填資料。 |
| `migration-document-sequence-inventory-document.sql` | 補單號流水與庫存異動單。 |

## 既有 Zeabur 資料庫升級

若資料庫已經跑過舊版 schema，建議順序：

```sql
\i migration-inventory-location-status.sql
\i migration-work-order-numbering.sql
\i migration-train-fleet.sql
\i migration-vehicle-position-slots.sql
\i migration-asset-installation-import-staging.sql
\i migration-repair-workflow-options.sql
\i migration-document-sequence-inventory-document.sql
\i seed-repair-workflow-options.sql
\i material-import-tamhai.sql
\i migration-material-master-usage.sql
```

坑位資料匯入：

```sql
\i vehicle-position-import-tamhai.sql
```

設備序號與坑位裝用現場盤點回收後，再使用：

```sql
\i asset-installation-import-stage.sql
```

## 物料匯入

來源：

| 檔案 | 內容 |
| --- | --- |
| `淡海車輛設備物料.xlsx` | 車輛設備物料。 |
| `淡海95工具.xlsx` | 工具類。 |
| `淡海96儀器.xlsx` | 儀器類。 |
| `淡海輕軌物料編碼原則(1111130).xlsx` | 料號定義。 |

輸出：

| 檔案 | 用途 |
| --- | --- |
| `material-catalog-tamhai.csv` | 人工檢查用。 |
| `material-catalog-tamhai.json` | API 或前端測試用。 |
| `material-import-tamhai.sql` | PostgreSQL 匯入用。 |

物料匯入會保留原始列到 `material_import_source`，方便追溯 Excel 來源。

## 坑位匯入

來源：

```text
周轉建0304.xlsx
```

流程：

```text
TS101 坑位模板
  ↓
展開淡海 18 台車
  ↓
vehicle-position-slots-tamhai.csv
  ↓
vehicle-position-import-tamhai.sql
  ↓
vehicle_position
```

目前淡海車隊：

```text
101-115、117(215)、118(214)、119(213)
```

安坑車隊：

```text
201-212
```

## 設備序號與坑位裝用匯入

現場填寫檔：

```text
asset-installation-field-checklist-tamhai.csv
```

重要欄位：

| 欄位 | 說明 |
| --- | --- |
| `坑位代碼` | 對應 `vehicle_position.position_code`。 |
| `設備序號` | 對應或建立 `asset.serial_no`。 |
| `現場設備名稱` | 現場抄寫名稱。 |
| `裝用狀態` | 裝用中、空坑、查無銘牌、與清單不符、待確認、不適用。 |
| `照片檔名或連結` | 先放檔名或 URL。 |

匯入先進暫存表，不直接覆蓋正式裝用關係：

```text
asset_installation_import_batch
asset_installation_import_row
```

## 可重跑原則

| 類型 | 是否可重跑 | 注意 |
| --- | --- | --- |
| `seed-reference-data.sql` | 可重跑 | 使用 `ON CONFLICT`，但仍需注意人工改過的資料。 |
| `seed-repair-workflow-options.sql` | 可重跑 | 會更新選項文字與排序。 |
| `material-import-tamhai.sql` | 可重跑 | 相同料號會更新，不會重複新增主檔。 |
| `migration-*.sql` | 視內容 | 大多使用 `IF NOT EXISTS`，但仍建議先備份。 |
| `asset-installation-import-stage.sql` | 可重跑不同批次 | 不要用同一批次號覆蓋未確認資料。 |

## 上線前檢查

```sql
SELECT count(*) FROM material;
SELECT count(*) FROM warehouse;
SELECT count(*) FROM warehouse_bin;
SELECT count(*) FROM inventory_balance;
SELECT count(*) FROM vehicle_position;
SELECT count(*) FROM workflow_option;
```

R 流程選項檢查：

```sql
SELECT option_group, count(*)
FROM workflow_option
GROUP BY option_group
ORDER BY option_group;
```

庫存摘要檢查：

```sql
SELECT *
FROM v_material_stock_summary
ORDER BY stock_advice DESC, part_no
LIMIT 20;
```
