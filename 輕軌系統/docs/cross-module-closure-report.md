# Migration 320 跨模組閉環驗證

- E2E fixture：`C:\Users\a2306\Desktop\code\ntmc.yaml\輕軌系統\db-design\seed-rehearsal-integration.sql`
- fixture SHA256：`FAEE6AB66B5F1217812EF9F58F5FE5A53AF2D2A02A437057C55BF9159C7F1D6F`；psql output SHA256：`3445A18537D3AA736A817B26121D5B6C97D96139B1A6011FE9BE7B56E24F310B`

## API response 證據

- `/api/health`：HTTP 200，response hash `0385FD9863D9D5F3E0411B4A8B80CF579F991072AB2F174046A61B200DE402C6`
- `/api/health/db`：HTTP 200，response hash `E3E47A34A349AFDB8964FBDE375B75A161D45866F9C0BAAAAFCD019B88D82B96`
- `/api/work-orders/all?limit=2`：HTTP 200，response hash `6F237C740CBAAAC3FC8E75A71FAC044EB674009DDD39AFF1952873D8C5BB0ACA`

## P 異常 → C

- 來源 P 工單：PASS
- 檢查細項：PASS
- 異常實際值：FAIL
- 判定標準：PASS
- C 工單附件快照：FAIL

SQL：

```sql
SELECT p.work_order_no AS p_order,c.work_order_no AS c_order,
               f.source_pm_work_order_id,f.source_check_section,f.source_check_item,
               cr.result_value,ci.standard_value,ci.min_value,ci.max_value,ci.unit,
               (SELECT count(*)::int FROM work_order_attachment wa WHERE wa.work_order_id=c.id) AS c_attachment_count,
               (SELECT count(*)::int FROM pm_work_order_attachment_result ar WHERE ar.work_order_id=p.id) AS p_attachment_result_count
         FROM work_order c
         JOIN fault_work_order f ON f.work_order_id=c.id
         JOIN work_order p ON p.id=f.source_pm_work_order_id
          LEFT JOIN pm_work_order_check_result cr ON cr.linked_fault_work_order_id=c.id
          LEFT JOIN pm_template_check_item ci ON ci.id=cr.check_item_id
         WHERE c.work_order_no=$1
```

查詢參數：`C-2690110-D-TS-001`

查詢列：

```json
{
  "p_order": "P-2690110-D-TS-001",
  "c_order": "C-2690110-D-TS-001",
  "source_pm_work_order_id": "fe8c40e9-a694-4ca7-a01e-6d799b966891",
  "source_check_section": "車體配件",
  "source_check_item": "P1-R003",
  "result_value": null,
  "standard_value": "正常",
  "min_value": null,
  "max_value": null,
  "unit": null,
  "c_attachment_count": 0,
  "p_attachment_result_count": 68
}
```

## C → 多 R

- 拆件事件、序號、asset_event 與 R 關聯：PASS
- E2E output hash：`5E1C39A709FAA54C5050E24BB61DFD00CEFFC6CB9A9942C8530B2160574D1FFB`
SQL：

```sql
SELECT count(*)::int AS r_orders,
               count(DISTINCT r.source_disassembly_event_id)::int AS disassembly_events,
               count(DISTINCT r.removed_asset_id)::int AS removed_assets,
               count(DISTINCT ae.id)::int AS asset_events
         FROM repair_work_order r
          JOIN work_order c ON c.id=r.source_fault_work_order_id
          LEFT JOIN asset_event ae ON ae.id=r.source_disassembly_event_id
         WHERE c.work_order_no=$1
```

查詢列：`{"r_orders":1,"disassembly_events":1,"removed_assets":1,"asset_events":1}`

E2E response：

```json
{
  "ok": true,
  "pOrderNo": "P-2690110-D-TS-001",
  "cOrderNo": "C-2690110-D-TS-001",
  "rOrderNo": "R-1150716-D-TS-001",
  "duplicateStatus": 409,
  "sourceCheck": "車體配件 / P1-R003",
  "removedEvents": 4,
  "installedEvents": 1,
  "currentPositionAsset": "REH-ASSET-SPARE-001",
  "removedAssetLocation": "REH-CENTER",
  "simulatedPreWorkPrint": true
}
```

## 庫存與缺料

- 庫存失敗交易回滾：PASS
- 餘額與交易重算：PASS
- C 缺料紀錄與庫存交易直接關聯：FAIL
- inventory verifier output hash：`855C4C858A0412D0059ED22E83786361F22E0BE96254EFD99FA2FD17BFC4C95D`
SQL：

```sql
SELECT count(*)::int AS linked
          FROM fault_work_order_shortage s
          JOIN inventory_transaction i ON i.work_order_id=s.work_order_id;
SELECT count(*)::int AS rows FROM operation_audit_log
        WHERE request_id LIKE 'PHASE7:%' OR action_code ILIKE '%INVENTORY%';
```

E2E response：

```json
{
  "ok": true,
  "missingKeyStatus": 400,
  "concurrentStatuses": [
    409,
    201
  ],
  "duplicateStatuses": [
    201,
    200
  ],
  "mismatchStatus": 409,
  "transferStatuses": [
    201,
    200
  ],
  "rollbackStatus": 409,
  "finalBalances": {
    "REH-CENTER:AVAILABLE": 97,
    "REH-REPAIR:ISSUED": 6
  },
  "recalculated": {
    "REH-CENTER:AVAILABLE": 97,
    "REH-REPAIR:ISSUED": 6
  },
  "transactions": [
    {
      "transaction_type": "CONSUME",
      "count": 2
    },
    {
      "transaction_type": "TRANSFER_IN",
      "count": 1
    },
    {
      "transaction_type": "TRANSFER_OUT",
      "count": 1
    }
  ]
}
```
