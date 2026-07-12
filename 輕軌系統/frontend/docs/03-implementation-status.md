# 輕軌維修系統實作狀態

更新日期：2026-07-10

## 已完成

- React、Vite、TypeScript、HashRouter 與單一 HTML 建置。
- 六個主模組與共用導覽、登入 adapter、六種角色、路由權限與 API 錯誤狀態。
- 主檔版本管理：P1/P2/P3/P4、檢查項目、用料、儀器、WI、Word 欄位與流程顏色。
- 工單清冊、C 工單建立/派工/完工、R/J/P 統一查詢與事件時間軸。
- 物料位置、交易、領退調撥、工單耗用與補料提示。
- R 單清冊、正式處理動作、坑位矩陣現況、設備與坑位履歷。
- 24 個月預檢排程、24-36 天限制、鏇削跨月、假日連鎖重排與規則測試。
- P 工單作業包、範本版本快照、列印前確認與 Word COM worker。
- 待回填、量測判定、P1 座椅附件、六點煞車量測、異常 C 單與實際用料過帳。
- 六種管理報表、來源回查連結與跨模組 mutation 稽核。

## 已驗證

- API 語法檢查通過。
- API 單元測試 17/17 通過。
- 前端單元測試 5/5 通過。
- TypeScript 與前端 build 通過。
- `frontend/dist/index.html` 為單一 HTML。
- 新 migration 已在隔離 PostgreSQL 還原庫首跑與重跑成功。
- Legacy HTML SHA256 保持 `46647B38352C3B543E7A78FE63B801008D237AF49C88F5E0A2557AF7DBFB2E73`。

## 尚待整合驗收

- 需匯入正式設備序號/坑位測試資料，跑通 C 拆件至 R 回庫完整成功路徑。
- 需配置官方 Word 範本路徑，在裝有 Microsoft Word 的 API 主機比對實際輸出頁面。
- 直接 `.xlsx` 解析 adapter 尚未安裝；CSV/正規化列匯入已可用。
- 正式登入 API、HttpOnly Cookie、Session 過期/撤銷與前端 API/Preview 雙模式已於 2026-07-12 接入；正式 build 預設使用 API 模式。
- 尚需完成 1440x900、390x844 與鍵盤操作的瀏覽器 QA。
- 本次內建瀏覽器安全設定拒絕自動開啟本機預覽網址，因此視覺 QA 尚未宣告通過。
- 正式資料庫 migration 仍未套用，必須另行核准。

## 完成交付前阻擋條件

1. 正式 Word 四級表單版面比對通過。
2. 設備序號與坑位資料可支援 C/R/asset_event 成功路徑。
3. API 正式登入、session 過期與未授權測試通過。
4. 瀏覽器桌面/手機無重疊、無不合理水平溢出、無 console error。
5. 正式 migration 由 DBA 核准並完成備份/回復演練。
