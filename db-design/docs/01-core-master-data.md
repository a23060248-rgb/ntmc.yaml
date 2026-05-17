# 主檔設計

## 目的

主檔是 ERP 的共用字典。工單、庫存、設備、維修、報表都應引用主檔，不應在各畫面重複維護同一份名稱。

## 人員與廠商

| 資料表 | 用途 | 重點 |
| --- | --- | --- |
| `app_user` | 系統人員主檔 | 經手人、建立人、審核人、保管人都可引用。 |
| `vendor` | 廠商主檔 | 外修廠商、採購供應商共用。 |

`app_user` 目前先保存人員基本資料。後續若要做正式權限，再補角色、權限與簽核表。

## 車隊主檔

| 資料表 | 用途 |
| --- | --- |
| `train` | 車號主檔，保存淡海與安坑列車。 |

目前定義：

| 場站 | 車號 |
| --- | --- |
| 淡海 `D` | 101-115、117(215)、118(214)、119(213) |
| 安坑 `K` | 201-212 |

重要欄位：

| 欄位 | 說明 |
| --- | --- |
| `train_no` | 車號。 |
| `site_code` | `D` 淡海、`K` 安坑。 |
| `former_train_no` | 原車號或對應車號。 |
| `display_order` | 排序用。 |

## 倉庫與儲位

| 資料表 | 用途 |
| --- | --- |
| `warehouse` | 庫存位置主檔。中心倉庫、分存站、現場、車上、個人保管都算位置。 |
| `warehouse_bin` | 倉庫內儲位。 |

`warehouse.location_type`：

| 值 | 說明 |
| --- | --- |
| `CENTER_WAREHOUSE` | 中心倉庫，通常代表未領料、可發料。 |
| `SUB_STATION` | 分存站，通常代表已領料後保管。 |
| `FIELD` | 現場。 |
| `VEHICLE` | 車上。 |
| `PERSON` | 個人保管。 |
| `VENDOR` | 廠商。 |
| `SCRAP` | 報廢位置。 |
| `OTHER` | 其他。 |

核心規則：

```text
看能不能領料，看中心倉庫 AVAILABLE。
看總持有量，才加總所有位置與狀態。
```

## 流程選項

| 資料表 | 用途 |
| --- | --- |
| `workflow_option` | 下拉選項與流程狀態共用表。 |

目前主要群組：

| option_group | 用途 |
| --- | --- |
| `R_STATUS` | R 工單主狀態。 |
| `REPAIR_METHOD` | 維修方式：待判定、內修、外修、報廢。 |
| `REPAIR_PLACE` | 維修位置。 |
| `OUTSOURCING_STATUS` | 外修狀態。 |
| `ACCEPTANCE_RESULT` | 驗收結果。 |
| `REPAIR_NEXT_ACTION` | 下一步建議。 |
| `REPAIR_QUEUE` | 看板分組。 |
| `R_RISK_TAG` | 風險標籤。 |

## 單號流水

| 資料表 / 函式 | 用途 |
| --- | --- |
| `document_sequence` | 控制每日流水號。 |
| `next_document_no()` | 產生工單或庫存異動單號。 |

格式：

```text
文件類型-民國日期-場站-對象-流水號
```

範例：

```text
C-1150514-D-TS-031
I-1150514-D-MAT-001
```

## 物料主檔

| 資料表 | 用途 |
| --- | --- |
| `material` | 物料料號、名稱、規格、單位與請購點。 |

料號拆解：

| 欄位 | 說明 |
| --- | --- |
| `part_no` | 完整料號，例如 `50.88.0004.LO`。 |
| `system_code` | 系統碼，例如 `50`、`95`、`96`。 |
| `category_code` | 類別碼。 |
| `category_name` | 類別名稱。 |
| `sequence_no` | 流水號。 |
| `type_code` | 型式碼。 |

安全庫存先統一使用：

```text
material.reorder_point
```

## 設備與坑位主檔

| 資料表 | 用途 |
| --- | --- |
| `equipment_group` | 設備類型，例如 DCU、EHU、BCU。 |
| `asset` | 有序號設備或周轉件個體。 |
| `vehicle_position` | 坑位，代表設備裝在哪裡。 |

分工：

| 概念 | 資料表 |
| --- | --- |
| 這個料是什麼 | `material` |
| 這一顆實體設備是誰 | `asset` |
| 它裝在哪裡 | `vehicle_position` |
| 它曾經去哪裡 | `asset_event` |

## 儀器與 WI

| 資料表 | 用途 |
| --- | --- |
| `instrument` | 儀器主檔，保存儀器編號、位置、校驗到期日與狀態。 |
| `wi_document` | WI 文件主檔。 |

儀器可以有料號，但不要只放在 `material`。`material` 保存料號與規格，`instrument` 保存實體儀器的校驗、保管與使用狀態。
