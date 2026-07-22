# 輕軌維修系統整體健檢與開發建議

健檢日期：2026-07-15  
正式專案根目錄：`C:\Users\a2306\Desktop\code\ntmc.yaml\輕軌系統`  
Legacy 參考檔：`C:\Users\a2306\Desktop\code\ntmc.yaml\預檢工單系統_物料表調整版.html`  
本次範圍：只檢查、驗證與提出建議，不重構既有業務程式，不套用正式資料庫 migration。

## 1. 結論摘要

目前專案已不是單頁 prototype，而是一套有實際資料模型、API、權限、稽核、排程與 Word 輸出骨架的輕軌維修 ERP。整體技術方向可保留，不建議砍掉重做。

系統目前最適合的定位是：

> 以 P／C／R／J 四類工單為核心，串接預防維修排程、故障維修、序號件送修、物料庫存、Word 正式表單、權限及稽核的小型維修 ERP／CMMS。

對約 30 名使用者而言，React + Express + PostgreSQL 的單體式架構足夠。現階段不需要微服務、事件平台、Lakehouse 或第二套工作流引擎。真正需要完成的是跨模組資料規則收斂與端對端驗收。

### 總體判定

| 項目 | 判定 | 說明 |
|---|---|---|
| 系統架構 | 可延續 | 前端、API、PostgreSQL、Word worker 邊界清楚 |
| 資料庫骨架 | 大致完整 | 73 tables、8 views、173 foreign keys，migration ledger 正常 |
| P 預檢工單 | 大部分完成 | 排程、快照、首次列印、回填、異常與耗料皆有程式；Word 完工回寫仍未全部驗收 |
| C 故障工單 | Workflow 已完成 | migration 320、11 狀態、action API、版本鎖、缺料、觀察、轉單、併單、C 對多 R、六角色權限與 E2E 已通過；正式資料相容性仍為 NO-GO |
| R 周轉件工單 | 大部分完成 | C 接 R、序號件、坑位、送修、回庫、報廢架構存在；坑位併發完整性需補強 |
| J 專案工單 | 基礎完成 | 資料表與清冊入口存在，尚未形成完整專案任務與里程碑流程 |
| 排班規則 | 大部分完成 | 24 個月、24-36 天、鏇削跨月、假日重排及無解複核均有測試 |
| 庫存交易 | 大部分完成 | 過帳、鎖定、防重、回滾皆有測試；預留／待驗收數量模型不足 |
| Word 正式文件 | 部分完成 | P1 有進階 mapping 與 8 頁驗證；P2/P3/P4 及正式人工逐頁比對未完成 |
| 權限 | 大部分完成 | 六角色與 API guard 已建立；仍要完成全頁人工驗收 |
| 稽核 | 部分完成 | mutation audit middleware 已建立；正式流程資料量與查詢畫面尚未驗收 |
| 正式上線 | 尚不可 | 缺少狀態收斂、Word 四級驗收、坑位一致性與完整 E2E 驗收 |

## 2. 我們正在設計什麼

這套 ERP 不是把所有功能塞進同一頁，而是讓各模組共用同一批正式主檔與履歷。

### 四類工單責任

| 工單 | 責任 | 不應混入的責任 |
|---|---|---|
| P 預檢 | 1M／3M／6M／1Y、預防性維修、大修、排程、列印、回填 | 不取代 C 的故障追蹤 |
| C 故檢 | 報修、接單、派工、現場故障處理、拆裝來源 | 不承擔拆下件的完整送修生命週期 |
| R 維修 | 拆下序號件的內修／外修、驗收、回庫、報廢 | 不代表車上的原始故障案件 |
| J 專案 | 非例行改善、改造、專案工作與跨期任務 | 不應拿來代替 P 大修 |

P 工單包含大修是合理決策。大修仍屬車輛預防維修作業，只需以 `work_category` 或模板類別區分，不需要另創第五種工單。

### 主要跨模組流程

```text
年度預排 -> 排班規劃 -> 發布 -> P 工單草稿
       -> 作業前 Word -> 待回填 -> 檢查／量測／附件／實際用料
       -> 正常完工 -> 更新最新完工日 -> 後續排程重算 -> 完工文件
       -> 異常 -> C 工單 -> 拆件時建立 R 工單 -> 維修／驗收／回庫或報廢
```

## 3. 現有技術架構

### 前端

- React 19、TypeScript、Vite、React Router、TanStack Query、React Hook Form、Zod、date-fns。
- Hash route 支援單一 HTML 預覽。
- 正式 API 模式由 Express 同源提供 `frontend/dist/index.html`。
- 正式資料透過 API 讀寫，不以 localStorage 保存業務資料。

正式模組：

1. 主儀表板
2. 工單管理
3. 預檢管理
4. 周轉件管理
5. 物料庫存
6. 主檔設定
7. 管理報表路由

### 後端

- Node.js + Express + PostgreSQL `pg`。
- 17 個 route files，目前約 129 個 HTTP route handlers。
- 共用 authentication、role policy、audit、idempotency、template snapshot、scheduler、Word mapping service。
- API 與前端可同源部署，適合目前使用人數與維護能力。

### 資料庫

- PostgreSQL 18 rehearsal 環境。
- 73 tables、8 views、173 foreign keys。
- 31 支業務 migration 加 bootstrap ledger，重跑採 VERIFY 模式。
- 資料庫設計以共用 `work_order` 加 P／C／R／J 明細表為核心。

### 文件輸出

- 原始 Word 保持唯讀。
- 固定欄位 mapping 與動態 block mapping 分離。
- Word COM worker 在 Windows API 主機產生實際 DOC/DOCX。
- `PRE_WORK` 與 `POST_COMPLETION` 分開保存列印紀錄、快照與檔案雜湊。

## 4. 實際資料庫現況

目前 rehearsal DB 已有大量主檔，但作業交易資料接近空白，因此可證明資料結構與單元規則存在，尚不能等同正式流程已被實際操作驗收。

### 主要資料量

| 資料 | 筆數／狀態 |
|---|---|
| 使用者 | 29 |
| 車輛 | 34 |
| 物料 | 1,150 |
| 倉庫 | 16 |
| 倉庫儲位 | 94 |
| 儀器 | 12 |
| WI 文件 | 10 |
| P 模板 | 4 |
| P1 檢查項目 | 152 |
| 模板附件 | 2 |
| 流程選項 | 193 |
| 故障系統節點 | 274 |
| 派工節點 | 2,421 |
| 故障現象 | 118 |
| 物料匯入暫存 | 1,147 |
| 待審物料問題群組 | 26 群／197 列 |
| P／C／R／J 正式工單 | 目前 0 |
| 排程項目 | 目前 0 |
| Word form template／mapping | 目前 0 |
| asset event | 目前 0 |

### 資料模型優點

- `work_order` 共用工單號、車輛、日期、建立人、負責人及結案資料。
- P／C／R／J 以明細表擴充，不重複建立四套工單總表。
- P 模板有草稿、發布、退版與工單快照。
- 附件有穩定代碼與獨立版本庫，已發布版本不可直接修改。
- 庫存交易、單據、倉庫 balance 與 bin balance 分層。
- `asset_event` 可作為設備拆裝、送修、回庫及報廢的歷史來源。
- Session、角色及 operation audit 已納入 schema。

## 5. 工單流程健檢

### 5.1 P 工單

已支援：

- 24 個月排程、發布後建立 P 工單草稿。
- 建單時複製模板、項目、用料、儀器、WI、附件及 Word mapping 快照。
- 列印前條件確認。
- 作業前 Word 列印成功後進入待回填。
- 依工單快照顯示檢查項目，不受後續模板修改影響。
- 量測上下限自動判定。
- P1 座椅圖與六點電磁煞車附件。
- 異常建立新 C、更新既有 C，或主管核准僅記錄。
- 實際用料與 P 完工放在同一交易內，庫存不足會回滾。
- 完工後更新最新完工日並連動後續排程。

尚缺：

- 當前 fresh rehearsal DB 沒有正式 form template／field mapping／block mapping 資料。
- P1 完工後數位檢查結果、座椅 X、煞車值與實際用料的 Word 實際回寫仍需最終逐頁驗收。
- P2、P3、P4 尚未完成同等層級的 Word mapping 與實機驗證。
- 尚未用一張真實 P 工單完整跑過排程到二次列印。

判定：大部分支援，但 Word 與正式 E2E 尚未閉環。

### 5.2 C 工單

資料庫已定義 11 個 C 狀態：

| 代碼 | 正式名稱 |
|---|---|
| 0 | 報修 |
| 1 | 接單 |
| 2 | 派工 |
| 3 | 完工 |
| 4 | 覆核 |
| 5 | 結案 |
| 6 | 併單 |
| 7 | 轉單 |
| 8 | 作廢 |
| 9 | 缺料 |
| 10 | 觀察 |

已完成：

- migration 320 已加入 C 工單 11 狀態所需的結構化事件、版本欄位、派工／轉單歷程、缺料、觀察及拆件關聯。
- C 工單狀態由 `cWorkOrderWorkflow` 狀態機統一判斷，前端只顯示合法操作，後端 action API 再次驗證角色、狀態與版本。
- 通用 status PATCH 已停用；完工、覆核、結案、併單、轉單、作廢、缺料、觀察均使用專用 action API。
- 每次操作使用交易、列鎖與樂觀版本鎖，並保存事件、request ID、異動前後摘要及稽核紀錄。
- 一張 C 工單可由不同拆件事件建立多張 R 工單；同一 C、拆件事件與序號件不得重複建立有效 R 單。
- 六角色權限矩陣與 C workflow E2E 已通過。

正式資料相容性限制：

- 2026-07-16 的 migration 320 技術 rehearsal 顯示業務資料與關聯 hash 均未改變、可安全重跑、rollback 與 backup restore 通過，且 migration 新增異常為 0。
- 本機沒有去識別化正式資料副本的來源證明，也沒有正式唯讀帳號、正式 ledger 與關鍵資料前後 hash，因此不能把 rehearsal 結果宣告為正式資料相容性通過。
- P 異常建立 C 的異常值／附件快照，以及 C 缺料與庫存交易直接關聯仍未閉環。

判定：C workflow 本身已完成；正式資料套用維持 **NO-GO**，不得再重構狀態機或新增狀態，下一步只處理資料相容性證據與跨模組缺口。

### 5.3 R 工單

已支援：

- 來源 C 工單 + 拆下件序號唯一掛鉤。
- 內修／外修、送修、修回、驗收、回庫及報廢所需欄位。
- R 主狀態與細部修理狀態分層，避免主狀態過度膨脹。
- 坑位矩陣、設備序號清冊、坑位履歷及 asset event API。
- 正式操作集中在 R 詳情，矩陣右側只顯示現況。

高風險缺口：

- 安裝設備時 API 只鎖 `asset`，沒有同時鎖目標 `vehicle_position`。
- 寫入新坑位前沒有拒絕「坑位已有另一設備」。
- 資料庫沒有 partial unique constraint 強制一個坑位只能有一個目前設備，也沒有保證同一設備只在一個目前坑位。
- `asset.current_position_id` 與 `vehicle_position.current_asset_id` 是雙向快照，若交易或併發處理不完整可能互相不一致。

判定：流程大部分支援，但坑位唯一性是上線前必修的資料完整性問題。

### 5.4 J 工單

目前已有 `project_work_order`、共用清冊與詳情入口，足以保存專案型工單的基礎資訊。尚未看到完整的專案里程碑、子任務、預算、風險與簽核流程。

對現階段而言不應先擴充成大型專案系統。建議第一版只保留：標題、負責人、起迄、狀態、工作說明、附件與事件時間軸。

判定：第一階段支援，後續需求未明確前不擴充。

## 6. 排程健檢

程式與測試已涵蓋：

- 車輛以 30 天為目標，合法範圍 24-36 天。
- 在裕度內可往前或往後排，無解時仍保留排程並標示複核。
- 優先順序為高階檢修、1M、鏇削。
- 鏇削由 3M／6M／1Y 觸發，優先安排在檢修前兩個工作日。
- 鏇削可跨至上月月底，且一天只能一台。
- 每日容量與合法車輛組合限制。
- 機廠設備依全年最短固定週期。
- 新增臨時假日後進行連鎖重排。
- 無法滿足容量時不遺失應排項目。

主要缺口不是規則演算法，而是正式資料目前沒有排程項目，尚未用完整 24 個月真實年度表進行人工對表驗收。

判定：規則層大部分支援，需真實年度資料驗收。

## 7. 物料與庫存健檢

### 已支援

- 物料主檔、倉庫、儲位、庫存狀態與位置分布。
- 領料、退料、調撥及工單耗用皆透過交易 API。
- 過帳時以 advisory transaction lock 鎖定物料／倉庫／狀態。
- 不允許負庫存。
- idempotency key 防止重複扣料。
- 單筆流程失敗時交易回滾。
- `inventory_balance` 與 `inventory_bin_balance` 對帳目前 0 mismatch。

### 尚缺

- 沒有明確 `RESERVED` 與 `PENDING_ACCEPTANCE` 庫存狀態或 reserved quantity。
- `work_order_material` 只有 planned／actual，缺少正式預留、已領、退回與批次／儲位生命週期。
- 可用量目前主要等於 AVAILABLE，尚不能完整表達 `現有 - 預留 - 隔離`。
- 現階段明確不做正式盤點單，這是合理範圍控制，但上線文件須標明。

判定：交易過帳大部分支援；預留與待驗收模型部分缺失。

## 8. 設備、坑位與履歷健檢

合理的資料責任應維持：

- `vehicle_position`：車輛固定坑位。
- `asset`：有序號的設備實體。
- `asset_event`：拆下、裝上、送修、回庫、報廢的不可變事件。
- `asset.current_*`：快速查詢用的目前快照。
- `vehicle_position.current_asset_id`：矩陣顯示用快照。

不建議再建立第二套履歷表取代 `asset_event`。應補的是交易鎖、唯一性限制與快照對帳工具。

## 9. Word 與數位模板健檢

目前「數位表單」與「正式 Word」分開維護的方向正確：

- 數位模板可隨時新增項目、量測、附件、用料、儀器與 WI。
- Word 版面獨立版本化，保持與核准原始格式一致。
- 兩者由固定欄位 mapping 與動態 block mapping 連結。
- 已發布版本不可修改；修改時建立新修訂。
- 舊工單保存舊快照，新工單取得最新發布版本。

P1 已盤點：152 個檢查項目、62 個座椅位置、6 組煞車量測點，原始文件為 8 頁。

尚未完成：

1. 在目前 fresh rehearsal DB 建立正式 P1 form template 與 mapping 資料。
2. 實際 Word COM 輸出並逐頁核對 P1 作業前與完工後文件。
3. P2、P3、P4 各自建立、驗證與發布 Word 版本。
4. 若正式 Word 沒有核准的實際用料欄位，不得自行塞入其他儲存格；應等待新版 Word 核准。

判定：架構完整，實際文件交付仍部分完成。

## 10. 權限與稽核健檢

### 六角色

1. 系統管理員
2. 維修主管
3. 排程人員
4. 維修人員
5. 倉管人員
6. 唯讀人員

六角色對約 30 人仍合理，不需要為了簡化而合併成一個「維修角色」。應在畫面上隱藏不必要入口，但 API 仍須依角色拒絕未授權操作。

### 已支援

- Session token hash、HttpOnly Cookie、撤銷、過期、鎖定與最後使用時間。
- API route 以 `resolveAuth` 與 `requireRoles` 保護主要異動。
- Mutation audit 保存操作者、角色、request ID、路徑、狀態、IP、User-Agent、前後摘要。
- 稽核 payload 會遮蔽 password、token 與 authorization。

### 風險

- `databaseViewer` 的舊 HTML viewer routes 沒有 authentication，應移除或限制為系統管理員且只在開發環境啟用。
- `dataAdmin` 是廣泛通用 CRUD／匯入 API，雖限 system admin，正式環境仍應由環境開關停用，避免繞過業務規則。
- CORS 預設接受任意 origin 且帶 credentials；正式同源部署不應保留廣泛 origin。
- 主檔頁目前只允許具備寫入權限者進入。若主管希望一般人員查閱主檔，應增加 read-only 畫面，不要放寬寫入 API。
- 目前 DB 僅有少量 audit 資料，尚未證明完整正式流程的前後摘要都符合需求。

判定：安全骨架大部分支援，正式部署設定與人工角色驗收尚未完成。

## 11. 前端操作與模組邊界

### 優點

- 六個主要模組責任已清楚分離。
- 預檢管理內有年度、月曆、排班、作業包與回填等子路由。
- 周轉件矩陣已回歸「檢視現況」，正式動作留在 R 單。
- 主要清冊已有 loading、empty、error 及 retry 狀態。

### 問題

- 報表有路由與儀表板入口，但沒有左側導覽，使用者不容易發現。
- C 狀態下拉只顯示 7 個狀態且名稱不正確。
- 工單清冊可看 P／C／R／J，但正式編輯能力主要集中在 C；R、P 的正式工作區在其他模組，需在畫面明確提示並提供跳轉。
- 主檔設定功能密度高，手機畫面應以「先選資源，再進編輯頁」呈現，不應把大型矩陣完整壓進 390px。
- `inventory-split`、`turnaround-split` 與大型 matrix 仍有手機水平溢出的風險，需要實機截圖驗收。

## 12. 可整併、可退場與不應整併

### 可整併或退場

| 對象 | 建議 |
|---|---|
| `fault_dispatch_catalog` | 保留為 `fault_dispatch_node` 的相容 view，不再當第二份主檔 |
| `inventory_balance` | 長期可由 bin balance 聚合或以嚴格對帳維護，避免兩份快照漂移 |
| `asset_task` | 檢查是否與 `work_order`／`work_order_event` 重複；若無正式用途，標示 deprecated |
| `material_usage_history` | 保留舊歷史證據，新用量改由 immutable inventory transaction 推導 |
| `databaseViewer` | 從正式產品退場或只在 development 啟用 |
| `dataAdmin` | 不提供一般 UI，正式環境預設關閉 |

### 不應整併

- P／C／R／J 明細表不應合成一張巨型表。
- `asset` 與 `vehicle_position` 不應合併，設備會移動，坑位是固定位置。
- `inventory_transaction` 與 balance 不應合併，前者是履歷，後者是快照。
- 數位模板與 Word 範本不應合併，兩者版本目的不同。
- P 工單與 C 工單不應合併，異常應以來源關聯串接。

## 13. 主要風險與優先順序

### P0 上線阻擋

1. **坑位裝用完整性**：補目標坑位鎖、占用檢查、唯一性限制與快照對帳。
2. **C 狀態一致性**：畫面、API、workflow option 與 DB 使用同一組 11 狀態及轉移規則。
3. **Word 正式驗收**：P1 PRE／POST 實際 Word 比對，接著 P2／P3／P4。
4. **端對端交易驗收**：至少一條正常 P1 與一條異常 P1 -> C -> R -> 庫存流程。

### P1 高優先

5. 停用或保護 unauthenticated `databaseViewer`。
6. 正式環境限制 CORS，停用通用 `dataAdmin`。
7. 建立工單合法狀態轉移 service，不讓 route 任意改狀態。
8. 移除隨機派工，改為明確人員或可設定規則。
9. 補庫存預留／待驗收模型與工單用料生命週期。

### P2 後續改善

10. 補共用工單關聯表，保存來源、父子、併單、轉單、替代與關聯原因。
11. 補設備與坑位快照每日對帳報表。
12. 報表加入左側入口或角色化捷徑。
13. J 工單等實際需求明確後再擴充里程碑與子任務。

## 14. 建議新增的 migration

不要修改既有 31 支 migration，新增後續 migration：

1. `migration-asset-position-integrity.sql`
   - 目前裝用唯一性。
   - 必要索引與資料清理前置檢查。
   - 不允許同一坑位同時有兩個目前設備。

2. `migration-work-order-state-policy.sql`
   - 每工單類型的穩定狀態代碼。
   - 合法轉移表與是否需要主管核准。
   - 11 個 C 狀態以正式名稱 seed。

3. `migration-work-order-relation.sql`
   - `source`、`parent`、`merged_into`、`transferred_from`、`related`。
   - 保存原因、操作者、時間與有效狀態。

4. `migration-inventory-reservation.sql`
   - 工單用料預留、釋放、領用、退回與待驗收。
   - 不直接修改既有 transaction 歷史。

5. `migration-production-hardening.sql`
   - 視正式部署需求補 session 清理索引、audit 查詢索引與資料一致性 constraint。

所有 migration 先套可拋棄 rehearsal DB，再做首跑、重跑、備份及還原演練。

## 15. 建議測試補強

### API／資料庫

- C 11 狀態完整轉移矩陣與禁止案例。
- 同時把兩個設備裝入同一坑位的併發測試。
- 同一設備重複安裝的唯一性測試。
- asset 與 vehicle_position 快照不一致的偵測與修復測試。
- 庫存預留、釋放、重複提交、耗用與回滾。
- databaseViewer 未登入不可存取。
- production CORS 與 dataAdmin 環境開關。

### 前端

- C 11 狀態名稱與 API workflow option 完全一致。
- 各角色的左側導覽、頁面與按鈕顯示。
- 工單清冊到 P 作業包、R 詳情的正確跳轉。
- 390x844 下的主檔、庫存、坑位矩陣與回填畫面。

### Word

- P1 PRE_WORK 固定欄位回歸。
- P1 POST_COMPLETION 152 項、座椅 X、6 點量測與核准用料欄位。
- P2／P3／P4 各自的頁數、圖片、表格、頁首頁尾與附件落點。
- 列印失敗不得改變 P 工單狀態。

### 端對端

1. 正常 P1：排程 -> 首印 -> 全正常回填 -> 耗料 -> 完工 -> 重排 -> 完工文件。
2. 座椅 X：未選報修不得完工，建立 C 後可繼續。
3. 煞車異常：數值自動判異常並連結 C。
4. 拆件：C -> 唯一 R -> 外修 -> 驗收 -> 回庫。
5. 臨時假日：整段重排，不漏排、不超容量。
6. 權限：唯讀不能異動，維修不能發布排程。

## 16. 建議執行階段

### Phase A：資料規則收斂（C workflow 已完成）

- 已建立 C 狀態政策、action API、事件與工單關聯設計。
- 已完成 C 11 狀態前端顯示、版本鎖、缺料、觀察、轉單與併單。
- 已完成 C 對多 R 與拆件唯一性驗證。
- migration 320 技術 rehearsal 已完成；正式資料相容性仍須取得正式去識別化副本與唯讀證據。

驗收：C workflow 自動驗證已通過；正式資料 dry-run 尚未達 GO 門檻。

### Phase B：Word 四級閉環

- 在 rehearsal 建立 P1 form template／mapping。
- 完成 P1 PRE／POST 實際 Word 比對。
- 依同一流程完成 P2、P3、P4。

驗收：原始 Word SHA256 不變，輸出逐頁一致，失敗不改狀態。

### Phase C：P-C-R 與庫存 E2E

- 建立正常與異常兩條 P1 測試工單。
- 異常建立 C，拆件建立 R，實際用料過帳。
- 驗證快照、事件、audit、庫存與後續排程。

驗收：可從 P 檢查細項追到 C、R、序號件、坑位及庫存交易。

### Phase D：安全與部署收斂

- 移除正式環境舊 viewer。
- 關閉通用 dataAdmin。
- 限制 CORS。
- 完成六角色人工驗收及桌面／手機驗收。

驗收：401／403 正確、console 零錯誤、正式操作同源。

### Phase E：資料匯入與交付

- 處理物料 26 群待審問題。
- 取得正式設備別名核准清單。
- rehearsal dry-run、差異報告、核准後才 canonical upsert。
- 最終 migration、備份、還原與交付文件。

驗收：正式資料來源、責任人與核准證據齊全。

## 17. 本次實際驗證

| 驗證 | 結果 |
|---|---|
| API syntax check | PASS |
| API unit tests | 82/82 PASS |
| Frontend tests | 8/8 PASS |
| TypeScript + Vite build | PASS |
| 單一 HTML | PASS，670.78 kB |
| Rehearsal DB readiness | PASS，73 tables／8 views／173 FKs |
| Inventory balance reconciliation | 0 mismatch |
| 主要 API | health、DB、dashboard、work-orders、precheck、materials、turnaround、master-data、reports 均回 200 |
| Legacy SHA256 | `46647B38352C3B543E7A78FE63B801008D237AF49C88F5E0A2557AF7DBFB2E73`，未變 |

### Migration 320 正式資料相容性驗證補充（2026-07-16）

| 驗證 | 結果與證據 |
|---|---|
| 來源資格 | FAIL：僅有 `REHEARSAL_PRE_320_SNAPSHOT`；未連線正式資料庫，未取得正式唯讀帳號與 ledger 前後 hash |
| 業務資料 hash | PASS：before／after 均為 `66BF855DDBD19B8BA8E69420EA22AD1CFC21ECB000AE2B16E966E6963BF364C7` |
| 關聯 hash | PASS：before／after 均為 `93A8FF5ECAC1874612FD4A571F1331C45D2F12C1983655EAE2FE0B98959C6AE6` |
| Schema 重跑 | PASS：after／rerun 均為 `AFC000D8FA82FCF3C00AC10A479D63B744251F496C4D126D4018C8CA647E11BC` |
| Transaction rollback | PASS：測試列數 before／after 均為 0 |
| Migration failure rollback | PASS：schema、ledger、business 均未改變 |
| LEGACY event | PASS：重跑不新增事件，不變更工單狀態，不觸發 workflow、通知、SLA 或稽核副作用 |
| Backup restore | PASS：還原後 business、schema、ledger hash 均與 migration 後 clone 一致 |
| Migration 新增異常 | PASS：0 筆 |
| P 異常到 C | FAIL：來源 P、細項、標準已保存；異常值為 NULL，C 附件快照 0 筆 |
| C 拆件到 R | PASS：拆件事件、設備序號、asset_event 與 R 關聯一致 |
| 缺料與庫存 | FAIL：庫存 rollback／重算通過，但缺料紀錄與庫存交易直接關聯為 0 筆 |
| 最終判定 | **NO-GO** |

完整證據：

- [Migration 320 相容性報告](./migration-320-compatibility-report.md)
- [Before／After JSON](./migration-320-before-after.json)
- [資料異常清單](./migration-320-data-anomalies.csv)
- [跨模組閉環報告](./cross-module-closure-report.md)
- [GO／NO-GO 報告](./go-no-go-report.md)

## 18. 最終建議

目前不應再橫向增加更多畫面。下一條主線應是：

1. 先修坑位與工單狀態的資料完整性。
2. 完成 P1 實際 Word 閉環。
3. 跑完 P -> C -> R -> 庫存完整流程。
4. 再複製成熟方法到 P2、P3、P4。
5. 最後處理正式資料匯入、手機驗收與上線手冊。

此順序可以保留既有成果，也能最快把目前「功能很多」收斂成「流程真的能完成且資料可信」。
