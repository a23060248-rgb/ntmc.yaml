# P1 Word 範本驗收紀錄

更新日期：2026-07-12

## 不可變來源

- 官方來源：`C:\Users\a2306\Desktop\淡海資料\輕軌列車預防檢修檢查記錄表改(第一級)-4-FM-H110-ERS13001-6_1140826.doc`
- Rehearsal 唯讀副本：`.local-rehearsal/word-templates/p1-official-source-1140826.doc`
- 兩者 SHA256：`84A25CD70781B57488BED25C056CB3133C35001CB9969A2826571B5A29F227CD`
- 官方來源未被修改；所有轉換與輸出只寫入 `.local-rehearsal`。

## 範本盤點

Word COM 盤點結果：

| 項目 | 數量 |
| --- | ---: |
| 頁數 | 8 |
| 表格 | 3 |
| InlineShapes | 13 |
| Shapes | 5 |
| Story ranges | 8 |

動態欄位位於頁首 StoryRange，已建立四個唯一 Bookmark：

| Bookmark | 系統來源 | 轉換 |
| --- | --- | --- |
| `TRAIN_NO` | `trainNo` | 原值 |
| `WORK_ORDER_NO` | `workOrderNo` | `COMPACT_WORK_ORDER_NO`，例如 `P1870210001` |
| `ACTUAL_START_DATE` | `print.startDate` | `ROC_DATE_TEXT` |
| `ACTUAL_FINISH_DATE` | `print.finishDate` | `ROC_DATE_TEXT` |

附件一座椅圖與附件二電磁式軌道煞車量測表保留在原 Word，不由 HTML 重畫。

## 工作副本與逐頁比對

- 工作副本：`.local-rehearsal/word-templates/p1-prepared-1140826.docx`
- 工作副本 SHA256：`9D5C090EC0ECA4EA7DC23B4B2BA30B67A09311EBAACDAE9F4D4E96031AB52736`
- 原始與工作副本皆已輸出 PDF 並以 150 DPI 轉成八頁 PNG。
- 八頁尺寸皆為 `1241 x 1755`。
- 第 2、4、6 頁像素完全一致；其餘頁差異率介於 0.0053% 至 0.0822%。
- 差異來自舊 `.doc` 轉 `.docx` 的文字反鋸齒與一個浮動物件轉 InlineShape；人工逐頁檢查未發現裁切、重疊、圖片遺失、表格變形、頁首頁尾位移或附件位置改變。

證據：

- `.local-rehearsal/word-source-inspection-current.json`
- `.local-rehearsal/word-prepared-inspection-current.json`
- `.local-rehearsal/word-qa/bookmark-layout-diff.json`
- `.local-rehearsal/word-qa/diff-pages/`

## API 實際輸出驗證

已新增 `erp-api/scripts/verify-word-output-rehearsal.js`，流程為：

1. 先確認資料庫名稱包含 `rehearsal`，否則拒絕執行。
2. 透過 `http://127.0.0.1:3001/api` 正式 Session 登入。
3. 註冊 P1 Word 版本與四個 Bookmark mapping。
4. 實際建立 `PRE_WORK` 列印工作並核對下載檔案 SHA256。
5. 以正常 P1 資料完成檢查、兩張附件及一筆用料過帳。
6. 實際建立 `POST_COMPLETION` 列印工作。
7. 重新用 Word COM 檢查兩份輸出的頁數、表格與圖片數量。
8. 驗證 P 單已完工且兩階段列印紀錄皆為 `READY`。

執行命令：

```powershell
cd C:\Users\a2306\Desktop\code\ntmc.yaml\輕軌系統\erp-api
npm.cmd run verify:word-output-rehearsal
```

2026-07-12 已在 rehearsal 資料庫完成實際執行，不是模擬列印：

| 項目 | 結果 |
| --- | --- |
| Rehearsal DB | `ntmc_erp_rehearsal_20260710_233030` |
| P 工單 | `P-1870210-D-TS-001` |
| Word 列印工單號 | `P1870210001` |
| PRE_WORK job | `116b0190-81f4-4b92-b368-c54580bdce65`，`READY` |
| PRE_WORK SHA256 | `9C36CD4B678454CA862E5298B77C56AD9CD92010EBB0CF0DA323203E4DB9BCFB` |
| POST_COMPLETION job | `7789B21F-8CCF-4421-81DB-A26E25839194`，`READY` |
| POST_COMPLETION SHA256 | `ECAF3BDBBB295D1417127A54BF027A5DDA990930F3CEDC9F6F5FCBEA23D0EC59` |
| 文件結構 | 兩份皆 8 頁、3 表格、14 InlineShapes、4 Shapes |
| 完工狀態 | P 工單與 backfill 均為 `COMPLETED`，用料過帳 1 筆 |

第一次實際輸出曾因內部工單號 `P-1870108-D-TS-001` 太長而讓固定頁首換行；該輸出已判定不合格，沒有作為驗收證據。系統現在以 `COMPACT_WORK_ORDER_NO` 轉成原表單固定 11 碼格式，修正後的 r2 輸出頁首不再換行。

修正後逐頁像素比對結果：

- 工作副本對 PRE_WORK：八頁尺寸一致，每頁變更率皆為 `0.4605%`，差異只落在頁首四個動態欄位範圍，本文與兩張附件未改變。
- PRE_WORK 對 POST_COMPLETION：本次 rehearsal 使用相同起訖日，八頁像素完全一致。
- 已人工檢查第 1、7、8 頁：頁首沒有裁切或重疊，座椅圖與煞車附件位置、圖片及表格均保留。

證據：

- `.local-rehearsal/word-qa/word-output-rehearsal-summary.json`
- `.local-rehearsal/word-qa/actual-pre-r2-layout-diff.json`
- `.local-rehearsal/word-qa/actual-pre-post-r2-layout-diff.json`
- `.local-rehearsal/word-qa/actual-pre-r2-pages/`
- `.local-rehearsal/word-qa/actual-post-r2-pages/`

## 尚未完成的 Word 範圍

- 目前四個 Bookmark 只處理頁首的車號、工單號、施工日與完工日。
- 數位回填的檢查明細、座椅 X、六點煞車量測與實際用料尚未寫回完工 Word；目前資料已保存在資料庫，但 POST_COMPLETION 仍只完成頁首套版。
- P2、P3、P4 官方 Word 尚未完成同樣的唯讀副本、欄位 mapping、實際輸出與逐頁比對。
- 因此可以確認「P1 原格式 Word 引擎與兩階段列印」已通過，但不能宣稱「所有完工資料都已套回 Word」或「四級表單全部完成」。
