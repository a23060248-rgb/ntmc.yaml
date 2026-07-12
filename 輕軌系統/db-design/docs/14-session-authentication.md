# 正式 Session 登入與安全契約

更新日期：2026-07-12

## API 契約

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `POST` | `/api/session/login` | 使用帳號、密碼建立正式 Session |
| `GET` | `/api/session` | 取得目前登入者、角色與到期時間 |
| `POST` | `/api/session/logout` | 撤銷 Session 並清除 Cookie |

正式模式不接受前端自行指定角色。角色只讀取 `app_user.system_role`，並由既有六角色 API policy 決定操作權限。

## 安全規則

- 密碼以版本化 `scrypt` 格式保存，不保存明文。
- 新 Session 產生 256-bit 隨機 credential；資料庫只保存 SHA256。
- 原始 credential 只透過 `HttpOnly; SameSite=Lax` Cookie 傳給瀏覽器。
- 正式單一 HTML 由 ERP API 同源提供，避免跨來源 Cookie。
- 預設 Session 有效時間為 8 小時，可由 `SESSION_TTL_HOURS` 調整。
- 連續失敗預設 5 次後鎖定 15 分鐘。
- 待審核、停用、須重設密碼與鎖定帳號不得登入。
- 登入、失敗及登出均寫入 `operation_audit_log`；密碼會被稽核清理器替換為 `[REDACTED]`。
- 既有 rehearsal Bearer token 暫時保留相容性；正式登入建立的新 Session 不保存明文 token。

## 前端模式

- 正式 `npm run build`：預設 `API` 模式，只顯示帳號與密碼。
- `npm run build:preview`：靜態預覽模式，可選角色，但不建立正式 Session。
- API 回傳 401 時，前端會清除目前身分並導回登入頁。
- 不使用 `localStorage` 或 `sessionStorage` 保存正式 Session。

## Rehearsal 驗證

```powershell
Set-Location .\erp-api
npm run verify:session-rehearsal
```

驗證案例包含：正確登入、目前 Session、受保護查詢、錯誤密碼、待審、停用、鎖定、過期、登出撤銷、token 不落地及密碼稽核遮罩。

Rehearsal 共用測試密碼只存在於 `seed-rehearsal-integration.sql`，不得用於正式帳號。
