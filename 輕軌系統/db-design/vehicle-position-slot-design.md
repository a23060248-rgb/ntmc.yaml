# 坑位主檔設計

來源附件：`C:\Users\a2306\Desktop\淡海資料\周轉建0304.xlsx`

本文件先固定「坑位」的資料定義。坑位不是設備本身，而是設備安裝的位置；設備序號、料號、履歷要另外連到坑位。

## 核心定義

坑位代表：

```text
某場站 / 某系統 / 某列車 / 某車廂模組 / 某設備安裝位置
```

例如：

```text
50-D-TS101-M1-BCU-AIO
```

可拆成：

| 區段 | 定義 |
| --- | --- |
| `50` | 車輛物料系統碼，輕軌電聯車 |
| `D` | 場站，淡海 |
| `TS101` | 列車 101 |
| `M1` | 車廂/模組 |
| `BCU-AIO` | BCU 總成底下的 AIO 板坑位 |

## 坑位與設備的關係

| 名稱 | 代表 |
| --- | --- |
| 坑位 `vehicle_position` | 固定位置，例如 `50-D-TS101-M1-BCU-AIO` |
| 設備個體 `asset` | 真的那一顆設備，有序號、批號、狀態 |
| 履歷 `asset_event` | 記錄這顆設備何時上線、下線、送修、回庫、報廢 |

因此：

```text
坑位不會移動，設備會移動。
```

設備從車上下來時，坑位仍存在，只是 `current_asset_id` 改成空或換成備品。

## 設備屬性

附件中的設備屬性建議轉成以下代碼：

| Excel 顯示 | 系統代碼 | 是否可裝設備 | 定義 |
| --- | --- | --- | --- |
| 🟨 分類 | `CATEGORY` | 否 | 只作分組，例如車載通訊系統、煞車系統 |
| ⬜ 獨立件 | `INDEPENDENT` | 是 | 可單獨追蹤的設備 |
| 🟩 總成 | `ASSEMBLY` | 是 | 可裝在坑位上的總成，也可能有子件 |
| 🟦 子件 | `COMPONENT` | 是 | 總成底下的可追蹤子件 |
| 車廂/模組節點 | `MODULE` | 否 | 例如 `50-D-TS101-M1`，作為上層節點 |

## 階層關係

附件已經有 `Parent_ID`，應直接保留。

範例：

```text
50-D-TS101-M1-BCU
└─ 50-D-TS101-M1-BCU-AIO
└─ 50-D-TS101-M1-BCU-CIB
└─ 50-D-TS101-M1-BCU-CPU
```

設計上要先建立車廂/模組節點：

```text
50-D-TS101-M1
50-D-TS101-M2
50-D-TS101-M3
50-D-TS101-M4
50-D-TS101-M5
```

再把附件的坑位掛到對應父節點。

## 已整理的來源檔

已先把附件第二張工作表整理成：

```text
db-design/vehicle-position-slots-tamhai-ts101.csv
```

整理結果：

| 類型 | 筆數 |
| --- | ---: |
| `CATEGORY` | 34 |
| `INDEPENDENT` | 61 |
| `ASSEMBLY` | 25 |
| `COMPONENT` | 99 |
| 合計 | 219 |

已依目前建議修正下列資料：

| 來源列 | 模組 | 名稱 | Location_ID | 問題 |
| --- | --- | --- | --- | --- |
| 51 | M1 | 煞車電阻器(含箱體) | `50-D-TS101-M1-BRES` | Parent_ID 已補為 `50-D-TS101-M1` |

另外也修正 M4 客室空調總成的 Parent_ID：

| 項目 | 修正 |
| --- | --- |
| `PAC/R1-COMP`、`PAC/R1-CTRL` | Parent_ID 改為 `50-D-TS101-M4-PAC/R1` |
| `PAC/L2-COMP`、`PAC/L2-CTRL` | Parent_ID 改為 `50-D-TS101-M4-PAC/L2` |

## 淡海 18 台展開檔

已依車隊主檔展開淡海 18 台：

```text
db-design/vehicle-position-slots-tamhai.csv
```

展開車號：

```text
101-115、117、118、119
```

展開結果：

| 類型 | 筆數 |
| --- | ---: |
| `MODULE` | 90 |
| `INDEPENDENT` | 1098 |
| `ASSEMBLY` | 450 |
| `COMPONENT` | 1782 |
| 合計 | 3420 |

檢查結果：

| 檢查項目 | 結果 |
| --- | --- |
| 每台車坑位節點 | 190 筆 |
| Location_ID 重複 | 0 |
| Parent_ID 找不到上層 | 0 |
| NeedsReview | 0 |

`CATEGORY` 分類列保留在 `TS101` 模板中作閱讀分組，正式匯入 `vehicle_position` 時不匯入，因為分類不是可安裝設備的實體坑位。

## 資料表欄位

坑位主檔使用 `vehicle_position`：

| 欄位 | 用途 |
| --- | --- |
| `position_code` | Location_ID |
| `parent_position_code` | Parent_ID 原始文字 |
| `parent_position_id` | 匯入後解析出的上層坑位 |
| `site_code` | `D` 淡海、`K` 安坑 |
| `target_code` | `TS` 列車 |
| `train_set_no` | 例如 `101` |
| `module_no` | 例如 `M1`、`M2` |
| `position_name` | 設備/坑位名稱 |
| `position_type` | `MODULE`、`CATEGORY`、`INDEPENDENT`、`ASSEMBLY`、`COMPONENT` |
| `is_installable` | 是否可安裝設備 |
| `current_asset_id` | 目前裝在這個坑位的設備 |

## 下一步

1. 用 `migration-vehicle-position-slots.sql` 補齊資料庫欄位。
2. 用 `vehicle-position-import-tamhai.sql` 匯入 `vehicle-position-slots-tamhai.csv`。
3. 開始整理「設備序號 asset」清單。
4. 建立設備序號與 `current_asset_id` 的目前裝用關係。
5. 安坑列車為 `TS201` 到 `TS212`；若坑位結構與淡海相同，才用同一模板改成 `50-K-TS201-...` 展開。
