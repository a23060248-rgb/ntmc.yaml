# API 資料契約草案

## 原則

API 不應直接照畫面欄位命名，而應對應資料庫責任。

前台、後台都透過 API 存取同一套資料：

```text
前台 / 後台
  ↓
API
  ↓
PostgreSQL
```

## 共用格式

列表 API 建議支援：

| 參數 | 說明 |
| --- | --- |
| `q` | 關鍵字搜尋。 |
| `page` | 頁碼。 |
| `pageSize` | 每頁筆數。 |
| `sort` | 排序欄位。 |
| `status` | 狀態篩選。 |

回傳格式：

```json
{
  "items": [],
  "page": 1,
  "pageSize": 50,
  "total": 0
}
```

## 物料 API

### `GET /api/materials`

用途：物料清單。

建議回傳：

```json
{
  "id": "uuid",
  "partNo": "50.88.0004.LO",
  "materialName": "R134快速接頭",
  "spec": "適用於填充R134冷媒",
  "unit": "ST",
  "systemCode": "50",
  "categoryCode": "88",
  "categoryName": "電聯車特殊設備空調類",
  "typeCode": "LO",
  "repairable": false,
  "isSerialized": false,
  "reorderPoint": 0,
  "availableQty": 0,
  "issuedQty": 0,
  "stockAdvice": "需請購"
}
```

來源可用 `material` + `v_material_stock_summary`。

### `GET /api/materials/:id`

用途：單筆物料詳情。

應包含：

| 區塊 | 來源 |
| --- | --- |
| 基本資料 | `material` |
| 庫存摘要 | `v_material_stock_summary` |
| 庫存分布 | `v_material_location_balance` |
| 用量趨勢 | `material_usage_history` |
| 序號設備 | `asset` |

## 庫存異動 API

### `GET /api/inventory-documents`

用途：查詢領料、退料、調撥單。

篩選：

| 參數 | 說明 |
| --- | --- |
| `movementType` | `ISSUE`、`RETURN`、`TRANSFER` |
| `status` | `DRAFT`、`CHECKING`、`APPROVED`、`APPLIED`、`CANCELLED` |
| `siteCode` | `D`、`K` |

### `POST /api/inventory-documents`

用途：建立庫存異動單。

範例：

```json
{
  "movementType": "ISSUE",
  "documentDate": "2026-05-14",
  "siteCode": "D",
  "sourceWarehouseCode": "TH-CENTER",
  "destinationWarehouseCode": "TH-SUB",
  "lines": [
    {
      "partNo": "50.88.0004.LO",
      "qty": 1,
      "fromStockStatus": "AVAILABLE",
      "toStockStatus": "ISSUED"
    }
  ]
}
```

API 建立時應呼叫：

```sql
next_document_no('I', document_date, site_code, 'MAT')
```

### `POST /api/inventory-documents/:id/apply`

用途：過帳。

過帳後：

1. 更新 `inventory_document.document_status = APPLIED`
2. 寫入 `inventory_transaction`
3. 更新 `inventory_balance`
4. 更新 `inventory_bin_balance`

## 設備與坑位 API

### `GET /api/assets`

用途：設備序號/周轉件清單。

來源：`asset` + `material` + `equipment_group` + `vehicle_position`

### `GET /api/assets/:id/events`

用途：設備履歷。

來源：`asset_event`

### `GET /api/vehicle-positions`

用途：坑位清單。

常用篩選：

| 參數 | 說明 |
| --- | --- |
| `siteCode` | D/K |
| `trainNo` | 車號 |
| `moduleNo` | M1/M2/M3/M4/M5 |
| `positionType` | INDEPENDENT、ASSEMBLY、COMPONENT |

## 工單 API

### `GET /api/work-orders`

篩選：

| 參數 | 說明 |
| --- | --- |
| `type` | P/C/R/J |
| `status` | 工單狀態 |
| `trainNo` | 車號 |
| `siteCode` | D/K |

### `POST /api/work-orders/fault`

用途：建立 C 故檢工單。

應寫入：

| 資料表 | 說明 |
| --- | --- |
| `work_order` | 工單主檔。 |
| `fault_work_order` | 故障明細。 |
| `asset_event` | 若有拆裝，寫入下線/上線事件。 |

### `POST /api/work-orders/repair`

用途：由 C 工單建立 R 維修工單。

應寫入：

| 資料表 | 說明 |
| --- | --- |
| `work_order` | R 工單主檔。 |
| `repair_work_order` | R 維修明細。 |
| `asset_event` | 下線待判定或送修等事件。 |

### `PATCH /api/repair-work-orders/:id`

用途：更新 R 維修狀態。

可更新：

| 欄位 | 說明 |
| --- | --- |
| `status` | R 主狀態。 |
| `repairMethod` | 待判定、內修、外修、報廢。 |
| `currentPlace` | 目前位置。 |
| `outsourcingStatus` | 外修狀態。 |
| `acceptanceResult` | 驗收結果。 |
| `nextAction` | 下一步。 |

狀態改變時，API 應視情況同步新增 `asset_event`。

## 報表 API

### `GET /api/reports/material-stock-summary`

來源：`v_material_stock_summary`

### `GET /api/reports/material-location-balance`

來源：`v_material_location_balance`

### `GET /api/reports/open-repair-work-orders`

來源：`v_open_repair_work_orders`

### `GET /api/reports/asset-current-status`

來源：`v_asset_current_status`

## 後台清單 API

### `GET /api/workflow-options`

用途：取得流程選項。

篩選：

```text
optionGroup=R_STATUS
```

### `PATCH /api/workflow-options/:group/:code`

用途：停用、改排序、改顯示名稱。

正式系統建議只允許後台管理者操作。
