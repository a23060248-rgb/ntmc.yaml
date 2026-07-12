# 輕軌維修系統全檔案完整性稽核

- 稽核日期：2026-07-11（Asia/Taipei）
- 正式根目錄：`C:\Users\a2306\Desktop\code\ntmc.yaml\輕軌系統`
- Git 根目錄：`C:\Users\a2306\Desktop\code\ntmc.yaml`
- 稽核原則：只讀業務檔案；僅新增本報告、清冊及 `.local-rehearsal` 稽核輸出；未套用正式資料庫 migration。
- 完整清冊：[`file-integrity-manifest.csv`](./file-integrity-manifest.csv)

## 1. 結論

搬移本身沒有遺失原本 Git 追蹤的 `db-design` 或 `erp-api` 檔案，所有專案文字檔均可讀取，JavaScript、API 測試、前端測試、非 Word 端對端驗收與單一 HTML build 皆通過。Legacy HTML SHA256 也未改變。

### 2026-07-12 後續修復

本報告原先發現的 migration ledger 與設備別名 schema 問題已完成修復：

- 新增 `migration-schema-ledger.sql`、`migration-manifest.json` 與 rehearsal migration runner。
- 22 支既有 migration 已驗證後基準化，缺少的 `migration-equipment-alias.sql` 已套用到 rehearsal。
- `schema_migration` 共 24 筆，第二次執行全部為驗證，不會重複套用。
- `/api/equipment-aliases?limit=2` 已由 500 改為 200；目前為 0 筆，待匯入正式別名主檔。
- 正式資料庫仍未套用任何 migration。
- 修復後 API 語法檢查、API tests 36/36、Frontend tests 8/8、非 Word E2E、單一 HTML build 與 `git diff --check` 全部通過。
- 修復後 `frontend/dist/index.html` 仍為單一檔案 599,725 bytes，SHA256 仍為 `19F31337F4A27314AFA4AF5F1CBC0E55147B066F0990736FDDDB12F54F893EB1`。

### 2026-07-12 Session 與全新 DB 後續修復

- 三個正式 Session API 已完成，前端正式 build 不再顯示角色選擇。
- 新 Session 只保存 token SHA256，使用 HttpOnly Cookie；登入、過期、鎖定、登出與稽核遮罩驗收通過。
- manifest 現為 24 支 migration；全新 DB 首跑、重跑、主要 API、備份與還原比對通過。
- `.env.test` Word 路徑已改到正式新根目錄，原始 Word 與 rehearsal 副本 SHA256 一致。

Word 範本盤點與靜態逐頁比對已在 2026-07-12 補做：官方 `.doc` 與 rehearsal 副本 SHA256 一致，8 頁工作副本的頁數、表格、圖片與兩張附件皆完整；詳細證據見 [`word-template-acceptance.md`](./word-template-acceptance.md)。

目前仍有兩項發佈前阻擋：

1. 實際 `PRE_WORK` / `POST_COMPLETION` API Word 輸出腳本已完成，但最後執行仍受桌面 Word 權限額度限制；不得以模擬輸出替代。
2. 1440×900、390×844 與 console 的 in-app browser 驗收被本機 URL 安全政策拒絕。

此外，Git 已將 scoped 專案搬移辨識為 rename；Legacy、根目錄文件與其他使用者檔案仍刻意不納入這批 staged 變更。

## 2. 檔案清冊

清冊建立時間點早於本報告，因此本報告與清冊本身不納入自我雜湊；其餘當時存在於正式根目錄的檔案均有相對路徑、大小、UTC 修改時間與 SHA256，執行期變動檔則標記為 `SKIPPED_VOLATILE`。

| 分類 | 檔案數 | 大小 | 驗證方式 |
| --- | ---: | ---: | --- |
| 專案檔案 | 239 | 7,735,168 bytes | SHA256 + 全量嚴格 UTF-8 讀取 |
| Excel/Word/PDF/dump | 5 | 658,656 bytes | metadata + SHA256；實際為 5 份 Excel |
| `frontend/dist` | 1 | 599,725 bytes | metadata + SHA256 + 單一 HTML 結構檢查 |
| `node_modules` | 14,534 | 135,100,038 bytes | 統計 + SHA256，不逐字解析 |
| `.local-rehearsal` | 18 | 3,161,010 bytes | 統計；執行期檔不做穩定雜湊 |
| **合計** | **14,797** | **147,254,597 bytes（140.43 MiB）** |  |

正式根目錄外但與專案相關的執行期內容：

| 路徑 | 存在 | 檔案數 | 大小 |
| --- | --- | ---: | ---: |
| 外層 `.git` | 是 | 433 | 26,424,722 bytes |
| 外層 `.runtime/pgdata` | 是 | 2,230 | 99,396,235 bytes |

深度逐字解析排除 14,558 份：`node_modules` 14,534、`dist` 1、`.local-rehearsal` 18、二進位資料 5。這些均依要求只做存在、數量、大小或雜湊驗證。

## 3. 可讀性與損壞檢查

- 使用者指定範圍：181/181 份成功讀取與解析。
- 擴大全部專案文字檔：239/239 份可用嚴格 UTF-8 讀取。
- JavaScript/MJS/CJS：55/55 份通過 `node --check`。
- JSON：一般 JSON 通過 PowerShell 解析；兩份 `package-lock.json` 因 Windows PowerShell 解析器限制出現假警報，改以 Node `JSON.parse` 後 2/2 通過。
- PowerShell：全部 `.ps1` 通過 PowerShell AST parser。
- SQL：37 份均可讀，抽出 246 筆 schema/object 關聯；rehearsal 驗證 SQL 通過。
- 無法讀取或 SHA256 失敗：0。
- 業務檔案 0 byte：0。

共 7 份 0 byte 檔案，均非業務來源：5 份空白 rehearsal log、`erp-api/node_modules/mime/.npmignore`、`frontend/node_modules/@standard-schema/spec/dist/index.js`。

## 4. 重複與孤立檔案

- 專案檔、二進位資料與 `dist` 的相同 SHA256 重複群組：0。
- 前端相對 import：251/251 可解析，無不存在 import。
- 後端入口圖：`erp-api/src` 29/29 份均可由 `server.js` 連到。
- 前端入口圖：51 份來源中 45 份由 `main.tsx` 連到。
- 其餘 6 份包含 `vite-env.d.ts` 與 4 份測試檔，屬正常獨立入口；`shared/utils/workOrder.ts` 只被自己的測試引用，屬一份待確認的低風險孤立業務工具。

## 5. 搬移與 Git 比對

將 Git `HEAD` 的舊 `db-design/`、`erp-api/` 與新根目錄同相對路徑逐檔計算 blob：

| 結果 | 數量 |
| --- | ---: |
| 完全相同的搬移檔 | 101 |
| 搬移後已有既有修改 | 17 |
| 搬移後遺失 | 0 |
| 舊追蹤檔合計 | 118 |

17 份修改檔是先前既有開發成果，不視為損壞，也未在本次還原。初始清冊中的 244 份專案/二進位檔扣除 118 份舊追蹤檔後，有 126 份是新系統新增內容。

目前 Git 尚未 stage 搬移，因此狀態仍是舊 `db-design/`、`erp-api/` 大量刪除，加上整個 `輕軌系統/` 未追蹤；Git 還沒有正式辨識 rename。應以一個明確搬移 commit 收斂，不能恢復舊目錄或刪除新目錄。

搬移後有修改的 17 份：

- `db-design/0_本機資料庫.md`
- `db-design/docs/08-current-design-alignment.md`
- `db-design/local-db-init.ps1`
- `db-design/local-db-start.ps1`
- `db-design/local-db-stop.ps1`
- `erp-api/.env.example`
- `erp-api/package.json`
- `erp-api/src/app.js`
- `erp-api/src/db.js`
- `erp-api/src/routes/assets.js`
- `erp-api/src/routes/dataAdmin.js`
- `erp-api/src/routes/equipmentAlias.js`
- `erp-api/src/routes/inventory.js`
- `erp-api/src/routes/materials.js`
- `erp-api/src/routes/referenceOptions.js`
- `erp-api/src/routes/warehouses.js`
- `erp-api/src/server.js`

## 6. 舊路徑與不存在資源

### 已通過

- 未找到指向舊 `ntmc.yaml/frontend`、`ntmc.yaml/erp-api` 或 `ntmc.yaml/db-design` 的程式碼。
- 啟動/停止 CMD 與 `scripts/start-local-system.ps1`、`scripts/stop-local-system.ps1` 都指向新根目錄內資源。
- `local-db-init.ps1`、新版 migration runbook 與非 Word E2E 共檢查 14 個 SQL 引用，14/14 都存在。

### 需修正

- `erp-api/.env.test`：
  - `WORD_TEMPLATE_ROOT=C:\Users\a2306\Desktop\code\ntmc.yaml\.local-rehearsal\word-templates`
  - `WORD_OUTPUT_DIR=C:\Users\a2306\Desktop\code\ntmc.yaml\.local-rehearsal\word-output`
- 上述兩個目錄目前都不存在，應改成新根目錄下的受控路徑或正式 API 主機路徑。
- 正式根目錄只有 5 份 Excel，沒有 `.doc`、`.docx` 或 PDF 範本。
- rehearsal `form_template` 有 4 筆模擬 `storage_path`，實體檔案不存在；不能視為正式 Word 驗收完成。

## 7. API route 檢查

> 2026-07-12 修復後：三個 Session route 均已實作並通過 rehearsal 登入驗收。下列內容是原始稽核快照。

所有前端主要 API 模組都能對到後端 mount，唯一確定缺少的是正式 session API：

- 前端存在：`GET /api/session`
- 前端存在：`POST /api/session/login`
- 前端存在：`POST /api/session/logout`
- 後端 `app.js`：沒有對應 router 或 mount。

rehearsal 目前以 preview header 或固定 bearer session 驗證，所以既有自動測試可通過；正式登入模式若切到 `VITE_AUTH_MODE=api`，登入畫面會得到 404。

## 8. Migration 唯一排序

> 本節保留 2026-07-11 稽核時的歷史發現。2026-07-12 已將候選順序正式落到 `migration-manifest.json`，並建立 `schema_migration` ledger；實際操作以新版 runbook 與 manifest 為準。

稽核當時資料庫沒有 `schema_migrations`、`migration_history` 或等效 ledger；舊 runbook 也漏列後來新增的 migration。

以下是依現有 FK、ALTER、view 取代與 API 使用關係整理出的唯一候選順序。正式套用前仍須在全新 rehearsal DB 完整重跑與回復演練；本次未套正式資料庫。

| 順序 | 檔案 | 說明 |
| ---: | --- | --- |
| 1 | `schema.postgres.sql` | 基礎 schema |
| 2 | `migration-auth.sql` | session 與帳號欄位 |
| 3 | `migration-system-roles.sql` | 六角色欄位 |
| 4 | `migration-train-fleet.sql` | 車隊欄位 |
| 5 | `migration-inventory-location-status.sql` | 倉儲/儲位結構 |
| 6 | `migration-work-order-numbering.sql` | 工單編碼與 J 工單 |
| 7 | `migration-vehicle-position-slots.sql` | 坑位階層 |
| 8 | `migration-asset-installation-import-staging.sql` | 序號/坑位匯入暫存 |
| 9 | `migration-repair-workflow-options.sql` | R 流程選項 |
| 10 | `migration-pm-check-items.sql` | P 模板檢查與回填結果 |
| 11 | `migration-document-sequence-inventory-document.sql` | 流水號與庫存單據 |
| 12 | `migration-material-master-usage.sql` | 物料用量履歷 |
| 13 | `migration-material-system-2026.sql` | 物料子系統選項 |
| 14 | `migration-equipment-alias.sql` | 設備別名 table/view |
| 15 | `migration-fault-keeper-merge.sql` | 故障樹、工單事件、完工資料 |
| 16 | `migration-fault-report-matrix.sql` | 故障樣態/等級矩陣 |
| 17 | `migration-fault-dispatch-catalog.sql` | 先建立並載入扁平派工目錄 |
| 18 | `migration-danger-dispatch-tree.sql` | 將扁平目錄轉為樹與 view；必須在 15、17 後 |
| 19 | `migration-master-data-versioning.sql` | P 模板版本化 |
| 20 | `migration-precheck-schedule.sql` | 排程批次、工項與 change log |
| 21 | `migration-precheck-workflow-print.sql` | Word mapping、列印與附件 |
| 22 | `migration-audit-reporting.sql` | 稽核紀錄 |
| 23 | `migration-work-order-integrity.sql` | C→R 唯一性 |
| 24 | `migration-inventory-idempotency.sql` | 庫存防重 ledger |

結構完成後才依序載入：`seed-reference-data.sql`、`seed-repair-workflow-options.sql`、`seed-reference-lists.sql`、物料/主檔/PM 匯入、`seed-pm-p1-attachments.sql`。`seed-rehearsal-integration.sql` 與 `verify-rehearsal-integration.sql` 僅限 rehearsal。

`import-pm-templates.sql` 仍只用 `pm_code` 尋找模板，未限定版本；模板版本化後可能同時命中多版並刪除/重建多版明細，應改為版本感知匯入後才能列入正式流程。

## 9. Schema、API 與 rehearsal 資料庫一致性

> 2026-07-12 修復後：`equipment_alias`、`v_equipment_alias` 均已存在，設備別名端點回傳 200。下列缺漏描述是原始稽核快照。

- rehearsal DB：`ntmc_erp_rehearsal_20260710_233030`，PostgreSQL 18.3。
- public base tables：60。
- `verify-rehearsal-integration.sql`：`rehearsal_fixture_ok`。
- API SQL 靜態掃描：143 次關聯引用、67 個唯一 relation 名稱。
- 排除 SQL 關鍵字與 PostgreSQL/system catalog 假陽性後，唯一缺少的正式物件是 `equipment_alias` 與 `v_equipment_alias`。
- `/api/equipment-aliases?limit=2` 實測回傳 500：`relation "v_equipment_alias" does not exist`。
- `/api/reference-options`、`/api/master-data/instruments`、`/api/master-data/pm-template-studio` 均為 200。

這表示「主檔設定」主要頁面可讀，但設備別名子功能尚未具備一致的 rehearsal schema。

## 10. 主要 API 實測

在 rehearsal PostgreSQL 與 port 3102 API 上實測：

| 模組 | 端點 | 結果 |
| --- | --- | --- |
| health | `/api/health` | 200 |
| DB health | `/api/health/db` | 200 |
| dashboard | `/api/dashboard/summary` | 200 |
| work-orders | `/api/work-orders/all?limit=2` | 200，2 筆 |
| precheck | `/api/precheck/schedules?limit=2` | 200，2 筆 |
| inventory | `/api/inventory/summary?limit=2` | 200，2 筆 |
| turnaround | `/api/turnaround/r-orders?limit=2` | 200，2 筆 |
| master-data | `/api/master-data/resources?limit=2` | 200，10 筆 |
| reports | `/api/reports/maintenance?limit=2` | 200，2 筆 |

## 11. 測試與 build

| 驗證 | 結果 |
| --- | --- |
| API syntax check | 通過 |
| API tests | 34/34 通過 |
| Frontend tests | 8/8 通過 |
| Non-Word E2E | 通過：座椅 X、煞車異常、P→C→R、假日重排、六角色 54 組權限 |
| Frontend build | 通過 |
| `git diff --check` | 通過；只有既有 LF/CRLF 警告 |
| `frontend/dist` | 只有 `index.html` 1 檔 |
| `index.html` 大小 | 599,725 bytes |
| `index.html` SHA256 | `19F31337F4A27314AFA4AF5F1CBC0E55147B066F0990736FDDDB12F54F893EB1` |
| 外部 script/CSS/media | 0；全部 inline |

目前 in-app browser 的 URL 安全政策拒絕重新載入本機 `file://` 頁面，因此本次不能用瀏覽器自動化逐頁讀 DOM 或 console。未採用其他瀏覽器或間接繞過。主要模組已由實際 API 呼叫與自動測試驗證，桌面/手機視覺與 console 仍需人工驗收。

## 12. Legacy HTML

- 檔案：`C:\Users\a2306\Desktop\code\ntmc.yaml\預檢工單系統_物料表調整版.html`
- 預期 SHA256：`46647B38352C3B543E7A78FE63B801008D237AF49C88F5E0A2557AF7DBFB2E73`
- 稽核後 SHA256：`46647B38352C3B543E7A78FE63B801008D237AF49C88F5E0A2557AF7DBFB2E73`
- 結果：完全一致，未修改。

## 13. 修正優先順序

### P1：發佈前必修

1. ~~建立唯一 migration manifest/ledger，將 23 支 migration 順序固定並納入自動驗證。~~ 已於 2026-07-12 完成。
2. ~~確認 `equipment_alias`、`v_equipment_alias` 存在且端點由 500 變 200。~~ 已於既有 rehearsal 完成；全新空白 rehearsal 的完整重建仍列入正式套用演練。
3. ~~實作正式 session API，不能保留會 404 的登入契約。~~ 已於 2026-07-12 完成。
4. 修正 Word template/output 根目錄，放入核准範本，完成 Word COM 實際輸出與逐頁比對。
5. 以一個明確 Git commit stage 目錄搬移，避免新根目錄仍是未追蹤狀態。

### P2：整合前修正

1. 將 `import-pm-templates.sql` 改為 `pm_code + version_no` 或明確發布版本 ID，不得跨版本刪改。
2. 決定接入或移除 `frontend/src/shared/utils/workOrder.ts`，避免正式 bundle 外保留無入口業務工具。
3. 補做 1440×900、390×844、所有主路由與 console 的瀏覽器人工驗收。

### P3：治理改善

1. 將檔案清冊與 route/schema 對照納入 CI。
2. 把 migration runbook、主 README 與實際 package scripts 維持在同一版本。
3. 對正式 Word 範本保存 SHA256、版本、核准人與部署路徑，不以 rehearsal 假檔名代替。

## 14. 本次未變更的內容

- 未修改、刪除或搬動任何業務來源檔。
- 未套用正式資料庫 migration。
- 未更動 Legacy HTML。
- 僅重新產生 `frontend/dist/index.html`、新增本報告與清冊、寫入 `.local-rehearsal` 稽核輸出，並更新外層 `collab/HANDOFF.md`。
- 稽核用 API 3001/3102 已停止；PostgreSQL 5433 維持稽核開始時原本的啟動狀態。

## 15. 2026-07-12 交付關卡更新

本節是原始完整性稽核後的最新驗證結果；若與前述歷史快照不同，以本節及 `docs/word-template-acceptance.md` 為準。

- 正式 Session API、24 支 business migration、1 筆 bootstrap ledger、全新 rehearsal DB、備份與還原演練均已完成。
- P1 官方 Word 已完成唯讀副本、Bookmark 工作副本、實際 `PRE_WORK`、正常 P1 完工及實際 `POST_COMPLETION`。兩份輸出皆為 8 頁並保留原始本文與附件版面。
- Word 固定頁首使用 `COMPACT_WORK_ORDER_NO`，避免內部長工單號造成換頁；實際輸出與逐頁比對證據位於 `.local-rehearsal/word-qa`。
- Word 剩餘缺口是數位檢查明細、座椅 X、六點煞車量測與實際用料尚未寫回完工文件，以及 P2/P3/P4 尚未套版驗收。
- API syntax 通過，API tests `41/41`，frontend tests `8/8`，單一 HTML build 通過。
- 非 Word E2E 再次通過座椅 X／煞車阻擋、P→C→R、臨時假日重排及六角色 `54` 組權限；庫存再次通過防重、併發、回滾與餘額重算。
- 桌面主要模組沒有整頁水平溢出或資料錯誤；手機 `390×844` 初查發現預檢月曆把文件撐至 927px，已改由局部橫向捲動容器承接，複驗文件寬度回到 375px。
- 最後一次手機截圖與 console 複查被本機瀏覽器存取政策阻擋，未使用其他瀏覽器或底層控制繞過。
- 設備別名 schema 已修復但資料仍為 0 筆，等待核准正式清單。
- 正式資料庫仍未套用 migration；Legacy SHA256 必須在最終基準檢查再次確認。
