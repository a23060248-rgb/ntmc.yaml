# 輕軌維修系統 Migration 套用與回復手冊

更新日期：2026-07-13

## 1. 安全原則

1. 正式資料庫未取得明確核准前，不執行任何 migration。
2. migration runner 只能連線到本機 rehearsal 資料庫；資料庫名稱必須符合 `.env.test` 的允許規則。
3. 每次異動前先建立 PostgreSQL custom-format 完整備份，確認檔案大於 0 bytes。
4. SQL 以 `ON_ERROR_STOP=1` 執行，任何一步失敗立即停止。
5. 不修改已登錄 migration；若 schema 需要再調整，必須新增下一支 migration。
6. 不用 down migration 回復正式資料；回復以套用前備份還原到新資料庫為準。
7. Legacy HTML 不參與 migration，也不作正式資料來源。

## 2. 唯一 Migration 來源

| 檔案 | 用途 |
| --- | --- |
| `schema.postgres.sql` | 全新資料庫的基礎 schema，不列入既有資料庫升級 ledger |
| `migration-schema-ledger.sql` | 建立 append-only `schema_migration` 台帳，序號固定為 0 |
| `migration-manifest.json` | 25 支業務 migration 的唯一順序、ID 與驗證 SQL |
| `erp-api/scripts/apply-rehearsal-migrations.js` | 只讀預檢、既有 schema 基準化及缺少 migration 套用工具 |

`migration-manifest.json` 是唯一排序清單。README、人工筆記或檔名排序都不能取代它。

台帳狀態：

- `APPLIED`：由 runner 實際套用並完成驗證。
- `BASELINED`：物件原本已存在，runner 執行該 migration 的 `verifySql` 通過後才登錄。

每筆台帳保存 migration ID、序號、檔名、SHA256、狀態、資料庫、操作者、時間及執行秒數。已登錄檔案若 SHA256 改變，runner 會直接拒絕執行。

## 3. 套用前檢查

先確認 `.env.test` 只指向 rehearsal 資料庫，再於 `erp-api` 執行只讀計畫：

```powershell
Set-Location .\erp-api
npm run migrations:rehearsal
```

不帶參數時只執行 manifest 驗證與 schema 探測，不建立台帳、不套 SQL。輸出會逐筆標示 `PRESENT` 或 `MISSING`。

異動前建立備份：

```powershell
pg_dump $env:REHEARSAL_DATABASE_URL -Fc --no-owner --no-privileges --file .local-rehearsal\before-migration.dump
```

確認備份檔大於 0 bytes，並記錄核心筆數：

```sql
select current_database(), current_user, current_setting('server_version');

select
  (select count(*) from work_order) as work_orders,
  (select count(*) from material) as materials,
  (select count(*) from asset) as assets,
  (select count(*) from inventory_transaction) as inventory_transactions;
```

## 4. Rehearsal 套用方式

已人工確認只讀計畫與備份後，才允許執行：

```powershell
Set-Location .\erp-api
npm run migrations:rehearsal -- --baseline-existing --apply-missing
```

參數用途：

- `--baseline-existing`：驗證已存在物件並登錄為 `BASELINED`。
- `--apply-missing`：依 manifest 順序套用缺少的 migration，驗證成功後登錄為 `APPLIED`。

完成後立刻再執行一次相同命令。第二次應全部顯示 `VERIFY`，不得再次 `APPLY` 或 `BASELINE`。

不得把 runner 指向正式、遠端或名稱不符合 rehearsal 規則的資料庫。安全檢查拒絕時，不得用修改環境變數規則的方式繞過。

## 5. Seed 與匯入

Seed 不列入業務 migration ledger，必須在 25 支 migration 全部完成後，依用途個別執行：

1. 正式參考資料 seed。
2. 主檔、物料與 PM 模板匯入。
3. `seed-pm-p1-attachments.sql`。
4. `seed-rehearsal-integration.sql` 僅限 rehearsal。

`verify-rehearsal-integration.sql` 只做驗證，不是 migration。`import-pm-templates.sql` 在改為版本感知前，不得用於正式模板匯入。

## 6. 套用後驗證

```sql
select sequence_no, migration_id, file_name, migration_status,
       file_sha256, applied_at, database_name
from schema_migration
order by sequence_no;

select migration_status, count(*)
from schema_migration
group by migration_status
order by migration_status;

select to_regclass('public.equipment_alias');
select to_regclass('public.v_equipment_alias');
select to_regclass('public.pm_schedule_item');
select to_regclass('public.form_template');
select to_regclass('public.work_order_print_job');
select to_regclass('public.operation_audit_log');
```

以 rehearsal `DATABASE_URL` 啟動 API，至少驗證：

- `/api/health`
- `/api/health/db`
- `/api/equipment-aliases?limit=2`
- `/api/work-orders/all?limit=2`
- `/api/precheck/schedules?limit=2`
- `/api/inventory/summary?limit=2`
- `/api/turnaround/r-orders?limit=2`
- `/api/master-data/resources?limit=2`
- `/api/reports/maintenance?limit=2`

## 7. 回復演練

1. 停止 rehearsal API。
2. 保留失敗資料庫供查錯，不覆寫來源資料庫。
3. 建立另一個空白 rehearsal 資料庫。
4. 使用同一份 `before-migration.dump` 執行 `pg_restore --exit-on-error`。
5. 比對核心筆數、台帳狀態及抽樣工單、物料、設備、庫存交易。
6. 確認備份可還原後，才算完成回復演練。

正式環境若套用失敗，停止服務並由 DBA 將備份還原到新資料庫，再切換連線；不可直接在失敗庫上反覆人工修表。

## 8. 2026-07-12 Ledger 與設備別名修復紀錄

- 目標資料庫：`localhost:5433/ntmc_erp_rehearsal_20260710_233030`。
- 異動前備份：`.local-rehearsal/before-ledger-equipment-alias-20260712-002232.dump`，1,423,378 bytes。
- 建立 `schema_migration` 並登錄 ledger bootstrap 1 筆。
- 22 支既有 migration 經各自驗證 SQL 通過後登錄為 `BASELINED`。
- `migration-equipment-alias.sql` 原本缺少，已由 runner 套用並登錄為 `APPLIED`。
- 台帳共 24 筆：bootstrap 1 筆、業務 migration 23 筆。
- 第二次執行全部 23 支業務 migration 均為 `VERIFY`，未重複套用。
- `equipment_alias` 與 `v_equipment_alias` 已存在；`/api/equipment-aliases?limit=2` 回傳 200 與空清單。
- 空清單代表尚未匯入正式設備別名，不代表 schema 異常。
- 未操作正式資料庫。

## 9. 2026-07-12 Session Security 與全新 DB 演練

- 新增 `migration-session-security.sql`，manifest 現為 24 支業務 migration。
- 長期 rehearsal ledger 現為 25 筆：bootstrap 1 筆、業務 migration 24 筆。
- 第 24 支 migration 首跑 `APPLY`，第二次執行為 24 筆 `VERIFY`。
- 全新 DB：`ntmc_erp_rehearsal_fresh_20260711171643`。
- 還原 DB：`ntmc_erp_rehearsal_restore_20260711171643`。
- 全新 DB 首跑結果：16 筆 `APPLIED`、9 筆 `BASELINED`；`BASELINED` 代表該結構已包含於目前基礎 schema 且驗證成功。
- 第二次執行：24 支全部 `VERIFY`，0 筆重複套用。
- 備份：`.local-rehearsal/fresh-session-20260711171643.dump`，518,732 bytes。
- 備份還原後 ledger、工單、物料、序號件與庫存交易筆數完全一致。
- health、dashboard、work-orders、precheck、inventory、turnaround、master-data、equipment-alias、reports 與 session login 均回傳 200。
- 正式資料庫未執行任何 migration。

## 10. 2026-07-13 預檢模板維護結構

- 新增 `migration-pm-template-maintenance.sql`，manifest 現為 25 支業務 migration。
- 完整 ledger 應為 26 筆：bootstrap 1 筆、業務 migration 25 筆。
- 新增附件輸出策略、Word 動態區塊 mapping 與 P 工單完整模板快照。
- 只允許在 rehearsal 資料庫先行套用與驗證；正式資料庫仍需人工核准。
- 必填 Word 動態區塊須經實際輸出比對後標記驗證，未驗證版本不可發布。

## 11. 尚待驗證

- 正式 Word 範本路徑與 Word COM 實際輸出仍待驗收。
- 設備別名正式資料需經主檔確認後再匯入，不使用範例 CSV 直接代替正式資料。
