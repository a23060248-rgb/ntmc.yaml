# Migration 320 正式資料相容性驗證

- 執行時間：2026-07-16T00:49:10.508Z
- 來源分類：REHEARSAL_PRE_320_SNAPSHOT
- 來源 dump SHA256：`6C666849134691E543546BE4439C6E52073ABF8F3D74A0FB3D701BCD3E7DE19E`
- 正式唯讀證據：**FAIL / 未提供**
- migration 前 ledger：32 筆，hash `238D10C4ADF9EA142FEAA4D243D65372D781A3757443E64D1067373605A81256`
- migration 後 ledger：33 筆，hash `B86D26AC71914A31DF537E65713559D69B9EA31A27C1148B35CD58DB47073409`
- migration SQL SHA256：`30FC5C272ECF9338EC8334AE0FB858544309D7B3B4DC208365A6A8958C497400`；runner output SHA256：`D8918729757CB10ADDD9C89A8CC29CEA26468EDEC1EBB61DA8002590AF549739`

## 來源與 ledger SQL 證據

```sql
SELECT current_database(),current_user,current_setting('transaction_read_only'),
       rolsuper,rolcreaterole,rolcreatedb,rolcanlogin
  FROM pg_roles WHERE rolname=current_user;

SELECT migration_id,sequence_no,file_name,file_sha256,migration_status,note
  FROM schema_migration ORDER BY sequence_no,migration_id;
```

clone 實際角色回應：

```json
{
  "database_name": "ntmc_erp_rehearsal_m320_before_20260716004856",
  "role_name": "postgres",
  "transaction_read_only": "off",
  "rolsuper": true,
  "rolcreaterole": true,
  "rolcreatedb": true,
  "rolcanlogin": true
}
```

正式來源連線嘗試：`false`。因此無法產生正式 ledger 與關鍵資料 before/after hash，這一項明確 FAIL，不以 rehearsal 角色冒充正式唯讀證據。

## Hash 規則

- 排序：primary key ascending; fallback all selected columns ascending
- NULL：JSON null
- timestamp：UTC ISO-8601
- JSON：object keys recursively sorted; array order preserved
- 業務資料 hash：before `66BF855DDBD19B8BA8E69420EA22AD1CFC21ECB000AE2B16E966E6963BF364C7` / after `66BF855DDBD19B8BA8E69420EA22AD1CFC21ECB000AE2B16E966E6963BF364C7`，PASS
- 關聯 hash：before `93A8FF5ECAC1874612FD4A571F1331C45D2F12C1983655EAE2FE0B98959C6AE6` / after `93A8FF5ECAC1874612FD4A571F1331C45D2F12C1983655EAE2FE0B98959C6AE6`，PASS
- schema hash：before `788737BFAA38EDDA304B24307C85CD6156C9233FF697B1E9AA00FD1D0A4DB643` / after `AFC000D8FA82FCF3C00AC10A479D63B744251F496C4D126D4018C8CA647E11BC`（預期不同）；安全重跑後 `AFC000D8FA82FCF3C00AC10A479D63B744251F496C4D126D4018C8CA647E11BC`，PASS

## 回滾與重跑

- transaction rollback：PASS
- migration failure rollback：schema=true, ledger=true, business=true
- 強制失敗 SQL SHA256：`DA5BC2C35C37C03DCDD8ED5E2C0E4050CB9B20B07CE30848CCDB98695D6E8DF2`；psql status：`3`；錯誤：`COMMENT | COMMENT | psql:C:/Users/a2306/Desktop/code/ntmc.yaml/���y�t��/.local-rehearsal/migration-320-forced-failure-20260716004856.sql:11: NOTICE:  constraint "work_order_version_positive" of relation "work_order" does not exist, skipping | psql:C:/Users/a2306/Desktop/code/ntmc.yaml/���y�t��/.local-rehearsal/migration-320-forced-failure-20260716004856.sql:157: ERROR:  division by zero`
- backup restore：PASS，dump `F98618BBF6126C764682525FCE5BC492DE80C4B198701C1E963F7A233B8A3E01`
- migration 重跑：PASS；重跑 output SHA256 `F599967C3138EB7FDE0693C400F4B903558FABD6107B2A4BABC4A32E99B1B3F7`；LEGACY/event 無新增=true

## LEGACY / 副作用 SQL 與結果

```sql
SELECT count(*) AS total,count(DISTINCT id) AS distinct_ids FROM work_order_event;
SELECT count(*),sum(version),string_agg(id::text||':'||status,',' ORDER BY id) FROM work_order;
SELECT count(*),string_agg(work_order_id::text||':'||COALESCE(deadline_at::text,'NULL')||':'||COALESCE(observe_until::text,'NULL'),',' ORDER BY work_order_id) FROM fault_work_order;
SELECT count(*) FROM operation_audit_log;
SELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%notification%' OR table_name ILIKE '%outbox%';
```

before / after / rerun：

```json
{
  "before": {
    "schemaCapabilities": {
      "hasEventType": false,
      "hasRequestId": false,
      "hasVersion": false
    },
    "events": {
      "total": 0,
      "legacy": 0,
      "workflow": 0,
      "distinct_ids": 0,
      "request_ids": 0
    },
    "workOrders": {
      "work_orders": 0,
      "version_sum": "0",
      "status_hash": "-6939563903564495251"
    },
    "auditRows": 1,
    "sla": {
      "rows": 0,
      "hash": "-6939563903564495251"
    },
    "notificationOrOutboxTables": []
  },
  "after": {
    "schemaCapabilities": {
      "hasEventType": true,
      "hasRequestId": true,
      "hasVersion": true
    },
    "events": {
      "total": 0,
      "legacy": 0,
      "workflow": 0,
      "distinct_ids": 0,
      "request_ids": 0
    },
    "workOrders": {
      "work_orders": 0,
      "version_sum": "0",
      "status_hash": "-6939563903564495251"
    },
    "auditRows": 1,
    "sla": {
      "rows": 0,
      "hash": "-6939563903564495251"
    },
    "notificationOrOutboxTables": []
  },
  "rerun": {
    "schemaCapabilities": {
      "hasEventType": true,
      "hasRequestId": true,
      "hasVersion": true
    },
    "events": {
      "total": 0,
      "legacy": 0,
      "workflow": 0,
      "distinct_ids": 0,
      "request_ids": 0
    },
    "workOrders": {
      "work_orders": 0,
      "version_sum": "0",
      "status_hash": "-6939563903564495251"
    },
    "auditRows": 1,
    "sla": {
      "rows": 0,
      "hash": "-6939563903564495251"
    },
    "notificationOrOutboxTables": []
  },
  "initialSideEffectsSafe": true
}
```

## 異常

- 既有異常：2
- migration 新增異常：0
- 詳細清單：[migration-320-data-anomalies.csv](./migration-320-data-anomalies.csv)

## 限制

本機沒有去識別化正式資料副本的來源證明，也沒有正式唯讀角色與正式 ledger 前後 hash；本次只能證明 rehearsal pre-320 snapshot 的技術相容性。
