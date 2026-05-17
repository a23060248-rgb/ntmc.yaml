# 庫存異動單號與流水規劃

## 結論

不建立請購單號。

領料、退料、調撥共用同一種「庫存異動單」：

```text
I-民國日期-場站-MAT-流水號
```

範例：

```text
I-1150514-D-MAT-001
I-1150514-D-MAT-002
I-1150514-K-MAT-001
```

`I` 代表 Inventory。`MAT` 代表物料庫存異動。  
領料、退料、調撥不分三套單號，靠 `movement_type` 與庫存狀態分類。

## 資料表

| 資料表 | 用途 |
| --- | --- |
| `document_sequence` | 控制每日流水號，P/C/R/J 工單與 I 庫存異動單都可共用。 |
| `inventory_document` | 庫存異動單抬頭，保存單號、類型、狀態、來源/目的倉庫、關聯工單。 |
| `inventory_document_line` | 庫存異動單明細，保存物料、數量、來源狀態、目的狀態。 |
| `inventory_transaction` | 過帳後產生的庫存履歷，不直接拿來當人員填寫的單據。 |

## 單號流水

`document_sequence` 以這四個欄位決定每日流水：

| 欄位 | 說明 |
| --- | --- |
| `document_type` | 文件類型，庫存異動單固定為 `I`。 |
| `sequence_date` | 文件日期，每天重新從 001 開始。 |
| `site_code` | `D` 淡海、`K` 安坑。 |
| `target_code` | 庫存異動單固定建議用 `MAT`。 |

產生方式：

```sql
SELECT next_document_no('I', DATE '2026-05-14', 'D', 'MAT');
```

回傳：

```text
I-1150514-D-MAT-001
```

## movement_type

| movement_type | 中文 | 使用情境 |
| --- | --- | --- |
| `ISSUE` | 領料 | 中心倉庫發料到分存站、現場、個人、車上或工單。 |
| `RETURN` | 退料 | 分存站、現場、個人或車上退回中心倉庫。 |
| `TRANSFER` | 調撥 | 倉庫與倉庫、儲位與儲位、淡海與安坑之間移動。 |

## document_status

| document_status | 中文 | 說明 |
| --- | --- | --- |
| `DRAFT` | 草稿 | 建單中，尚未確認。 |
| `CHECKING` | 待確認 | 已送出，等待倉管或主管確認。 |
| `APPROVED` | 已核准 | 可以過帳，但還沒有真正改庫存。 |
| `APPLIED` | 已過帳 | 已產生 `inventory_transaction`，庫存快照已更新。 |
| `CANCELLED` | 已取消 | 單據作廢，不得過帳。 |

## 狀態設計

領料、退料、調撥共用同一張明細表，靠來源與目的狀態判斷。

| 操作 | from_stock_status | to_stock_status | 說明 |
| --- | --- | --- | --- |
| 領料 | `AVAILABLE` | `ISSUED` | 中心倉庫可發料庫存領出。 |
| 領料並直接裝用 | `AVAILABLE` | `IN_USE` | 直接裝到車上或設備坑位。 |
| 退料回可用庫存 | `ISSUED` | `AVAILABLE` | 未使用或確認良品退回中心倉庫。 |
| 退料待判定 | `ISSUED` | `QUARANTINE` | 退回但需要檢查。 |
| 調撥 | 依來源 | 依目的 | 淡海、安坑、分存站、儲位間移轉。 |

## 與 inventory_transaction 的關係

`inventory_document` 是人員操作的單據。  
`inventory_transaction` 是過帳後不可隨意改的庫存履歷。

建議流程：

```text
建立 inventory_document
  ↓
新增 inventory_document_line
  ↓
確認/核准
  ↓
過帳
  ↓
產生 inventory_transaction
  ↓
更新 inventory_balance / inventory_bin_balance
```

這樣做的好處是：單據可以草稿、退回、取消；但一旦過帳，庫存履歷就能完整追蹤。

## 範例

### 領料單

```text
document_no: I-1150514-D-MAT-001
movement_type: ISSUE
from_stock_status: AVAILABLE
to_stock_status: ISSUED
```

### 退料單

```text
document_no: I-1150514-D-MAT-002
movement_type: RETURN
from_stock_status: ISSUED
to_stock_status: AVAILABLE
```

### 調撥單

```text
document_no: I-1150514-D-MAT-003
movement_type: TRANSFER
from_stock_status: AVAILABLE
to_stock_status: AVAILABLE
```

## 執行

既有資料庫升級：

```sql
\i migration-document-sequence-inventory-document.sql
```
