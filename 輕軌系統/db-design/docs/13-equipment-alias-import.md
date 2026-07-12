# 設備別名正式資料匯入流程

更新日期：2026-07-12

## 定位

`equipment_alias` 將外部故障系統的自由文字設備名稱，對應到本系統的標準設備群組或物料。資料表與 API 已具備，但正式別名資料必須經主檔負責人核准後才能匯入。

`db-design/templates/equipment_alias.csv` 目前只有示範資料，不是正式主檔，不得直接套用正式資料庫。

## CSV 欄位

| 欄位 | 規則 |
| --- | --- |
| `source_system` | 來源系統穩定代碼，例如 `FAULT_C` |
| `alias_name` | 外部系統實際出現的設備名稱 |
| `target_kind` | 只能是 `GROUP` 或 `MATERIAL` |
| `target_code` | `GROUP` 使用 `equipment_group.group_code`；`MATERIAL` 使用 `material.part_no` |
| `note` | 對應依據或核准說明 |

## 核准前驗證

在 `erp-api` 執行：

```powershell
npm run verify:equipment-aliases -- --file ..\db-design\templates\equipment_alias.csv
```

此命令固定使用 rehearsal 安全規則，只讀取資料庫，不新增或更新任何別名。結果會寫到 `.local-rehearsal/equipment-alias-validation-*.json`，內容包含：

- CSV SHA256 與總筆數。
- 重複來源名稱。
- 無效 `target_kind`。
- 找不到的設備群組或料號。
- 對應後標準名稱。
- 預計新增或更新。

只有 `readyToImport=true` 才能送主檔負責人核准。

## 正式匯入關卡

1. 保存核准後 CSV、SHA256、核准人與核准時間。
2. 建立正式資料庫備份。
3. 在 rehearsal 對同一 SHA256 完成驗證與匯入預演。
4. 抽樣確認 C 工單設備名稱能解析成正確標準名稱。
5. 另行取得正式資料庫異動核准後才執行匯入。
6. 匯入後保留驗證報告與稽核紀錄；既有別名只能停用或改對應，不實體刪除。

目前沒有提供可直接寫入正式資料庫的一鍵命令，避免誤把範例 CSV 當成正式資料。
