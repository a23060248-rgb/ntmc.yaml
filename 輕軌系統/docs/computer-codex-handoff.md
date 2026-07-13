# 輕軌維修系統換機與 Codex 交接清單

更新日期：2026-07-13

## 一、目前基準

| 項目 | 目前值 |
| --- | --- |
| Git 根目錄 | `C:\Users\a2306\Desktop\code\ntmc.yaml` |
| 正式新系統根目錄 | `C:\Users\a2306\Desktop\code\ntmc.yaml\輕軌系統` |
| 工作分支 | `codex/precheck-template-maintenance`，功能 commit `c6d9815` 已在 origin |
| Node.js | `v24.15.0` |
| npm | `11.12.1` |
| PostgreSQL | `18.3`，本機埠 `5433` |
| rehearsal DB | `ntmc_erp_rehearsal_20260710_233030` |
| migration ledger | 26 筆：bootstrap 1 筆、業務 migration 25 筆 |
| 本機系統 URL | `http://127.0.0.1:3001/` |
| 單一 HTML | `frontend/dist/index.html`，623,882 bytes |
| 單一 HTML SHA256 | `B3F7B002C81DFE6167586F48AA135FA73DB566910C6E2901A022C133EC6E0BF2E` |
| Legacy SHA256 | `46647B38352C3B543E7A78FE63B801008D237AF49C88F5E0A2557AF7DBFB2E73` |

「預檢附件與 Word 動態 mapping」已推送到同名遠端分支。換機前仍要確認 `git status` 無未提交檔案；只複製 `輕軌系統` 不等於完整 Git 備份。

> 交接清單目前已建立本機 commit，但自動推送因遠端信任狀態無法確認而被阻擋。換機前請人工確認 GitHub repository 為正確的私人／受控目標，執行 `git push origin codex/precheck-template-maintenance`，並確認 `git status` 不再顯示 `ahead`。

## 二、換機前必帶資料

### 必須帶走

- [ ] 整個 `C:\Users\a2306\Desktop\code\ntmc.yaml`，包含隱藏的 `.git`。
- [ ] 外層共用規則 `C:\Users\a2306\Desktop\code\AGENTS.md`。
- [ ] 外層交接歷程 `C:\Users\a2306\Desktop\code\collab\HANDOFF.md`。
- [ ] `輕軌系統\erp-api\.env.test`，以安全方式單獨傳輸，不上傳公開 Git。
- [ ] `輕軌系統\.local-rehearsal\word-templates`。
- [ ] `輕軌系統\.local-rehearsal\word-output` 與 `word-qa` 驗收證據。
- [ ] 最新 rehearsal 備份：`before-pm-template-maintenance-20260713-005815.dump`。
- [ ] 最新 baseline、驗收 JSON、migration 報告與本文件。
- [ ] 原始 P1/P2/P3/P4 Word DOC；目前來源在舊電腦 `C:\Users\a2306\Desktop\淡海資料`。
- [ ] 若原始年度排程 Excel 仍需再匯入，一併帶走核准版本。

最新資料庫備份：

- 路徑：`輕軌系統\.local-rehearsal\before-pm-template-maintenance-20260713-005815.dump`
- 大小：1,543,830 bytes
- SHA256：`795CA18EF9AFBAADE6A0510E29A9205F5EE8F176BE89D872CF0FCAAFAD5FD23F`

### 可在新電腦重建

- `frontend/node_modules`
- `erp-api/node_modules`
- `frontend/dist`，但若要先給同事離線預覽，可一起帶走目前 `index.html`。
- `.local-rehearsal` 內的 `.pid` 與一般 log。
- `.runtime/pgdata` 不作主要移轉來源。不同 PostgreSQL 安裝或版本不可直接搬資料目錄，應由 `.dump` 還原。

## 三、舊電腦離機前檢查

在 Git 根目錄執行：

```powershell
Set-Location C:\Users\a2306\Desktop\code\ntmc.yaml
git status --short --branch
git diff --check
Get-FileHash -Algorithm SHA256 -LiteralPath '.\預檢工單系統_物料表調整版.html'
```

在新系統根目錄執行：

```powershell
Set-Location .\輕軌系統\erp-api
npm.cmd run check
npm.cmd test
npm.cmd run verify:template-maintenance-rehearsal

Set-Location ..\frontend
npm.cmd test
npm.cmd run build
```

確認完成後：

- [ ] API tests 為 46/46。
- [ ] Frontend tests 為 8/8。
- [ ] migration 250 重跑為 VERIFY。
- [ ] Legacy SHA256 未改變。
- [ ] 記錄未提交檔案與分支。
- [ ] 將 commit 推送遠端，或做包含 `.git` 的完整離線備份。

## 四、新電腦環境

建議安裝相同主版本：

- Git for Windows。
- Node.js 24 與 npm 11。
- PostgreSQL 18，用戶端需包含 `psql`、`pg_dump`、`pg_restore`。
- Microsoft Word 桌面版，因正式 DOC/DOCX 輸出使用 Word COM。
- PowerShell 5.1 以上。

不需要另外安裝前端全域工具；Vite、TypeScript 與測試工具由 `npm ci` 還原。

## 五、新電腦恢復順序

### 1. 還原程式碼

```powershell
Set-Location C:\Users\<新帳號>\Desktop\code
git clone <正式 repository URL> ntmc.yaml
Set-Location .\ntmc.yaml
git switch codex/precheck-template-maintenance
git status --short --branch
```

另外將舊電腦的 `AGENTS.md` 與 `collab` 放回新電腦的 `code` 目錄。若有任何尚未推送的變更，改為複製舊電腦的完整 Git 根目錄；不要先重新 clone 再覆蓋部分檔案。

### 2. 還原依賴

```powershell
Set-Location .\輕軌系統\erp-api
npm.cmd ci

Set-Location ..\frontend
npm.cmd ci
```

### 3. 設定 rehearsal 環境

- 將安全保存的 `.env.test` 放回 `輕軌系統\erp-api`。
- 檢查 `DATABASE_URL` 只指向新電腦本機的 rehearsal DB。
- 檢查 `DATABASE_SAFETY_MODE` 與允許名稱規則仍啟用。
- 更新 `WORD_TEMPLATE_ROOT` 與 `WORD_OUTPUT_DIR` 為新電腦實際路徑。
- 不把 `.env.test`、資料庫密碼或 Session token 貼進 Codex 對話或 commit。

### 4. 還原 PostgreSQL

先建立新的 rehearsal 資料庫，再從 dump 還原；名稱仍應包含 `rehearsal`。

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\createdb.exe' `
  --host localhost --port 5433 --username postgres `
  ntmc_erp_rehearsal_restored

& 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe' `
  --host localhost --port 5433 --username postgres `
  --dbname ntmc_erp_rehearsal_restored `
  --exit-on-error --no-owner --no-privileges `
  '.\輕軌系統\.local-rehearsal\before-pm-template-maintenance-20260713-005815.dump'
```

將 `.env.test` 的 `DATABASE_URL` 改指向還原後資料庫，再執行：

```powershell
Set-Location .\輕軌系統\erp-api
npm.cmd run migrations:rehearsal
npm.cmd run migrations:rehearsal -- --baseline-existing --apply-missing
npm.cmd run verify:template-maintenance-rehearsal
```

預期結果：25 支 migration 全部 VERIFY、ledger 26 筆，不應再次 APPLY。

### 5. 建置與啟動

```powershell
Set-Location ..\frontend
npm.cmd test
npm.cmd run build

Set-Location ..
.\啟動輕軌維修系統.cmd
```

正式操作只開啟：

```text
http://127.0.0.1:3001/
```

確認：

- `/api/health` 回傳成功。
- `/api/health/db` 回傳成功。
- 登入後重新整理 Session 不消失。
- 主檔設定可讀取 P1 模板、2 份附件與 Word 版本。

## 六、Codex 新任務開場指令

在新電腦 Codex 貼上以下內容：

```text
請以目前開啟的資料夾 C:\Users\<新帳號>\Desktop\code\ntmc.yaml 作為唯一 Git 根目錄。
正式新系統根目錄為 .\輕軌系統。

開始前必須依序讀取：
1. AGENTS.md
2. collab/HANDOFF.md
3. 輕軌系統/docs/computer-codex-handoff.md
4. 輕軌系統/frontend/docs/04-pm-template-word-versioning.md
5. 輕軌系統/db-design/docs/10-new-frontend-migration-runbook.md

Legacy HTML「預檢工單系統_物料表調整版.html」只能讀取，不得修改。
正式資料庫不得套用 migration；只允許使用 .env.test 指向的 rehearsal DB。
不得還原使用者或其他代理人既有修改。

先執行 git status、Legacy SHA256、migration 只讀計畫、API tests、frontend tests 與 build，確認基準後再繼續 HANDOFF 的 Suggested next step。
```

## 七、目前已完成

- React/Vite/TypeScript 單一 HTML 與六大模組。
- 正式 Session 與六角色權限。
- 25 支業務 migration 與 ledger runner。
- 主檔、工單、排程、庫存、周轉件、P 工單、回填與報表第一版。
- P1 PRE_WORK／POST_COMPLETION 真實 Word 8 頁輸出驗證。
- 可維護的附件 schema、Word 動態區塊 mapping 與 P 工單完整模板快照。
- rehearsal migration 250 套用與版本隔離驗證。

## 八、下一條主線

1. 新增下一支 migration，保存 Word 區塊驗證批次、輸出檔雜湊與逐頁比對證據；不得修改已套用的第 250 支 migration。
2. 擴充 Word renderer，處理 `CHECK_TABLE`、`MATERIAL_TABLE`、`SEAT_MAP`、`MEASUREMENT_TABLE`。
3. 建立 P1 正式動態 mapping：數位檢查結果、座椅 X、六點煞車值、實際用料。
4. 跑 P1 POST_COMPLETION 8 頁逐頁比對；只有成功的驗證批次可把必要區塊標為已驗證。
5. P1 閉環通過後，依相同程序盤點並建立 P2、P3、P4。
6. 取得核准設備別名清單後，只先匯入 rehearsal。
7. 最後完成桌面、手機、鍵盤與 console 人工驗收，再準備正式資料庫維護申請。

## 九、禁止事項

- 不修改或覆蓋 Legacy HTML。
- 不把正式資料存入 `localStorage` 或 HTML 假資料。
- 不直接修改已登錄 migration；新增結構必須使用下一個序號。
- 不把 rehearsal seed 或範例設備別名當正式資料。
- 不跳過 Word 實際輸出驗證就發布必要動態區塊。
- 未取得人工核准前，不連線或異動正式資料庫。
