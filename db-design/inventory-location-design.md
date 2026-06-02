# 庫存位置與領料狀態設計

這版採用「位置」和「狀態」分開的設計。

## 核心觀念

中心倉庫不是總額位置，而是未領料、可發料的位置。

其他位置，例如分存站、現場、車上、個人保管，不代表還能被一般領料使用，而是表示物料已經從中心倉庫領出，系統要繼續追蹤它去了哪裡。

## 位置類型

`warehouse.location_type` 用來描述物料所在位置：

- `CENTER_WAREHOUSE`：中心倉庫，未領料、可發料。
- `SUB_STATION`：分存站，已領料後保管。
- `FIELD`：現場或特殊庫位。
- `VEHICLE`：車上或已裝用位置。
- `PERSON`：個人保管。
- `VENDOR`：外修或廠商處。
- `SCRAP`：報廢暫存或報廢區。
- `OTHER`：暫時無法分類的位置。

## 庫存狀態

`stock_status` 用來描述這批數量能不能被領用：

- `AVAILABLE`：中心倉庫內，可發料。
- `ISSUED`：已領出，仍需追蹤位置與保管責任。
- `IN_USE`：已安裝或使用中。
- `QUARANTINE`：待判定、待驗收、待處理。
- `REPAIR`：維修中或外修中。
- `SCRAPPED`：報廢。

## 查詢方式

看可領料數量：

```sql
SELECT part_no, material_name, available_qty
FROM v_material_stock_summary
WHERE available_qty > 0;
```

看物料實際分布：

```sql
SELECT part_no, material_name, warehouse_name, bin_code, stock_status, qty
FROM v_material_location_balance
WHERE part_no = '50.83.0001.LO';
```

## 異動規則

- 入庫到中心倉庫：增加 `AVAILABLE`。
- 領料到分存站或現場：中心倉庫 `AVAILABLE` 減少，目的位置 `ISSUED` 增加。
- 裝到車上：保管位置 `ISSUED` 減少，車上位置 `IN_USE` 增加。
- 退料回中心倉庫：原位置狀態減少，中心倉庫 `AVAILABLE` 增加。
- 報廢：原位置狀態減少，報廢位置 `SCRAPPED` 增加。

這樣報表可以同時回答兩件事：還能領多少，以及已領出去的東西在哪裡。
