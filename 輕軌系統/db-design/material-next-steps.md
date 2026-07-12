# 淡海物料資料庫下一步建議

目前已經把 `淡海輕軌物料編碼原則(1111130).xlsx`、`淡海車輛設備物料.xlsx`、`淡海95工具.xlsx`、`淡海96儀器.xlsx` 轉成資料庫可匯入檔。

## 已完成

- 建立 1,147 筆唯一料號。
- 建立 6 個倉庫。
- 建立 92 個儲位。
- 保留每一筆 Excel 原始來源列到 `material_import_source`，方便日後追溯。
- 將中心倉庫庫存寫成 `AVAILABLE`，代表未領料可發料。
- 將分存站、現場或其他非中心位置寫成已領出或不可發料狀態。
- 將現有庫存量寫入 `inventory_balance`，並將儲位明細寫入 `inventory_bin_balance`。
- 依物料編碼拆出系統碼、分類碼、流水號、屬性碼。

## 建議優先順序

1. 先人工複核 `material-catalog-tamhai.csv` 裡的 `Repairable` 和 `IsSerialized`。
2. 確認每個位置的 `location_type` 是否符合現場語意，特別是電子零件倉、危險物品倉、環狀線南機廠相關位置。
3. 把 `list-admin-prototype.html` 從 localStorage 原型改成讀寫後端 API。
4. 做一個物料匯入審核畫面，讓 Excel 匯入後先看到新增、更新、疑似錯誤、重複料號。
5. 建立領料、退料、盤點、調撥流程，所有數量改變都走 `inventory_transaction`。
6. 把安全庫存、採購前置天數、是否市購品補齊，之後才能做缺料預警。

## 庫存判斷原則

- 中心倉庫：未領料、可發料，狀態為 `AVAILABLE`。
- 分存站、現場、車上、個人保管：已領料後的去向，不應算進可發料庫存。
- 看總持有量時，可以加總所有狀態。
- 看能不能領料時，只看中心倉庫的 `AVAILABLE`。

## 匯入順序

```sql
\i schema.postgres.sql
\i seed-reference-data.sql
\i material-import-tamhai.sql
```

`material-import-tamhai.sql` 可以重跑；相同料號會更新，不會一直新增重複主檔。

如果是舊版資料庫，先跑：

```sql
\i migration-inventory-location-status.sql
\i material-import-tamhai.sql
```
