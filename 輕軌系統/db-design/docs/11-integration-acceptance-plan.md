# 輕軌維修系統整合驗收計畫

更新日期：2026-07-12

## 不可變原則

- Legacy HTML 永遠只讀；基準 SHA256 為 `46647B38352C3B543E7A78FE63B801008D237AF49C88F5E0A2557AF7DBFB2E73`。
- 新功能只進入 `frontend`、`erp-api`、`db-design`。
- 正式資料只經 PostgreSQL API；不使用 localStorage、sessionStorage 或 iframe。
- migration 先在可拋棄資料庫首跑、重跑與回復演練，未經核准不得套正式資料庫。

## 執行批次與關卡

| 批次 | 主要工作 | 完成關卡 |
| --- | --- | --- |
| 0 基準 | 工具版本、Git、Legacy hash、測試環境、固定驗證 | 基準報告產生且 Legacy 未變 |
| 1 整合環境 | 備份、rehearsal DB、migration、seed、health | migration 首跑與重跑成功，正式 DB 未變 |
| 2 主檔 | 模板版本、檢查項目、用料、儀器、WI、Word mapping | 新單取新版，既有單保留舊快照 |
| 3 排程 | 24 個月、24-36 天、鏇削、假日、容量、複核 | 每個應排項目都有日期或複核原因 |
| 4 列印 | P 單草稿、列印前確認、Word 套版、輸出紀錄 | 原始 Word 版面一致且每次列印可追蹤 |
| 5 回填 | 人力、量測、P1 附件、用料、異常決策 | 任一阻擋未清除時不可完工 |
| 6 C/R | P 異常、C 單、拆裝序號、R 單、asset_event | P、C、R、序號、坑位可完整追溯 |
| 7 庫存 | 領退調耗、列鎖、冪等、失敗回滾 | 餘額可由交易重算且一致 |
| 8 權限 | 六角色 UI/API、稽核、403、登入過期 | 前端與 API 權限同時成立 |
| 9 E2E | 正常 P1、座椅 X、煞車異常、拆件、假日、權限 | 六案例全數通過並留測試證據 |
| 10 交付 | 視覺 QA、測試、build、回復手冊、單一 HTML | 人工核准後才排正式維護時段 |

## 固定驗證

每完成一批，依序執行：

1. `erp-api: npm.cmd run check`
2. `erp-api: npm.cmd test`
3. `frontend: npm.cmd test`
4. `frontend: npm.cmd run build`
5. `git diff --check` 與 `git diff --cached --check`
6. 比對 Legacy SHA256
7. 更新 `collab/HANDOFF.md`

可用 `erp-api/scripts/verify-project-baseline.ps1` 一次執行上述固定檢查並在 `.local-rehearsal` 產生基準報告。

## 六條端對端案例

1. 正常 P1：發布排程、建立 P 單、首次列印、全正常回填、耗料、完工、再次列印、後續重排。
2. 座椅 X：保存座椅代碼，未完成報修決策時禁止完工，完成後建立來源 C 單。
3. 煞車異常：六點量測自動判異常，保存標準與實測快照並連結 C 單。
4. 拆件維修：C 單拆下序號件、建立唯一 R 單、外修、驗收、回庫與 asset_event。
5. 臨時假日：從受影響日期整段重排，重新驗證容量、鏇削與 24-36 天。
6. 權限：維修人員不得發布排程；唯讀人員不得呼叫任何異動 API。

## 正式交付阻擋條件

- P1 官方來源、Bookmark 工作副本及實際 PRE/POST API 輸出的 8 頁版面比對已通過；檢查明細、座椅 X、六點煞車量測與實際用料尚未寫回完工 Word。
- P2/P3/P4 官方 Word 的唯讀副本、mapping、實際輸出及逐頁比對尚未完成。
- 1440x900 主要模組已完成 DOM 尺寸與錯誤狀態檢查；390x844 找到並修正預檢月曆整頁水平溢出。最後一次手機截圖、鍵盤操作與 console 複查仍受本機瀏覽器存取限制。
- 正式 migration 尚未由 DBA/系統負責人核准。
- 正式設備別名清單尚未提供；不得匯入範例 CSV 取代核准資料。

## 2026-07-12 已完成關卡

- C 拆件至 R 回庫正向資料庫案例已通過，且重複建立 R 單會被唯一性限制阻擋。
- 正式 Session API、HttpOnly Cookie、過期/撤銷、帳號狀態、鎖定與六角色權限測試已通過。
- 全新 rehearsal DB 完成 migration 首跑、重跑、主要 API、備份與還原比對。
- P1 `PRE_WORK` 與 `POST_COMPLETION` 已由 Word COM 實際輸出，各 8 頁且兩筆列印工作皆為 `READY`；正常 P1 已完成一筆用料過帳並結案。
- 非 Word E2E 再次通過座椅 X、煞車異常、P→C→R、臨時假日重排與六角色 54 組權限。
- 庫存 rehearsal 再次通過冪等、併發鎖定、失敗回滾與餘額重算。
