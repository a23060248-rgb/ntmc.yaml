# Wave 1 物料主檔 Dry-run 結果

執行日期：2026-07-15（Asia/Taipei）

## 1. 執行範圍

- 來源：`db-design/物料基礎檔_現有1147筆.xlsx`
- 工作表：`物料匯入`
- 來源 SHA256：`387B23494318575E2A70A67B83D46BDE24AE79E7305752C8CCF111693CBB3D1E`
- Rehearsal DB：`ntmc_erp_rehearsal_fresh_20260714180902`（PostgreSQL 5433）
- 暫存批次：`WAVE1-MATERIAL-387B23494318575E`
- 暫存狀態：`VALIDATED`
- 來源權責：`UNAPPROVED_SOURCE_REVIEW`

本次只將 Excel 資料寫入 `master_data_import_batch` 與
`master_data_import_row`，沒有新增或更新正式 `material` 主檔。

## 2. 結果摘要

| 項目 | 筆數 |
| --- | ---: |
| Excel 資料列 | 1,147 |
| VALID | 950 |
| WARNING | 189 |
| INVALID / REJECT | 8 |
| 建議 INSERT | 0 |
| 建議 UPDATE | 1,136 |
| 建議 NO_CHANGE | 3 |
| 已套用正式主檔 | 0 |

大量 `UPDATE` 建議主要是現有 1,150 筆物料主檔尚未填入已拆解的
`system_code`、`category_code`、`sequence_no`、`type_code` 與
`category_name`。這不代表已核准覆寫，仍須先確認來源權責與警告列。

## 3. 資料品質問題

### 阻擋項目：8 筆

下列類別碼未出現在來源 Excel 自己的 `類別碼表`，因此保留於暫存區並標示
`REJECT`，不可自動套用：

| Excel 列 | 料號 | 物料名稱 | 原因 |
| ---: | --- | --- | --- |
| 246 | `50.EV.0002.AM` | 偵測車輛用攝影機 | 類別 `50/EV` 不存在 |
| 247 | `50.EV.0003.MW` | DC to DC變壓器 | 類別 `50/EV` 不存在 |
| 1132 | `96.56.0001.GA` | 皮帶張力計 | 類別 `96/56` 不存在 |
| 1133 | `96.56.0002.JT` | 皮帶張力計 | 類別 `96/56` 不存在 |
| 1134 | `96.57.0001.KT` | 14x18單刻度雙向更換式扭力扳手 | 類別 `96/57` 不存在 |
| 1135 | `96.58.0001.KT` | 9x12單刻度雙向更換式扭力扳手 | 類別 `96/58` 不存在 |
| 1136 | `96.59.0001.KT` | 1/4" DR. 扭力起子 | 類別 `96/59` 不存在 |
| 1137 | `96.60.0001.BE` | 行李秤 | 類別 `96/60` 不存在 |

### 警告項目：189 筆

- 129 筆：類別碼表的類別名稱為損壞字串 `[object Object]`。Dry-run 不採用該值，暫保留物料列原本的類別名稱。
- 60 筆：單位未出現在 `單位表`。分布為 `CN` 28、`PL` 13、`PR` 7、`台` 3、`DR` 2、`CL` 2、`CO` 2、`BG` 1、`BL` 1、`PG` 1。

## 4. 不變性與可重跑驗證

- 暫存批次重跑會先清除同批舊列再重建，不會累加重複列。
- 重跑後批次仍為 1,147 列，其中 8 列 `INVALID`。
- `material` 主檔執行前後皆為 1,150 筆。
- `material` 主檔執行前後 SHA256 均為
  `48F453E81944C5DAB4389C5A632BA5DEB519BCE971FF75631842B4512D59FFE7`。
- PostgreSQL 5432 `testdb` 未執行任何寫入。

完整逐列報告位於忽略版控的 rehearsal 證據目錄：

- `.local-rehearsal/material-dry-run-387B23494318575E.json`
- `.local-rehearsal/material-dry-run-387B23494318575E.csv`

## 5. 套用前必要決策

1. 指定這份 Excel 的資料 owner 與核准人。
2. 補齊或確認 8 個缺少的系統／類別組合。
3. 修正類別碼表中 129 筆 `[object Object]` 名稱。
4. 確認 60 筆來源單位是否應加入單位主檔或轉換成既有代碼。
5. 審閱 1,136 筆欄位差異後，才能將批次狀態改為 `APPROVED`。
6. 另行建立 idempotent canonical upsert；本批不包含正式套用功能。

警告與拒絕列已進一步彙整成 26 組待決策項目，詳見
`docs/22-wave1-material-review-queue-result.md`。所有項目目前仍為 `PENDING`，且不允許自動套用。
