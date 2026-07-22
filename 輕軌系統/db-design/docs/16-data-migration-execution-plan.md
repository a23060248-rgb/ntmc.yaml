# 輕軌維修系統資料庫搬移執行計畫

更新日期：2026-07-15

## 1. 目標與邊界

本計畫將以下正式業務資料集中到 PostgreSQL：

- P／C／R／J 工單、狀態、派工與完工資料。
- 工單建立、修改、列印、轉派與結案歷程。
- 系統 → 設備群組 → 故障零組件 → 故障子件階層。
- 車號、坑位、設備序號、物料序號與設備別名。
- P1／P2／P3／P4 模板、檢查項目、附件版本、用料、儀器、WI 與 Word mapping。
- 預檢排程、庫存交易、權限、Session 與操作稽核。

以下內容不直接存入資料表：

- React、API、SQL 與 migration 原始碼。
- 原始 Word／PDF／圖片與輸出檔案實體。
- PostgreSQL 實體資料檔。

檔案由受控檔案目錄保存，資料庫只保存路徑、SHA256、版本、對應工單、建立人與時間。

`C:\Users\a2306\AppData\Local\Programs\pgAdmin 4\runtime` 只作為 PostgreSQL 18.4 用戶端工具目錄，不作為資料庫資料目錄或文件儲存目錄。

## 2. 環境分離

| 環境 | 資料庫名稱 | 用途 | 規則 |
| --- | --- | --- | --- |
| rehearsal | `ntmc_erp_rehearsal_YYYYMMDD` | migration、匯入、驗證與回復演練 | 可刪除重建，不得連正式資料 |
| formal | `ntmc_erp` | 核准後的正式資料 | 執行前必須備份、核准與安排維護時段 |

應用程式六種角色保存在 `app_user.system_role`；PostgreSQL 連線帳號則分成：

- migration 帳號：只用於建表、索引、函式與 migration ledger。
- application 帳號：API 執行 CRUD，不使用 PostgreSQL 超級使用者。
- backup 帳號：執行備份與還原驗證。

應用角色與資料庫帳號是不同層次，不得混為一套。

## 3. Phase 0：基準鎖定

### 操作

1. 記錄 Git 狀態與 Legacy HTML SHA256。
2. 記錄 PostgreSQL 版本、連接埠與資料目錄：

```sql
SHOW server_version;
SHOW data_directory;
SHOW port;
SELECT current_database(), current_user;
```

3. 建立來源資料清冊，逐項記錄：
   - 來源檔案或來源資料庫。
   - 資料擁有單位。
   - 原始筆數。
   - 主鍵或可辨識欄位。
   - 日期格式、民國年規則與空值規則。
   - 是否包含個資或敏感內容。
4. 在專案外建立備份目錄，不納入 Git。

### 驗收

- Legacy SHA256 已記錄且後續不得改變。
- 每個來源都有負責人、筆數與匯入批次代碼。
- 正式資料庫尚未進行任何 schema 或資料異動。

## 4. Phase 1：建立 rehearsal 資料庫

### 操作

1. 啟動 PostgreSQL rehearsal 服務。
2. 建立新的可拋棄資料庫，例如 `ntmc_erp_rehearsal_20260715`。
3. 套用 `schema.postgres.sql` 與 migration ledger。
4. 依 `migration-manifest.json` 順序套用 28 支 migration，最後一支為：
   - sequence 280：`migration-pm-attachment-library.sql`
5. 再次執行 migration runner，所有項目必須顯示 `PRESENT`／`VERIFY`，不得重複改寫資料。
6. 載入 rehearsal 專用使用者與最小測試主檔。

### 驗收

- ledger 為 bootstrap 1 筆加業務 migration 28 筆。
- 所有 `verifySql` 回傳成功。
- API `/api/health` 與 `/api/health/db` 正常。
- 重新跑 migration 不新增重複資料。

## 5. Phase 2：建立來源暫存層

所有舊資料先進 staging，不直接寫入正式業務表。

每類資料建立 import batch 與 import row，至少保存：

- `batch_id`
- `source_file`
- `source_sheet`
- `source_row_no`
- `raw_payload`
- `normalized_payload`
- `validation_status`
- `validation_message`
- `target_id`
- `imported_at`

匯入狀態統一使用：

```text
STAGED → VALIDATED → APPROVED → APPLIED
                  ↘ REJECTED
```

### 驗收

- 原始資料可由 `source_file + source_sheet + source_row_no` 追溯。
- 驗證錯誤不會阻止其他資料列進入 staging。
- 未核准批次不得寫入正式業務表。

## 6. Phase 3：主檔與系統階層

### 匯入順序

1. 場站、單位、人員與六種應用角色。
2. 車號、車隊、設備群組與坑位。
3. 系統階層：系統 → 設備群組 → 故障零組件 → 故障子件。
4. 物料、倉庫、儲位與儀器。
5. 設備別名與故障現象、派工分類。
6. 設備序號與目前坑位。

### 驗證規則

- 階層不得形成循環。
- 同層代碼不可重複。
- 設備別名必須對應有效設備群組或物料。
- 一個設備序號同一時間只能有一個有效位置。
- 被引用主檔只能停用，不得實體刪除。

### 驗收

- 每個來源代碼都有唯一 target ID 或明確的未匹配原因。
- 重複、無效與未匹配資料分別產出報告。
- 前端主檔清冊與來源筆數對帳一致。

## 7. Phase 4：預檢模板與作業資源

### 匯入順序

1. P1／P2／P3／P4 模板版本。
2. 區段與檢查項目。
3. 量測標準、單位、上下限與必填規則。
4. 預設用料、數量、條件選項。
5. 儀器與校驗效期規則。
6. WI 文件版本。
7. 附件模板庫與發布版本。
8. P 模板附件選用。
9. Word 範本、固定欄位與動態區塊 mapping。

### 驗證規則

- 發布版本不可修改，只能建立新修訂。
- P 模板只能選擇已發布附件版本。
- 每個 Word mapping 都能解析到有效資料來源。
- P 工單建立時保存完整快照與 SHA256。

### 驗收

- 修改新模板不影響既有 P 工單。
- P1 的 152 項、座椅圖與六點煞車附件可逐項核對。
- PRE_WORK 與 POST_COMPLETION 使用各自核准的 Word mapping。

## 8. Phase 5：工單主檔與類型明細

### 匯入順序

1. `work_order` 共用工單主檔。
2. `pm_work_order` P 工單明細。
3. `fault_work_order` C 工單明細。
4. `repair_work_order` R 工單明細。
5. `project_work_order` J 工單明細。
6. 派工、人力、處理情形、完工資料與工單資源快照。

### 驗證規則

- 工單號全系統唯一。
- 每張工單只能對應一種 P／C／R／J 明細。
- 工單狀態必須符合流程轉移規則。
- 日期先後合理：建立日 ≤ 施工日 ≤ 完工日。
- P 工單必須保留模板快照，不回頭讀最新模板。
- C／R 重複來源必須由唯一約束阻擋。

### 驗收

- 來源工單筆數等於成功匯入加拒絕筆數。
- 每張工單可由清冊開啟詳情。
- 不存在沒有類型明細的孤立 `work_order`。

## 9. Phase 6：工單歷程與文件紀錄

### 匯入內容

- `work_order_event`：建立、修改、派工、狀態轉移、完工與結案。
- `work_order_print_job`：首次列印與完工重印。
- 工單附件與輸出文件 metadata。
- 操作稽核與匯入批次事件。

### 驗證規則

- 事件時間不可早於工單建立時間。
- 每次狀態轉移都要有操作者與時間。
- 檔案必須有 SHA256、版本與可解析路徑。
- 文件遺失時保留 metadata 並標示 `FILE_MISSING`，不可偽造成功。

## 10. Phase 7：周轉件與設備履歷

### 匯入內容

- 設備序號與目前位置。
- 拆下、裝上、送修、驗收、回庫與報廢事件。
- C 工單到 R 工單的來源關聯。
- 坑位與設備序號歷史。

### 驗證規則

- 同一來源 C 工單與拆下序號只能建立一張 R 工單。
- 每次現況改變必須有 `asset_event`。
- 設備目前位置必須可由事件歷程重算。
- 坑位同一時間只能有一個有效裝用件。

### 驗收

- 可由 P 細項追到 C、R、序號、坑位與事件時間軸。
- 坑位矩陣現況與 `asset_event` 重算結果一致。

## 11. Phase 8：庫存與工單耗用

### 匯入順序

1. 倉庫與儲位期初數量。
2. 領料、退料、調撥與工單耗用交易。
3. 工單實際用料關聯。

### 驗證規則

- 不直接修改 balance；只新增交易後重算餘額。
- 交易不可使庫存為負。
- 每筆工單耗用必須對應有效工單與物料。
- 使用 idempotency key 防止重複過帳。

### 驗收

- 交易重算餘額等於 balance 表。
- 各倉庫、儲位與物料總量對帳一致。
- 重複提交不會再次扣料。

## 12. Phase 9：排程與最新完工日

### 匯入內容

- 年度預排來源與匯入批次。
- 24 個月預排項目。
- 人工改期、假日與重排歷程。
- 各車輛／設備最新實際完工日。

### 驗證規則

- 車輛預檢間隔限制 24–36 天。
- 3M／6M／1Y 觸發的鏇削優先排在檢修前，可跨前月。
- 假日、容量與一天一台鏇削規則必須重驗。
- 排不進去的工項仍存在並標示複核，不得消失。

## 13. Phase 10：全系統驗證

每批匯入後固定執行：

1. API syntax check。
2. API tests。
3. domain verify script。
4. frontend tests。
5. single HTML build。
6. `git diff --check`。
7. Legacy SHA256 比對。
8. 來源筆數、staging 狀態與正式表筆數對帳。

主要驗收案例：

- 正常 P1：排程 → 列印 → 回填 → 耗料 → 完工 → 重印。
- 座椅 X：未處理異常不得完工。
- 煞車超標：自動判異常並建立／連結 C 單。
- C 拆件：唯一 R 單 → 維修 → 驗收 → 回庫。
- 臨時假日：整段重排且不漏排。
- 唯讀角色：所有異動 API 回傳 403。

## 14. 備份、回復與正式切換

### 正式切換前

1. 使用 `pg_dump.exe` 建立 custom-format 完整備份。
2. 在新的 rehearsal restore DB 執行 `pg_restore.exe`。
3. 比對 migration ledger、主要資料表筆數與摘要雜湊。
4. 執行完整端對端測試。
5. 取得人工核准並安排正式維護時段。

### 回復條件

出現下列任一情形即停止正式搬移並回復：

- migration verify 失敗。
- 工單、庫存或設備履歷對帳不一致。
- Word 輸出版面或快照版本錯誤。
- 權限測試出現越權。
- API 或前端主要流程無法完成。

### 正式切換後

- 保留匯入批次、來源檔案 SHA256、對帳報告與備份檔。
- 舊來源先改為唯讀，不立即刪除。
- 觀察至少一個完整 P 工單週期後，才決定舊系統封存日期。

## 15. 執行產物

每個資料域至少交付：

- staging migration。
- import script。
- validate script。
- apply script。
- reconcile report。
- rollback／restore 說明。
- API 與畫面驗收紀錄。

報告與暫存資料放在 `.local-rehearsal`，正式 schema 與可重跑程式才進 Git。

## 16. 下一個可執行批次

先完成 Phase 0 與 Phase 1：

1. 確認 PostgreSQL 18 伺服器的 port、`data_directory` 與可用連線帳號。
2. 啟動或建立 `ntmc_erp_rehearsal_20260715`。
3. 使用現有 28 支 migration 完成全新建庫與重跑驗證。
4. 建立備份、還原與 ledger 對帳報告。
5. 通過後才開始「系統階層與主檔」來源清冊及 staging 匯入。

本批次不得連接或修改 `ntmc_erp` 正式資料庫。
