# 輕軌維修系統前端

這是全新的 React + Vite + TypeScript 模板。根目錄既有大型 HTML 僅作為 legacy 功能參考，不由此專案直接修改。

## 第一階段範圍

- 共用應用程式外框與響應式左側導覽
- 六個獨立路由：主儀表板、工單管理、預檢管理、周轉件管理、物料庫存、主檔設定
- 共用頁首、面板、狀態標籤、工具列、空資料與表格版型
- 僅建立結構，不搬移 legacy 業務功能與資料

主要程式位於 `src/modules`，每個模組各自維護頁面；共用元件放在 `src/shared`，共用外框放在 `src/layouts`。

## 開發

```bash
npm install
npm run dev
```

## 單一 HTML

```bash
npm run build
```

建置結果位於 `dist/index.html`，可直接以瀏覽器開啟。路由使用網址雜湊，因此不需要額外伺服器。

要交給同事預覽時，只需要提供 `dist/index.html`。

## 規畫文件

- `docs/00-system-blueprint.md`：系統邊界、資料責任與跨模組流程
- `docs/01-module-route-plan.md`：六個模組的頁面、路由與操作規則
- `docs/02-delivery-roadmap.md`：分階段搬移順序與共同驗收標準
