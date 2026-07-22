# Wave 1 主檔搬移暫存層執行結果

執行日期：2026-07-15（Asia/Taipei）

## 1. 本次目標

先建立可審核、可重跑、可追溯的 Wave 1 主檔搬移入口，不直接把未核准來源寫入正式主檔，也不修改 PostgreSQL 5432 的 `testdb`。

Wave 1 涵蓋：

- 場站 `operating_site`
- 車輛 `train`
- 廠商 `vendor`
- 倉庫 `warehouse`
- 儲位 `warehouse_bin`
- 物料 `material`
- 設備群組 `equipment_group`
- 設備別名 `equipment_alias`

## 2. 新增資料結構

### `master_data_import_batch`

每個來源檔與主檔種類建立一個批次，保存來源檔名、SHA256、工作表、權威來源、預期筆數、建立人、審核人、套用人與狀態。

狀態流程：

`DRAFT -> VALIDATED -> APPROVED -> APPLIED`

也可在尚未套用前進入 `REJECTED` 或 `CANCELLED`。終結狀態不可再修改，避免事後竄改匯入證據。

### `master_data_import_row`

每一來源列保存：

- 來源列號
- 自然鍵
- 原始 JSON
- 正規化 JSON
- payload SHA256
- 驗證狀態與訊息
- 建議動作：新增、更新、不變或拒絕
- 最終目標資料 ID
- 審核與套用時間

同一批次內禁止重複來源列號與重複自然鍵。

### `v_master_data_import_batch_summary`

即時計算批次的暫存、有效、警告、無效、套用、新增、更新與不變筆數，不另存容易失去同步的統計欄位。

## 3. 為何只整併暫存層

八種主檔都需要相同的「來源、驗證、審核、套用」生命週期，因此共用 batch/row，避免建立十多張重複 staging 表。

正式主檔不整併：車輛、物料、倉庫、設備群組各有不同欄位、外鍵與業務限制，仍分別保存。模板項目、排程與序號件安裝也保留專屬 staging，因為它們有版本、日期或事件型規則，不能套用一般主檔驗證。

## 4. 程式驗證層

新增 `masterDataImport` service，集中管理八種 entity kind 的必要欄位、字串正規化、自然鍵與 payload hash。React 畫面或匯入腳本不得自行拼接不同版本的驗證規則。

已驗證：

- 八種主檔種類固定且完整。
- 物料欄位可正規化並產生穩定自然鍵。
- 儲位自然鍵包含父倉庫，避免跨倉重複。
- 車輛場站只接受目前核准代碼。
- 設備別名必須指定標準設備群組或物料。
- JSON 欄位順序不同仍產生相同 hash。

## 5. Rehearsal 執行證據

執行資料庫：`ntmc_erp_rehearsal_fresh_20260714180902`，PostgreSQL 5433。

| 檢查 | 結果 |
| --- | --- |
| migration manifest | 29 支業務 migration |
| 第一次套用 | 既有 28 VERIFY，新增 290 APPLY |
| 第二次重跑 | 29/29 VERIFY，0 APPLY |
| ledger | 30 筆，含 bootstrap 1 筆 |
| staging 交易測試 | 2 列驗證成功 |
| 測試後殘留 | 0 列，交易已 ROLLBACK |
| 資料表 / View | 72 / 7 |
| 外鍵 | 171 |
| 必要物件缺少 | 0 |
| 庫存彙總不一致 | 0 |
| `students` | rehearsal DB 不存在 |

PostgreSQL 5432 的 `testdb` 本次未修改、未清空、未套用 migration 290。

## 6. 下一批執行順序

1. 為來源登記表中的 Wave 1 各項補齊 `source_location`、權威來源、owner、核准時間與預期筆數。
2. 先匯入 staging，產出新增、更新、不變、重複、無效與未匹配報告。
3. 由資料 owner 核對自然鍵及欄位正規化結果。
4. 核准後才新增 idempotent upsert service；不得由前端直接寫正式主檔。
5. upsert 與批次狀態更新必須在同一交易完成。
6. 重跑同一來源必須是 0 重複；來源內容有變更時必須建立新批次並保存新 SHA256。
7. 完成 Wave 1 後再處理 Wave 2 的儀器、WI、P1-P4、用料、附件與 Word mapping。

## 7. 目前限制

- 來源登記表多數仍為 `TBD` 或 `DISCOVERY`，因此本次沒有合法來源可實際 upsert。
- `equipment_alias.csv` 是範例檔，不能當正式核准清單。
- 現有 1,147 筆物料 Excel 可先進 staging 比對，但在 authority 與 owner 補齊前不可套入目標。
- 正式資料庫與 `testdb` 的變更仍需另行備份、專用帳號與人工核准。
