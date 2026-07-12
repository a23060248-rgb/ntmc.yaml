# 輕軌維修系統

這裡是正式新系統的唯一開發根目錄。新功能只能進入 `frontend`、`erp-api` 與 `db-design`。

## 目錄

| 路徑 | 用途 |
| --- | --- |
| `frontend/` | React + Vite + TypeScript 前端，建置後輸出單一 `dist/index.html` |
| `erp-api/` | REST API、權限、稽核、排程、工單、庫存與 Word 輸出服務 |
| `db-design/` | PostgreSQL schema、migration、seed、驗證 SQL 與設計文件 |
| `.local-rehearsal/` | 本機演練備份與驗收紀錄，已由 Git 忽略 |

本機 PostgreSQL 實體資料放在外層 `../.runtime/pgdata`。Windows PostgreSQL 無法穩定從中文路徑啟動，因此這是唯一的執行期例外；程式碼、migration 與演練備份仍在本目錄。可以用 `NTMC_PGDATA` 環境變數改指其他 ASCII 路徑。

## 開發邊界

- 外層 `../預檢工單系統_物料表調整版.html` 只能讀取參考，不得修改。
- 不使用 iframe。
- 正式資料只透過 PostgreSQL API 存取，不使用 localStorage。
- Migration 先套用到 rehearsal 資料庫，未經核准不得套用正式資料庫。

## 快速開始

同事在 Windows 可直接雙擊 `啟動輕軌維修系統.cmd`。它會啟動 PostgreSQL 與 API，通過健康檢查後由 `http://127.0.0.1:3001/` 同源提供新版單一 HTML。正式 API 登入的 HttpOnly Cookie 因此不需要跨來源；使用完畢後可雙擊 `停止輕軌維修系統.cmd`。

### 1. 本機 PostgreSQL

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\db-design\local-db-start.ps1
```

### 2. API

```powershell
Set-Location .\erp-api
npm install
npm start
```

### 3. 前端

```powershell
Set-Location .\frontend
npm install
npm run dev
```

### 4. 建置單一 HTML

```powershell
Set-Location .\frontend
npm run build
```

輸出位於 `frontend/dist/index.html`。正式 build 預設使用 API Session 登入，應由 ERP API 同源提供；若只需要不連正式帳號的靜態角色預覽，改執行 `npm run build:preview`。

### 5. 檢查 Rehearsal Migration

```powershell
Set-Location .\erp-api
npm run migrations:rehearsal
```

這個命令預設只讀，會依 `db-design/migration-manifest.json` 檢查 25 支 migration 是否存在。人工確認備份與目標資料庫後，才可依 [`db-design/docs/10-new-frontend-migration-runbook.md`](db-design/docs/10-new-frontend-migration-runbook.md) 的方式建立 ledger 或套用缺少 migration；不得指向正式資料庫。

## 固定驗證

```powershell
Set-Location .\erp-api
npm run check
npm test

Set-Location ..\frontend
npm test
npm run build
```

每次交付前還必須在外層 Git 根目錄執行 `git diff --check`，並比對 Legacy HTML SHA256。
