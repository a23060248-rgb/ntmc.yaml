# ERP API

這是第一版後端 API，負責把前端畫面接到 Zeabur PostgreSQL。

目前先做物料與庫存查詢，不先把領料、退料、調撥流程寫死。等流程確認後，再把異動 API 補上。

## 目前功能

- `GET /api/health`：API 健康檢查。
- `GET /api/health/db`：資料庫連線檢查。
- `GET /api/materials`：查物料清單，可用 `search`、`systemCode`、`materialType`。
- `GET /api/materials/:partNo`：查單一料號與儲位分布。
- `POST /api/materials`：新增物料主檔。
- `PATCH /api/materials/:partNo`：修改物料主檔。
- `DELETE /api/materials/:partNo`：停用物料。
- `GET /api/inventory/summary`：查可發料、已領出、使用中、不可用庫存摘要。
- `GET /api/inventory/locations`：查物料在各倉庫/儲位的位置分布。
- `GET /api/inventory/statuses`：查各庫存狀態總量。
- `GET /api/warehouses`：查倉庫/位置清單。
- `GET /api/warehouses/:warehouseCode/bins`：查指定倉庫儲位。

## 本機設定

先建立 `.env`：

```powershell
Copy-Item .env.example .env
```

編輯 `.env`，把 `YOUR_PASSWORD` 改成 Zeabur PostgreSQL 密碼。

因為這個專案在 Google Drive 同步資料夾，`node_modules` 容易安裝失敗。建議依賴裝到本機 AppData：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-local-deps.ps1
```

啟動 API：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

啟動後測試：

```powershell
curl http://localhost:3001/api/health
curl http://localhost:3001/api/health/db
curl "http://localhost:3001/api/materials?limit=5"
```

## Zeabur 部署方向

部署到 Zeabur 時，把 `DATABASE_URL` 放到服務環境變數。

```text
DATABASE_URL=postgresql://root:YOUR_PASSWORD@YOUR_HOST:YOUR_PORT/zeabur
PORT=3001
CORS_ORIGIN=*
DATABASE_SSL=false
```

Zeabur 會在 Linux 環境執行 `npm install`，不會遇到 Google Drive 的 `node_modules` 問題。

這個資料夾也已經放好 `Dockerfile`，之後可以用 Docker 容器方式部署。

## 下一步

等你確認領料流程後，再新增：

- `POST /api/inventory/issue`
- `POST /api/inventory/return`
- `POST /api/inventory/transfer`
- `POST /api/inventory/adjust`

這幾個端點會一起寫入 `inventory_transaction`，並同步更新 `inventory_balance` 與 `inventory_bin_balance`。
