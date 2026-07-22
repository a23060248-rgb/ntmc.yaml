# Wave 1 物料問題審核清單結果

執行日期：2026-07-15（Asia/Taipei）

## 1. 目的與範圍

本批將 `WAVE1-MATERIAL-387B23494318575E` 的警告與拒絕列，依「問題種類 +
待決策自然鍵」彙整成可審核清單。清單只保存證據、建議動作與審核狀態；不會自動修改
來源 Excel、lookup 或正式 `material` 主檔。

- Rehearsal DB：`ntmc_erp_rehearsal_fresh_20260714180902`（PostgreSQL 5433）
- Migration：`310 migration-master-data-import-issue-resolution.sql`
- 審核表：`master_data_import_issue_resolution`
- 摘要 View：`v_master_data_import_issue_resolution_summary`
- 初始狀態：全部 `PENDING`
- 自動套用：全部 `false`

## 2. 審核清單摘要

| 問題 | 決策組數 | 影響來源列 | 建議動作 |
| --- | ---: | ---: | --- |
| 類別 lookup 名稱損壞 | 10 | 129 | `REPAIR_CATEGORY_LOOKUP_NAME` |
| 來源類別不存在 | 6 | 8 | `ADD_CATEGORY_OR_CORRECT_SOURCE` |
| 來源單位不存在 | 10 | 60 | `ADD_UNIT_LOOKUP` |
| **合計** | **26** | **197** | 全部待 owner / 核准人判定 |

### 類別 lookup 名稱損壞

待判定組合：`96/01`、`96/02`、`96/05`、`96/06`、`96/07`、`96/08`、
`96/09`、`96/10`、`96/11`、`96/12`。

### 來源類別不存在

待判定組合：`50/EV`、`96/56`、`96/57`、`96/58`、`96/59`、`96/60`。

### 來源單位不存在

待判定單位：`CN` 28 列、`PL` 13 列、`PR` 7 列、`台` 3 列、`DR` 2 列、
`CL` 2 列、`CO` 2 列、`BG` 1 列、`BL` 1 列、`PG` 1 列。

## 3. 安全與可重跑驗證

- Migration 重跑：31/31 `VERIFY`，0 `APPLY`。
- Ledger：32 筆，包含 bootstrap 1 筆與業務 migration 31 筆。
- 審核清單重跑後仍為 26 組、197 列，不會累加重複的 `PENDING` 項目。
- 已審核的 `APPROVED` / `REJECTED` 項目不會被重跑程序刪除或覆寫。
- `material` 主檔執行前後皆為 1,150 筆。
- 本次審核腳本使用的精簡 review hash 執行前後均為
  `289B67E7AC20E49437FF52A41C0559D3F4D37770AECCC6A700B22AC6FAADB916`。
- 上述 review hash 只包含 `id`、料號、名稱、類別與單位，與 dry-run 文件的完整欄位
  SHA256 計算範圍不同；兩者不可互相比值，但各自的執行前後結果均一致。
- PostgreSQL 5432 `testdb` 未執行任何寫入。

完整審核證據位於忽略版控的 rehearsal 目錄：

- `.local-rehearsal/wave1-material-387b23494318575e-review.json`
- `.local-rehearsal/wave1-material-387b23494318575e-review.csv`

## 4. 下一步與套用門檻

1. 指定物料來源 owner 與核准人。
2. 逐組填寫正確類別名稱、類別是否新增、或單位對應方式。
3. 核准時保存證據、備註、審核人與時間，不以批次全選取代逐組判定。
4. 核准後另建 transactional canonical upsert；upsert 只能讀取 `APPROVED` 組與有效列。
5. 套用前後產生逐列 reconciliation，並再次驗證主檔、lookup、FK 與庫存資料。

在上述條件完成前，批次維持 `STAGED_REVIEW`，不得更新正式主檔。
