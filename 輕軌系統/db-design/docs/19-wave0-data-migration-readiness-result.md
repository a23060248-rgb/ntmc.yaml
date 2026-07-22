# Wave 0 資料搬移就緒稽核結果

執行日期：2026-07-15（Asia/Taipei）

## 1. 本次範圍

本次先完成「全部資料搬移」的安全前置工作，不直接把未核准的來源資料寫入目標資料庫：

1. 盤點 PostgreSQL 既有資料表、View、主鍵、外鍵與資料量。
2. 建立逐表用途、搬移順序與整併判斷清冊。
3. 建立來源資料登記表，避免把 Excel、Word、Legacy HTML 或範例資料誤當正式資料。
4. 建立可重跑的搬移就緒稽核程式。
5. 在 5433 的 fresh rehearsal DB 執行結構與資料一致性檢查。
6. 只讀確認 5432 `testdb` 現況；未覆寫、未清空、未刪除任何資料。

## 2. 環境與資料庫現況

| 項目 | 結果 |
|---|---|
| PostgreSQL 正式安裝版本 | PostgreSQL 18 |
| pgAdmin 連線埠 | `5432` |
| 標準 data directory | `C:\Program Files\PostgreSQL\18\data` |
| 專案 rehearsal 埠 | `5433` |
| 本次稽核來源 DB | `ntmc_erp_rehearsal_fresh_20260714180902` |
| 目標測試 DB | `testdb` |
| Legacy HTML | 僅讀取，未修改 |

`testdb` 經 pgAdmin 只讀查詢確認：

- public 物件合計 77 個。
- migration ledger 29 筆：bootstrap 1 筆、業務 migration 28 筆。
- P1 檢查項目 152 筆，P1 狀態為 `PUBLISHED`。
- `students` 測試表仍存在。

依 fresh rehearsal DB 的結構盤點，系統本體為 70 張資料表與 6 個 View；`testdb` 比 fresh 結構多出的可辨識物件是 `students`。因此 `testdb` 已不是空資料庫，也不是尚未建表的狀態，而是已具備目前輕軌系統 schema 與 rehearsal 基準資料，再加上一張獨立測試表。

## 3. Fresh rehearsal 稽核結果

執行 `npm run verify:data-migration-readiness`：

| 檢查 | 結果 |
|---|---|
| 資料表 | 70 |
| View | 6 |
| 外鍵 | 166 |
| 缺少必要資料表 | 0 |
| 缺少必要 View | 0 |
| `inventory_balance` 與儲位餘額不一致 | 0 |
| `students` | 不存在 |

主要基準資料量：

| 資料 | 筆數 |
|---|---:|
| 使用者 | 29 |
| 車輛 | 34 |
| 場站 | 2 |
| 倉庫 | 16 |
| 儲位 | 94 |
| 物料 | 1,150 |
| 物料來源追溯 | 1,147 |
| 儲位庫存餘額 | 1,152 |
| 設備群組 | 8 |
| 序號資產 | 2 |
| 儀器 | 12 |
| W.I.No 文件 | 10 |
| P1-P4 模板 | 4 |
| P1 檢查項目 | 152 |
| P1 模板用料 | 11 |
| P1 模板儀器 | 10 |
| P1 模板 WI | 9 |
| 附件定義／版本 | 2／2 |

工單、排程、Word 列印工作與多數正式歷程目前為 0 筆。這些資料不能由 prototype 假資料或 Legacy HTML 自動補造，必須取得核准來源後才可匯入。

## 4. 資料搬移分波

| Wave | 內容 | 本次狀態 | 寫入前條件 |
|---|---|---|---|
| 0 | schema、ledger、備份、清冊、來源登記 | 完成 | 無 |
| 1 | 場站、車輛、廠商、倉庫、儲位、物料、設備群組與別名 | 部分已有 rehearsal seed | 核准正式來源與自然鍵 |
| 2 | 儀器、WI、P1-P4、用料、附件、Word mapping | P1 基準已有；P2-P4 未完整 | 核准 P2-P4 與 Word 對應 |
| 3 | 坑位、序號件、安裝與異動履歷 | 僅少量 rehearsal 資料 | 核准設備序號與坑位清單 |
| 4 | P/C/R/J 工單、事件、列印與回填 | 尚無正式資料 | 工單來源與單號規則核准 |
| 5 | 領退調耗、交易與餘額 | 基準庫存已有 | 期初日、期初量與交易來源核准 |
| 6 | 24 個月排程與例外日 | 尚無正式資料 | 年度預排、前次完工日與假日清單核准 |
| 7 | 舊用料歷史、稽核與匯入追溯 | 待來源 | 歷史資料範圍與保留政策核准 |

## 5. 整併結論

### 保持分開

- `material` 與 `asset`：前者是料號，後者是有序號的實體件。
- `asset` 與 `vehicle_position`：前者是設備，後者是安裝坑位。
- `work_order` 與 P/C/R/J 子表：共用欄位集中於主表，類型專屬欄位保留子表。
- 主檔模板與工單快照：主檔可改版，既有工單必須保留建立當下版本。
- Word 範本與 W.I.No：一個負責版面輸出，一個負責作業規範。
- 庫存單據、庫存交易、庫存餘額：分別代表業務文件、不可變異動、計算結果。
- `work_order_event`、`asset_event`、`operation_audit_log`：三者追蹤不同主體，不可混為單一備註表。

### 可整併或降級為衍生物件

- `fault_dispatch_catalog` 已適合維持為 `fault_dispatch_node` 的相容 View，不建立第二套實體分類資料。
- `inventory_bin_balance` 應作為儲位餘額主體；待所有 API 改讀彙總 View 後，`inventory_balance` 可評估改為衍生 View。
- `material_usage_history` 保留舊歷史只讀用途；新用量一律由 `inventory_transaction` 產生。
- `asset_task` 需先檢查 API 引用；若沒有獨立流程價值，後續可由工單事件取代，但本次不刪表。

## 6. 本次未直接搬入 `testdb` 的原因

1. `testdb` 已存在完整 schema、ledger 與 rehearsal 基準資料，直接 restore 會覆寫既有內容。
2. CLI 尚未取得專用的 `testdb` 測試角色密碼；pgAdmin 保存的密碼不應從設定中擷取或寫入 Git。
3. P2-P4、設備別名、工單歷史、排程與正式庫存交易尚缺核准來源。
4. 沒有來源的資料不可從畫面假資料、Legacy HTML 或範例 CSV 推導成正式資料。

本次因此採取「先盤點、先驗證、先建立可重跑工具，不執行破壞性覆寫」的策略。

## 7. 下一個可執行批次

1. 在 PostgreSQL 18 建立只允許操作 `testdb` 的專用測試角色，密碼只放本機 `.env.test`。
2. 先備份 `testdb`，保存 dump SHA256 與 ledger 摘要。
3. 填寫 `db-design/templates/data-migration-source-register.csv`，逐項標記來源、負責人、核准狀態與唯一鍵。
4. 先執行 Wave 1 的 dry-run：只寫 staging，不寫正式表。
5. 產出新增、更新、拒絕、重複、未匹配清單供人工核對。
6. 核准後才執行 upsert；重跑必須 0 重複、0 額外扣料、0 遺失 FK。
7. 每個 Wave 完成後執行 readiness audit、API 測試、前端測試、build、`git diff --check`、備份與對帳。

## 8. 相關檔案

- 完整逐表說明與整併判斷：`db-design/docs/18-data-migration-catalog.md`
- 搬移總體執行計畫：`db-design/docs/16-data-migration-execution-plan.md`
- PostgreSQL fresh/restore 證據：`db-design/docs/17-phase0-1-rehearsal-result.md`
- 來源登記表：`db-design/templates/data-migration-source-register.csv`
- 自動稽核程式：`erp-api/scripts/audit-data-migration-readiness.js`

