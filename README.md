# ERP Maintenance System

淡海/安坑輕軌維修、物料、庫存與周轉件履歷系統原型。

## 專案內容

- `預檢工單系統_物料表調整版.html`：目前主要前台操作介面。
- `db-design/`：資料庫正式文件、PostgreSQL schema、匯入資料與設計紀錄。
- `erp-api/`：Node.js API 服務，後續供前台呼叫 PostgreSQL 資料。

## 本資料夾已排除

- `erp-api/.env`：內含資料庫密碼，不可上傳 GitHub。
- `物料/` 原始 Excel：建議只放私人 GitHub，公開庫不建議上傳。

## API 啟動方式

```powershell
cd .\erp-api
Copy-Item .env.example .env
notepad .env
npm install
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

`.env` 裡的 `DATABASE_URL` 請填自己的 Zeabur PostgreSQL 連線資訊。

