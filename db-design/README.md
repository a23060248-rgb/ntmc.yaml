# 預檢工單系統資料庫設計

這個資料夾放的是目前 HTML 系統下一階段可落地的資料庫設計。預設資料庫是 PostgreSQL。

## 正式文件

正式版資料庫說明放在 `docs/`：

- `docs/00-database-overview.md`：資料庫總覽、分層、主要流程與目前明確不做的項目。
- `docs/01-core-master-data.md`：人員、車隊、倉庫、流程選項、單號、物料、設備、儀器與 WI 主檔。
- `docs/02-work-order-design.md`：P/C/R/J 工單、工單編號、C 接 R、工單關聯資料。
- `docs/03-material-inventory-design.md`：物料、用量歷史、庫存位置、領料/退料/調撥共用庫存異動單。
- `docs/04-asset-position-history-design.md`：設備序號、坑位、裝用關係、設備履歷與現場盤點匯入。
- `docs/05-repair-workflow-design.md`：R 維修流程主狀態、處理路線、外修、驗收、看板分組。
- `docs/06-import-and-migration-guide.md`：全新建庫、既有資料庫升級、物料/坑位/設備裝用匯入。
- `docs/07-api-data-contract.md`：API 資料契約草案，供後續前台/後台/API 對接。

## 檔案

- `schema.postgres.sql`：主要 DDL，包含主檔、工單、履歷、庫存、送修、報廢、待辦與報表 view。
- `migration-train-fleet.sql`：舊版資料庫升級用，補上車隊場站、原車號與排序欄位。
- `migration-inventory-location-status.sql`：舊版資料庫升級用，補上中心倉庫、已領料、儲位庫存設計。
- `migration-work-order-numbering.sql`：舊版資料庫升級用，補上 P/C/R/J 工單編碼欄位與專案工單明細。
- `migration-vehicle-position-slots.sql`：舊版資料庫升級用，補上坑位階層、場站、可裝設備與來源追溯欄位。
- `migration-asset-installation-import-staging.sql`：建立設備序號與坑位裝用盤點的匯入暫存表。
- `migration-repair-workflow-options.sql`：建立 R 維修流程狀態清單使用的 `workflow_option`。
- `migration-material-master-usage.sql`：補上物料料號拆解欄位與 `material_usage_history` 用量歷史表。
- `migration-document-sequence-inventory-document.sql`：建立單號流水表與領料/退料/調撥共用的庫存異動單。
- `seed-reference-data.sql`：參考種子資料，先放人員、車號、倉庫、設備群組、物料、儀器、WI、P1-P4 模板。
- `seed-repair-workflow-options.sql`：R 維修流程狀態、處理路線、位置、外修狀態、驗收結果與看板分組。
- `add-list-content-guide.md`：說明物料、設備、儀器、WI、P 工單、R 工單要新增到哪張表。
- `insert-examples.sql`：可直接參考的新增物料、庫存、有序號設備 SQL 範例。
- `list-admin-prototype.html`：人性化清單管理操作原型，可直接用瀏覽器打開。
- `human-friendly-operations.md`：新增、減少、停用、還原與庫存異動的 UX 規則。
- `work-order-numbering.md`：P/C/R/J 工單編碼規則，固定 `C-1150514-D-TS-031` 這類格式。
- `vehicle-position-slot-design.md`：坑位主檔設計，定義 Location_ID、Parent_ID、分類、總成、子件與設備裝用關係。
- `vehicle-position-slots-tamhai-ts101.csv`：由 `周轉建0304.xlsx` 整理出的 TS101 坑位清單。
- `build-tamhai-vehicle-position-slots.ps1`：把 TS101 坑位模板依淡海 18 台車展開。
- `vehicle-position-slots-tamhai.csv`：淡海 18 台車展開後的正式坑位匯入清單。
- `vehicle-position-import-tamhai.sql`：將淡海坑位 CSV 匯入 `vehicle_position` 的 SQL。
- `asset-installation-import-guide.md`：現場盤點設備序號與坑位裝用的匯入格式說明。
- `build-asset-installation-checklist.ps1`：由淡海坑位清單產生現場盤點填寫檔。
- `asset-installation-field-checklist-tamhai.csv`：給現場填寫的淡海設備序號與坑位裝用盤點清單。
- `asset-installation-import-stage.sql`：把現場填寫檔匯入暫存表並做基本檢查。
- `repair-workflow-status-design.md`：R 維修流程狀態清單設計，定義主狀態、處理路線、位置、外修與驗收。
- `repair-workflow-status-reference.csv`：R 維修流程選項清單，可供後台清單管理或人工檢查。
- `material-master-usage-design.md`：物料主檔、統一請購點與歷史用量分表設計。
- `material-usage-history-template.csv`：111、112、113、114 年/月用量匯入格式範例。
- `inventory-document-numbering-design.md`：庫存異動單號規則，領料、退料、調撥共用 `I-民國日期-場站-MAT-流水號`。
- `train-fleet-design.md`：淡海與安坑車隊主檔定義。
- `train-master-reference.csv`：目前 30 台車的車號主檔參考清單。
- `build-tamhai-material-db.ps1`：讀取 `物料` 資料夾內的淡海物料 Excel，產生匯入檔。
- `material-catalog-tamhai.csv`：淡海物料完整清單，適合人工檢查與 Excel 開啟。
- `material-catalog-tamhai.json`：淡海物料 JSON，適合前端或 API 測試使用。
- `material-import-tamhai.sql`：淡海物料 PostgreSQL 匯入 SQL，包含物料、倉庫、儲位、庫存與原始來源列。
- `material-import-summary.md`：淡海物料匯入摘要與注意事項。
- `material-next-steps.md`：淡海物料正式上線前的建議檢查與下一步。
- `inventory-location-design.md`：中心倉庫、分存站、已領料、儲位庫存的設計說明。
- `erd.mmd`：Mermaid ERD，可貼到支援 Mermaid 的 Markdown 工具預覽。
- `migration-notes.md`：目前 HTML 資料要搬進資料庫時的對應方式。

## 分層原則

資料不要照畫面分，而要照責任分：

1. 主檔層：`material`、`asset`、`equipment_group`、`vehicle_position`、`instrument`、`wi_document`、`train`、`warehouse`、`warehouse_bin`、`workflow_option`、`document_sequence`
2. 模板層：`pm_template`、`pm_template_material`、`pm_template_instrument`、`pm_template_wi`
3. 工單層：`work_order` 加上 `pm_work_order`、`fault_work_order`、`repair_work_order`
4. 關聯層：`work_order_material`、`work_order_instrument`、`work_order_wi`
5. 履歷層：`asset_event`
6. 庫存層：`inventory_document`、`inventory_document_line`、`inventory_balance`、`inventory_bin_balance`、`inventory_transaction`
7. 流程輔助層：`repair_record`、`scrap_record`、`asset_task`
8. 看板層：`v_asset_current_status`、`v_open_repair_work_orders`、`v_material_stock_summary`

物料主檔只保存「物料是什麼」。111、112、113 年發料量、114 年每月用量、近一年故障用量等時間序列資料放在 `material_usage_history`，不要一直往 `material` 增加年份欄位。安全庫存先使用 `material.reorder_point` 作為統一請購點。

## 最重要的設計規則

`asset.current_status` 只保存目前狀態。任何狀態改變都要新增一筆 `asset_event`。

例如一顆 DCU 從車上下線、建立 R 工單、送修、修回、驗收、回庫，不應該只更新同一列；每一步都要寫事件，這樣履歷才追得回來。

## 庫存位置與領料規則

`warehouse` 在這套設計裡不是只有傳統倉庫，也代表物料目前的保管位置。

- `CENTER_WAREHOUSE`：中心倉庫，預設 `stock_status = AVAILABLE`，表示尚未領料、可發料。
- `SUB_STATION`、`FIELD`、`VEHICLE`、`PERSON`：分存站、現場、車上、個人保管，預設代表已領料或使用中。
- `inventory_balance`：依物料、位置、庫存狀態彙總。
- `inventory_bin_balance`：依物料、位置、儲位、庫存狀態保存明細。
- `inventory_transaction`：所有入庫、領料、退料、調撥、安裝、報廢都要記錄在這裡。

看「可不可以領料」時，不看總庫存，而是看 `stock_status = AVAILABLE` 的中心倉庫數量。

領料、退料、調撥共用 `inventory_document`，單號統一為 `I-民國日期-場站-MAT-流水號`，例如 `I-1150514-D-MAT-001`。不另外建立請購單號，也不分領料單號、退料單號、調撥單號，差異用 `movement_type` 與庫存狀態分類。

## P/C/R/J 工單關係

- `P`：預檢工單，資料在 `work_order` + `pm_work_order`
- `C`：故障排除工單，資料在 `work_order` + `fault_work_order`
- `R`：拆下件維修工單，資料在 `work_order` + `repair_work_order`
- `J`：專案工單，資料在 `work_order` + `project_work_order`

R 工單原則上只處理「壞的拆下件」。裝上件只放 `installed_asset_id` 作履歷參照，不應為裝上件再建立 R 工單。

R 工單主狀態固定為 `待處理`、`維修中`、`已入庫結案`、`已報廢結案`。內修、外修、已送修、已修回、驗收中、合格、退回等細節不要塞進主狀態，而是放在 `repair_work_order.repair_method`、`current_place`、`outsourcing_status`、`acceptance_result`，完整清單見 `repair-workflow-status-design.md`。

工單編號固定使用 `性質-民國日期-場站-對象-流水號`，例如 `C-1150514-D-TS-031`。
拆解後的 `work_order_type`、`work_order_date`、`site_code`、`target_code`、`daily_sequence` 也會存入資料庫，完整規則見 `work-order-numbering.md`。

## 建議執行順序

```sql
\i schema.postgres.sql
\i seed-reference-data.sql
\i seed-repair-workflow-options.sql
\i material-import-tamhai.sql
\i migration-material-master-usage.sql
\i migration-document-sequence-inventory-document.sql
```

如果使用 migration 工具，建議先把 `schema.postgres.sql` 拆成第一支 migration，再把 `seed-reference-data.sql` 放成 seed。

如果資料庫已經跑過舊版 schema，先跑 `migration-inventory-location-status.sql`、`migration-work-order-numbering.sql`、`migration-train-fleet.sql`、`migration-repair-workflow-options.sql` 與 `migration-document-sequence-inventory-document.sql`，再跑 `seed-repair-workflow-options.sql`、`material-import-tamhai.sql` 與 `migration-material-master-usage.sql`。
坑位主檔要上線時，再跑 `migration-vehicle-position-slots.sql`，接著執行 `vehicle-position-import-tamhai.sql` 匯入 `vehicle-position-slots-tamhai.csv`。
設備序號與坑位裝用資料要回收現場盤點後，再跑 `migration-asset-installation-import-staging.sql`，用 `asset-installation-import-stage.sql` 先匯入暫存檢查。
