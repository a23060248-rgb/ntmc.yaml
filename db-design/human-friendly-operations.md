# 新增 / 減少 / 刪除的人性化規則

ERP 後台不要讓使用者一直面對 SQL，也不要把「刪除」做得太直接。比較好的做法是把日常動作變成幾種安全操作。

## 1. 新增

使用者看到的是「新增物料」「新增設備序號」「新增儀器」「新增 WI」「新增人員」。

系統背後做三件事：

1. 檢查唯一值是否重複，例如料號、設備序號、儀器編號、WI 編號。
2. 建立主檔資料，例如 `material`、`asset`、`instrument`。
3. 如果是設備序號或庫存，補一筆事件或異動紀錄，例如 `asset_event`、`inventory_transaction`。

## 2. 減少

物料數量不要直接改小，應該用「庫存異動」。

常見按鈕：

- 入庫
- 領用
- 退庫
- 報廢
- 盤點調整

背後寫入：

- `inventory_transaction`
- 更新 `inventory_balance`
- 如果是有序號設備，再新增 `asset_event`

## 3. 刪除

正式 ERP 不建議真的刪除工單、物料、設備序號或履歷。

日常 UI 應該改成：

- 停用
- 作廢
- 結案
- 報廢
- 取消

資料還在，只是不出現在日常清單。這樣之後查工單、履歷、庫存帳才不會斷掉。

## 4. 使用者按錯怎麼辦

比較好的 UX：

- 停用後顯示「已停用，可還原」
- 重要動作先跳確認
- 庫存減少要填原因
- 報廢要走申請與核准
- 工單結案後只能補註記，不直接改歷史

## 5. 已建立的原型頁

我已經在同一個資料夾放了一個可打開的操作原型：

```text
db-design/list-admin-prototype.html
```

它目前用瀏覽器 `localStorage` 保存資料，所以可以先體驗新增、編輯、停用、還原、搜尋、匯出 JSON。

正式系統時，再把這些動作接到 API：

- 新增物料：`POST /api/materials`
- 停用物料：`PATCH /api/materials/:id/status`
- 庫存異動：`POST /api/inventory-transactions`
- 新增設備事件：`POST /api/assets/:id/events`
- 新增 R 工單：`POST /api/work-orders/repair`
