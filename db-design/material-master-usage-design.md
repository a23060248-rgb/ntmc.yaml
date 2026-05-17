# 物料主檔與用量歷史設計

## 結論

物料資料分成三種責任：

| 層級 | 資料表 | 放什麼 |
| --- | --- | --- |
| 物料主檔 | `material` | 料號、名稱、規格、單位、系統碼、類別碼、是否可修、是否序號管理、統一請購點。 |
| 庫存現況 | `inventory_balance`、`inventory_bin_balance` | 目前在哪個倉庫、儲位、狀態、有多少。 |
| 用量歷史 | `material_usage_history` | 111、112、113 年發料量、114 年每月發料量、近一年故障用量等歷史統計。 |

安全庫存先不分淡海、安坑。因為你現場調用很快，請購判斷先用 `material.reorder_point` 作為統一請購點即可。

## material 主檔補強

料號格式固定為：

```text
系統碼.類別碼.流水號.型式碼
```

例如：

```text
50.88.0004.LO
```

拆到 `material` 後會變成：

| 欄位 | 值 | 說明 |
| --- | --- | --- |
| `part_no` | `50.88.0004.LO` | 完整料號 |
| `system_code` | `50` | 系統碼 |
| `category_code` | `88` | 類別碼 |
| `sequence_no` | `0004` | 流水號 |
| `type_code` | `LO` | 型式碼 |
| `category_name` | `電聯車特殊設備空調類` | 類別名稱 |

這樣後續要查「50 車輛設備」、「95 工具」、「96 儀器」，或查某一類別的所有物料，就不用再用文字切料號。

## material_usage_history

用量是會隨時間增加的資料，所以不放在 `material`。每一筆代表某一個料號在某一段時間、某一種用量類型的統計值。

| 欄位 | 說明 |
| --- | --- |
| `material_id` | 對應 `material.id` |
| `period_type` | `YEAR` 全年、`MONTH` 月份、`ROLLING_12M` 近一年 |
| `roc_year` | 民國年，例如 111、112、113、114 |
| `usage_month` | 月份，只有 `period_type = MONTH` 時填 1-12 |
| `usage_type` | `ISSUE` 發料、`FAULT` 故障用量、`PM_STANDARD` 預檢標準、`OVERHAUL_STANDARD` 大修標準、`FORECAST_FAULT` 預估故障量、`BOQ` BOQ 基準量、`OTHER` 其他 |
| `qty` | 數量 |
| `amount` | 金額，可空白 |
| `source_type` | `IMPORT` 匯入、`SYSTEM` 系統統計、`MANUAL` 人工、`CALCULATED` 推算 |

## 舊 Excel 欄位對應

| 原本欄位 | 新資料表 | 對應方式 |
| --- | --- | --- |
| `111年發料量` | `material_usage_history` | `period_type=YEAR`、`roc_year=111`、`usage_type=ISSUE` |
| `112年發料量` | `material_usage_history` | `period_type=YEAR`、`roc_year=112`、`usage_type=ISSUE` |
| `113年發料量` | `material_usage_history` | `period_type=YEAR`、`roc_year=113`、`usage_type=ISSUE` |
| `114年1月` 到 `114年12月` | `material_usage_history` | `period_type=MONTH`、`roc_year=114`、`usage_month=1-12`、`usage_type=ISSUE` |
| `近1年故障用量` | `material_usage_history` | `period_type=ROLLING_12M`、`usage_type=FAULT` |
| `預估1年故障量` | `material_usage_history` | `period_type=ROLLING_12M`、`usage_type=FORECAST_FAULT` |
| `預檢標準用量` | `pm_template_material` 或 `material_usage_history` | 若是各 P 等級固定用料，優先放 `pm_template_material`。 |
| `大修標準用量` | 後續大修模板或 `material_usage_history` | 大修系統建立前，可先以 `usage_type=OVERHAUL_STANDARD` 暫存。 |
| `淡海倉庫數量`、`安坑倉庫數量` | `inventory_balance` | 這是目前庫存，不是歷史用量。 |
| `公司自購在途量` | 後續採購表 | 這是採購流程，不應放主檔。 |

## 設計好處

1. 後續 115、116、117 年不用新增欄位，只要新增資料列。
2. 同一個料號可以同時保存年度、月份、近一年滾動統計。
3. 前台「用料趨勢」可以直接用 `material_usage_history` 畫圖。
4. 等領料流程上線後，新用量可由 `inventory_transaction` 自動統計，不需要人工改物料主檔。

## 建議執行

既有資料庫升級：

```sql
\i migration-material-master-usage.sql
```

如果你使用目前已產生的 `material-import-tamhai.sql`，建議順序是：

```sql
\i material-import-tamhai.sql
\i migration-material-master-usage.sql
```

原因是目前的匯入檔已經可以匯入物料與原始來源列；migration 會再從料號與 `material_import_source` 回填 `material` 的系統碼、類別碼、類別名稱、流水號與型式碼。
