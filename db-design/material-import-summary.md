# 淡海物料匯入摘要

來源資料夾：G:\我的雲端硬碟\code\物料

## 匯入成果

- 原始列數：1147
- 唯一料號：1147
- 倉庫數：6
- 儲位數：92
- 推定需序號管理料號：328
- 推定可修件料號：27
- 原始庫存量為 0 的列數：428
- 中心倉庫可發料數量：5039
- 已領出或非中心位置數量：2580

## 來源分布

- 淡海95工具：433 筆
- 淡海96儀器：278 筆
- 淡海車輛設備物料：436 筆

## 系統碼分布

- 50 輕軌電聯車：436 筆
- 95 工具類：433 筆
- 96 儀器類：278 筆

## 庫存狀態分布

- AVAILABLE：751 筆
- ISSUED：396 筆

## 輸出檔案

- material-catalog-tamhai.csv：完整物料清單
- material-catalog-tamhai.json：前端或 API 可讀的 JSON
- material-import-tamhai.sql：可匯入 PostgreSQL schema 的 SQL

## 注意

- 中心倉庫以 stock_status=AVAILABLE 表示未領料可發料庫存。
- 分存站、現場、其他非中心位置以 stock_status=ISSUED/IN_USE/REPAIR/SCRAPPED 表示已領出或不可發料去向。
- 儲位已寫入 warehouse_bin 與 inventory_bin_balance，並保留原始列在 material_import_source。
- is_serialized 與 repairable 目前是依料號系統碼與品名關鍵字推定，正式上線前需要人工複核。
