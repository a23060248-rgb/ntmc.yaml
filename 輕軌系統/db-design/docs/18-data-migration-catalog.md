# 輕軌維修系統資料搬移對照清冊

更新日期：2026-07-15

## 1. 目的與邊界

本文件是資料搬移的唯一對照入口。每一個資料庫物件都必須先定義用途、來源、搬移方式、自然鍵及整併決策，才可以進入 `testdb`。

- 目標測試資料庫：PostgreSQL 18 `testdb`，port `5432`。
- 自動化演練資料庫：port `5433` 的 disposable rehearsal database。
- Legacy HTML 只作規格參考，不是正式資料來源。
- Word、Excel、PDF 與圖片保留原始檔；資料庫只保存版本、路徑、SHA256、欄位對應及輸出紀錄。
- 正式業務資料不得從前端假資料或 `localStorage` 匯入。
- 本輪不處理正式資料庫，也不刪除任何有業務關聯的資料。

## 2. 資料分級

| 分級 | 定義 | 搬移方式 |
| --- | --- | --- |
| 主檔 | 人、車、料、設備、倉庫、儀器、WI 等長期共用資料 | 先進 staging，依自然鍵 upsert |
| 版本主檔 | P1-P4、附件、Word mapping 等不可覆寫的發布版本 | 新增版本，不更新已發布版本 |
| 交易 | 工單、庫存交易、列印、回填、排程異動 | 保留原始單號與事件順序，禁止重複寫入 |
| 歷程 | 工單事件、設備事件、稽核紀錄 | append-only，不重建成最新狀態 |
| 匯入暫存 | import batch、import row、來源原文 | 保存來源與錯誤，不供正式畫面直接使用 |
| 快取/檢視 | balance、報表 view、相容 view | 由正式交易重算或重建，不視為原始來源 |

## 3. 逐表用途、搬移與整併決策

### 3.1 登入、權限與系統治理

| 物件 | 用途 | 搬移方式 | 整併判斷 |
| --- | --- | --- | --- |
| `app_user` | 使用者、帳號、部門與六角色 | 以 employee_no/account 對應；密碼必須重新雜湊 | 保留 |
| `user_session` | HttpOnly session 的雜湊、效期及撤銷狀態 | 不搬舊 session，切換後全部重新登入 | 不與使用者合併 |
| `operation_audit_log` | API 異動前後摘要、操作者與 request ID | 歷史可搬，新系統 append-only | 不與工單事件合併 |
| `schema_migration` | schema 版本、檔案 SHA256 與套用結果 | 由 migration runner 建立，不從業務來源匯入 | 必須獨立 |
| `workflow_option` | 共用流程選項、狀態與分類標籤 | 以 option_group + option_code upsert | 保留；不可濫用為任意 key-value |
| `document_sequence` | P/C/R/J 與庫存單號流水 | 從實際最大單號校正後建立 | 保留；不得直接搬錯誤流水 |

### 3.2 車輛、場站、倉庫與設備主檔

| 物件 | 用途 | 搬移方式 | 整併判斷 |
| --- | --- | --- | --- |
| `operating_site` | 場站與維修基地 | 以 site_code upsert | 保留 |
| `train` | 車號、車型、場站及啟用狀態 | 以 train_no upsert | site_code 最終改為 FK |
| `vendor` | 外修與供應廠商 | 以 vendor_code upsert | 保留 |
| `warehouse` | 實體倉、維修區、車上及人員等位置 | 以 warehouse_code upsert | 保留共用位置模型 |
| `warehouse_bin` | 倉庫內儲位 | 以 warehouse_id + bin_code upsert | 不與倉庫合併 |
| `equipment_group` | 標準設備群組與系統歸類 | 以 group_code upsert | 保留為 canonical name |
| `equipment_alias` | 舊名稱、來源名稱對標準設備/物料的對應 | 核准清單驗證後匯入 | 不可併入 equipment_group |
| `vehicle_position` | 車輛坑位、父子位置與目前安裝件 | 先搬位置，再綁 current_asset_id | 不與 asset 合併 |
| `asset` | 每一件有序號的實體設備 | 以 serial_no/asset_no 對應 | 不與 material 合併 |
| `asset_event` | 拆下、裝上、送修、回庫及報廢歷程 | 按發生時間 append-only | 唯一設備歷程來源 |
| `asset_task` | 舊版設備待辦 | 先封存；確認 API 無獨立需求後遷入工單事件 | 候選淘汰 |

### 3.3 物料、庫存與匯入來源

| 物件 | 用途 | 搬移方式 | 整併判斷 |
| --- | --- | --- | --- |
| `material` | 料號、品名、規格、單位及安全庫存 | 以 part_no upsert | 保留 |
| `material_import_source` | 舊物料來源列與原始欄位 | 搬為來源證據，不作即時主檔 | 保留唯讀 |
| `material_usage_history` | 無交易明細的歷史彙總用量 | 標示來源期間後搬入 | 新資料改由 transaction 計算 |
| `inventory_document` | 領料、退料、調撥等單據表頭 | 保留原單號與狀態 | 不與交易合併 |
| `inventory_document_line` | 單據用料明細 | 隨表頭匯入 | 不與表頭合併 |
| `inventory_transaction` | 不可變更的庫存過帳流水 | 依來源單據與 idempotency key 搬入 | 庫存真實來源 |
| `inventory_posting_request` | 防止重複過帳的請求紀錄 | 不搬過期請求；切換後重新建立 | 保留 |
| `inventory_bin_balance` | 每個儲位的即時數量 | 由交易重算並對帳 | 建議作 canonical balance |
| `inventory_balance` | 每個倉庫的彙總數量 | 由 bin balance/transaction 重算 | 未來可改 aggregate view |

### 3.4 儀器、WI、預檢模板與附件

| 物件 | 用途 | 搬移方式 | 整併判斷 |
| --- | --- | --- | --- |
| `instrument` | 儀器、類型、校驗效期與狀態 | 以 instrument_no upsert | 保留 |
| `wi_document` | W.I.No、版本與受控文件 | 以 wi_no + revision 建立版本 | 不與 Word 表單合併 |
| `pm_template` | P1-P4 模板版本及發布狀態 | 每個 revision 新增；發布後不可改 | 保留 |
| `pm_template_section` | 模板區段與排序 | 隨 template revision 搬入 | 不與檢查項目合併 |
| `pm_template_check_item` | 檢查名稱、型態、單位、標準與排序 | 以 template + item_code 建立 | 保留；P1 目前 152 筆 |
| `pm_template_material` | 各級預設用料、數量與條件 | 隨模板版本建立 | 不與工單實際用料合併 |
| `pm_template_instrument` | 各級預設儀器與效期規則 | 隨模板版本建立 | 不與工單儀器快照合併 |
| `pm_template_wi` | 各級預設 WI | 隨模板版本建立 | 不與 WI 主檔合併 |
| `pm_attachment_definition` | 座椅圖、煞車表等附件種類 | 以 attachment_code 建立 | 保留 |
| `pm_attachment_definition_version` | 每種附件的版面與資料結構版本 | 新版本新增，舊版不覆蓋 | 保留 |
| `pm_template_attachment` | 模板版本選用哪些附件 | 隨模板版本建立 | 保留關聯表 |
| `pm_template_check_item_import_batch` | 檢查項目匯入批次 | 保存檔名、SHA256、狀態及統計 | staging，不與模板合併 |
| `pm_template_check_item_import_row` | 每列原文、正規化值與錯誤 | 驗證通過後才建立模板項目 | staging |

### 3.5 Word 表單與輸出驗證

| 物件 | 用途 | 搬移方式 | 整併判斷 |
| --- | --- | --- | --- |
| `form_template` | 原始 Word 範本版本、路徑與 SHA256 | 只登錄核准且可讀取的原始檔 | 不與 WI 合併 |
| `form_template_field_mapping` | 單值欄位到 bookmark/content control 的對應 | 隨 Word 版本建立 | 保留 |
| `form_template_block_mapping` | 表格、附件及重複區塊的對應 | 隨 Word 版本建立 | 不與單值 mapping 合併 |
| `form_template_verification_run` | 每次 Word 版面驗證總結果 | 保存版本與輸出雜湊 | 保留驗證證據 |
| `form_template_block_verification` | 各區塊逐項驗證結果 | 隨 verification run 保存 | 保留 |

### 3.6 P/C/R/J 工單、快照與歷程

| 物件 | 用途 | 搬移方式 | 整併判斷 |
| --- | --- | --- | --- |
| `work_order` | P/C/R/J 共用單號、目標、狀態與日期 | 以 work_order_no 匯入 | 保留父表 |
| `pm_work_order` | P 單級別、模板快照與預檢日期 | 隨父工單匯入 | 不與父表合併 |
| `fault_work_order` | C 單異常、來源 P 細項與故障資料 | 隨父工單匯入 | 不與父表合併 |
| `repair_work_order` | R 單來源 C 單、拆裝序號及維修流程 | 隨父工單匯入 | 不與父表合併 |
| `project_work_order` | J 專案工單特有資料 | 隨父工單匯入 | 不與父表合併 |
| `work_order_material` | 建單時預設與實際用料快照 | 隨工單搬入 | 不讀最新 template 取代 |
| `work_order_instrument` | 建單時儀器快照 | 隨工單搬入 | 不讀最新 instrument 取代 |
| `work_order_wi` | 建單時 WI 版本快照 | 隨工單搬入 | 不讀最新 WI 取代 |
| `work_order_attachment` | 工單實際附件/輸出 metadata | 檔案存在且 SHA256 正確才搬 | 不與附件定義合併 |
| `work_order_event` | 建立、派工、列印、完工及結案時間軸 | 按事件時間 append-only | 不與 audit log 合併 |
| `work_order_print_job` | PRE_WORK/POST_COMPLETION 列印紀錄 | 保留模板版號、輸入及輸出雜湊 | 保留 |
| `pm_work_order_check_result` | P 單逐項結果、量測值與異常 | 隨 P 單快照搬入 | 不與模板項目合併 |
| `pm_work_order_attachment_result` | 座椅 X、六點煞車等附件結果 | 隨 P 單及附件版本搬入 | 保留 |
| `pm_work_order_danger_period` | 多段危險工時 | 隨 P 單搬入 | 不塞入 JSON/備註 |
| `fault_finish_record` | C 單完工處理紀錄 | 隨 C 單搬入 | 保留結構化資料 |
| `repair_record` | R 單內外修、驗收與費用紀錄 | 隨 R 單搬入 | 不塞入工單備註 |
| `scrap_record` | 報廢核准與結果 | 隨 R 單/asset 搬入 | 保留 |

### 3.7 故障分類與派工樹

| 物件 | 用途 | 搬移方式 | 整併判斷 |
| --- | --- | --- | --- |
| `fault_system_node` | 系統、設備、零組件的分類樹 | 以 parent + node_code 建立 | 保留 canonical tree |
| `fault_phenomenon` | 故障現象與分類關聯 | 以 phenomenon_code/名稱對應 | 保留 lookup |
| `fault_dispatch_node` | 派工判斷與故障原因樹 | 以 parent + node_code 建立 | 保留 canonical dispatch tree |
| `fault_dispatch_catalog` | 舊版平面查詢相容層 | 由 node tree 重建 View | 不搬資料；已整併為 View |

### 3.8 排程與行事曆

| 物件 | 用途 | 搬移方式 | 整併判斷 |
| --- | --- | --- | --- |
| `pm_schedule_import_batch` | 年度預排匯入批次 | 保存來源、年月、SHA256 及狀態 | 保留批次表 |
| `pm_schedule_item` | 每台車/設備每月檢修與實際預排日 | 依來源批次及自然鍵匯入 | 保留正式排程 |
| `pm_schedule_change_log` | 人工修改、假日重排及發布前後值 | append-only | 不與 schedule item 合併 |
| `pm_calendar_exception` | 國定假日、颱風假及人工不可排日 | 以日期 + 類型管理 | 保留 |

### 3.9 安裝匯入暫存

| 物件 | 用途 | 搬移方式 | 整併判斷 |
| --- | --- | --- | --- |
| `asset_installation_import_batch` | 序號件/坑位安裝匯入批次 | 保存來源檔與驗證統計 | staging |
| `asset_installation_import_row` | 每列安裝資料、正規化值及錯誤 | 核准後才建立 asset_event | staging |

### 3.10 共用主檔匯入暫存

| 物件 | 用途 | 搬移方式 | 整併判斷 |
| --- | --- | --- | --- |
| `master_data_import_batch` | Wave 1 主檔匯入批次、來源檔與審核狀態 | 每一來源檔與主檔種類建立一個批次 | 共用批次表，不為每種主檔重複建表 |
| `master_data_import_row` | 原始列、正規化值、自然鍵、驗證與套用結果 | 審核通過後才可 upsert 正式主檔 | 共用逐列表；業務主檔仍維持獨立表 |
| `master_data_import_issue_resolution` | 將重複警告與拒絕列彙整成可逐項核准的決策清單 | 保存問題證據、建議動作、審核狀態與審核人 | 不與逐列表合併；已審核決策不可被重跑覆寫 |
| `v_master_data_import_batch_summary` | 批次總列數、有效、警告、拒絕與套用統計 | 由逐列狀態即時計算 | View，不保存重複統計值 |
| `v_master_data_import_issue_resolution_summary` | 每批待審、核准、拒絕組數與影響列數 | 由問題審核表即時計算 | View，不保存重複統計值 |

共用 staging 只涵蓋場站、車輛、廠商、倉庫、儲位、物料、設備群組與設備別名。模板檢查項目、排程與序號件安裝具有專屬驗證規則，繼續使用各自的 import batch/row，不併入這兩張共用表。

### 3.11 View

| View | 用途 | 搬移方式 |
| --- | --- | --- |
| `fault_dispatch_catalog` | 舊 API 使用的平面派工分類 | 由 migration 重建 |
| `v_asset_current_status` | 序號件目前位置與狀態 | 由基礎表重建 |
| `v_equipment_alias` | 設備別名查詢 | 由基礎表重建 |
| `v_master_data_import_batch_summary` | Wave 1 匯入批次驗證與套用統計 | 由共用 staging 重建 |
| `v_master_data_import_issue_resolution_summary` | Wave 1 問題審核狀態與影響列數 | 由問題審核表重建 |
| `v_material_location_balance` | 物料位置分布 | 由庫存表重建 |
| `v_material_stock_summary` | 物料總庫存摘要 | 由庫存表重建 |
| `v_open_repair_work_orders` | 未結 R 單摘要 | 由工單表重建 |

## 4. 搬移波次

1. **Wave 0 基準與來源登錄**：備份、來源清冊、筆數、SHA256、責任人、核准狀態。
2. **Wave 1 基礎主檔**：site、train、vendor、warehouse、bin、material、equipment_group、alias。
3. **Wave 2 模板與文件**：instrument、WI、P1-P4、檢查項目、用料、附件、Word mapping。
4. **Wave 3 序號與現況**：vehicle_position、asset、asset_event；先位置後設備再歷程。
5. **Wave 4 工單**：work_order 父表、P/C/R/J 子表、快照、事件及列印紀錄。
6. **Wave 5 庫存**：document、line、transaction；最後重算 balance。
7. **Wave 6 排程**：import batch、schedule item、change log、calendar exception。
8. **Wave 7 歷史與封存**：material history、舊匯入來源、audit log。

## 5. 每批固定驗收

- `source_count = applied_count + rejected_count`。
- 所有 rejected row 必須有來源列號與拒絕原因。
- 自然鍵不得重複，所有 FK 不得出現孤兒資料。
- P 單可追到 template revision、Word version、附件版本、用料、儀器與 WI 快照。
- C 單可追到 P 單檢查細項；R 單可追到 C 單、拆下序號及 asset event。
- 庫存餘額必須可由 transaction 重算一致。
- migration ledger 首跑與重跑都通過 verify。
- 匯入前後都建立 custom-format dump 並核對 SHA256。

## 6. 目前可立即執行與阻擋

可立即執行：

- 在 5433 fresh rehearsal DB 產生完整物件、筆數、PK、FK、View 與整併候選稽核。
- 核對現有 1150 筆 material、1147 筆 material source、P1 152 項及 2 個附件版本。
- 建立來源登錄表，等待每一種資料指定權威來源。

套用到 5432 `testdb` 前的必要條件：

- 提供只限 `testdb` 的資料庫帳號或安全的本機連線方式；密碼不得提交 Git。
- 確認 `testdb` 目前資料是否全部視為可覆寫 rehearsal 資料。
- 先備份 `testdb`，再執行 dry-run、apply 及 reconcile。
