# 從目前 HTML 搬到資料庫的對應方式

目前 `預檢工單系統_物料表調整版.html` 是單檔前端預覽，資料都寫在 JavaScript 常數或後段 DOM patch 裡。搬資料庫時建議分批，不要一次把所有畫面欄位都塞進一張表。

## 第一階段：主檔先搬

| HTML 內資料 | 目標資料表 | 備註 |
| --- | --- | --- |
| `people` | `app_user` | 先放姓名、部門、角色 |
| `cars` / `ehuFleetTrains` | `train` | 統一車號格式，例如 `101車` |
| `instrumentMaster` | `instrument` | 儀器編號是唯一鍵 |
| `wiMaster` | `wi_document` | WI 編號是唯一鍵 |
| `materialMaster` / `materialSheetRows` | `material` | 料號 `part_no` 是唯一鍵 |
| `defaultTurnRoundEquipmentGroups` | `equipment_group` | 設備群組、系統別、備品水位 |
| 產生出的車上坑位 | `vehicle_position` | 由車號 x 設備群組 positions 展開 |

## 第二階段：模板與預檢工單

| HTML 內資料 | 目標資料表 | 備註 |
| --- | --- | --- |
| `pmTemplates` | `pm_template` | P1/P2/P3/P4 |
| `defaultPmMaterialMap` | `pm_template_material` | 每個 P 等級預設用料 |
| `defaultPmInstrumentMap` | `pm_template_instrument` | 每個 P 等級預設儀器 |
| `defaultPmWiMap` | `pm_template_wi` | 每個 P 等級預設 WI |
| `form` | `work_order` + `pm_work_order` | 表單快照放 `pm_work_order.form_snapshot` |

## 第三階段：周轉件與序號

| HTML 內資料 | 目標資料表 | 備註 |
| --- | --- | --- |
| `turnRoundAssets` | `asset` | 每一顆有序號設備一列 |
| `initialTurnRoundAssetMasters` | `asset` | 大量產生的周轉件個體 |
| `defaultMaterialSerialItems` | `asset` | 如果屬於可追蹤序號，納入 asset |
| `turnRoundHistory` | `asset_event` | 每筆歷史事件一列 |

## 第四階段：C 工單與 R 工單

目前後段 `codex-rwork-v8-script` 裡的 `orders` 是 R 工單預覽資料。

建議搬法：

| v8 欄位 | 目標資料表 / 欄位 |
| --- | --- |
| `rOrderNo` | `work_order.work_order_no` |
| `sourceFaultOrder` | `work_order.source_work_order_id`，先用單號查 C 工單 |
| `sourceFaultCategory` | `fault_work_order.fault_category` 或 R 的來源快照 |
| `mainSystem` | `repair_work_order.main_system` |
| `faultComponent` | `repair_work_order.fault_component` |
| `faultSubComponent` | `repair_work_order.fault_sub_component` |
| `removedEquipmentId` | `repair_work_order.removed_asset_id` |
| `installedEquipmentId` | `repair_work_order.installed_asset_id`，只作履歷參照 |
| `originalLocation` | `repair_work_order.original_location_text` |
| `rStatus` | `work_order.status` |
| `repairMethod` | `repair_work_order.repair_method` |
| `currentPlace` | `repair_work_order.current_place` |
| `outsourcingStatus` | `repair_work_order.outsourcing_status` |
| `procurementAcceptanceResult` | `repair_work_order.acceptance_result` |
| `riskTags` | `repair_work_order.risk_tags` |
| `timeline` | `asset_event` |

R 工單選項不要寫死在前端。正式系統請從 `workflow_option` 取值：

| 選項群組 | 對應欄位 |
| --- | --- |
| `R_STATUS` | `work_order.status`，限 R 工單使用 |
| `REPAIR_METHOD` | `repair_work_order.repair_method` |
| `REPAIR_PLACE` | `repair_work_order.current_place` |
| `OUTSOURCING_STATUS` | `repair_work_order.outsourcing_status` |
| `ACCEPTANCE_RESULT` | `repair_work_order.acceptance_result` |
| `REPAIR_NEXT_ACTION` | `repair_work_order.next_action` |
| `R_RISK_TAG` | `repair_work_order.risk_tags` |

## 狀態同步規則

當 R 工單更新 `repair_method` 時，資料庫應同步建立事件：

| repair_method | asset.current_status | asset_event.event_type |
| --- | --- | --- |
| 待判定 | 待修 | 下線待判定 |
| 內修 | 檢修中 | 內修 |
| 外修 | 送修中 | 送修 |
| 報廢 | 報廢申請 或 已報廢 | 報廢 |

畫面可以改 `work_order.status` 和 `repair_work_order`，但周轉件履歷一定要靠 `asset_event` 留軌跡。

## 建議 API 切分

- `GET /api/work-orders?type=P`
- `POST /api/work-orders/pm`
- `POST /api/work-orders/fault`
- `POST /api/work-orders/repair`
- `PATCH /api/repair-work-orders/:id`
- `GET /api/materials`
- `GET /api/assets/:id/events`
- `POST /api/assets/:id/events`
- `GET /api/reports/open-r-work-orders`
- `GET /api/reports/material-stock-summary`

前端可以先維持現在畫面，逐步把硬編資料改成 API 回傳。
