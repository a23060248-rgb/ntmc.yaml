const express = require("express");

const router = express.Router();

const IMPORT_FIELD_DEFS = [
  { key: "ImportAction", header: "匯入動作", required: true, sample: "UPSERT", note: "UPSERT 新增或更新；DISABLE 停用物料" },
  { key: "PartNo", header: "料號", required: true, sample: "50.88.0004.LO", note: "物料唯一代碼，不可空白" },
  { key: "MaterialName", header: "物料名稱", required: true, sample: "R134快速接頭", note: "前台與倉庫查詢顯示名稱" },
  { key: "Spec", header: "規格", required: false, sample: "適用於填充R134冷媒", note: "型號、尺寸、材質、適用設備等" },
  { key: "Unit", header: "單位", required: true, sample: "ST", note: "PC、ST、組、瓶等" },
  { key: "SystemName", header: "系統別", required: true, sample: "輕軌電聯車", note: "例：輕軌電聯車、號誌、供電" },
  { key: "MaterialType", header: "物料類型", required: true, sample: "車輛設備物料", note: "用於分類與篩選" },
  { key: "MaterialProperty", header: "物料屬性", required: true, sample: "系統備品", note: "例：系統備品、專屬物料、耗材" },
  { key: "WarehouseCode", header: "倉庫代碼", required: true, sample: "TH-CENTER", note: "需符合後台倉庫代碼" },
  { key: "BinCode", header: "儲位代碼", required: false, sample: "DMW4612", note: "可空白，空白時不指定儲位" },
  { key: "StockStatus", header: "庫存狀態", required: true, sample: "AVAILABLE", note: "AVAILABLE、ISSUED、IN_USE、QUARANTINE、REPAIR、SCRAPPED" },
  { key: "StockQty", header: "庫存數量", required: true, sample: "1", note: "只能填數字，可含小數" },
  { key: "SafetyLevel", header: "安全等級", required: false, sample: "4", note: "1-5，數字越高越重要" },
  { key: "ReorderPoint", header: "請購點", required: false, sample: "0", note: "低於此數量可提示補料/請購" },
  { key: "LeadTimeDays", header: "採購前置天數", required: false, sample: "30", note: "預估採購或到貨天數" },
  { key: "EstimatedUnitPrice", header: "預估單價", required: false, sample: "1400", note: "只填數字，不填貨幣符號" },
  { key: "Repairable", header: "可維修", required: false, sample: "否", note: "是/否" },
  { key: "IsSerialized", header: "序號管理", required: false, sample: "否", note: "是/否，有序號追蹤才填是" },
  { key: "ReviewNote", header: "備註", required: false, sample: "匯入範例，請刪除或改成正式資料", note: "來源、盤點說明、補充資訊" }
];

function csvValue(value) {
  return `"${String(value === undefined || value === null ? "" : value).replace(/"/g, '""')}"`;
}

function importTemplateCsv() {
  const headers = IMPORT_FIELD_DEFS.map((field) => field.header);
  const sample = IMPORT_FIELD_DEFS.map((field) => field.sample || "");
  return `\ufeff${headers.map(csvValue).join(",")}\r\n${sample.map(csvValue).join(",")}\r\n`;
}

router.get("/materials-db/import-template.csv", (req, res) => {
  const fileName = encodeURIComponent("物料主檔_庫存匯入格式.csv");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${fileName}`);
  res.send(importTemplateCsv());
});

router.get(["/materials-db", "/warehouse-backoffice"], (req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>倉庫物料後台</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f3f6fb;
      --nav: #ffffff;
      --panel: #ffffff;
      --panel-2: #f8fafc;
      --panel-3: #eef4f8;
      --line: #d7e0ea;
      --text: #172033;
      --muted: #64748b;
      --cyan: #0891b2;
      --green: #15803d;
      --amber: #b45309;
      --red: #be123c;
      --shadow: 0 12px 30px rgba(25, 39, 65, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: "Microsoft JhengHei", "Noto Sans TC", system-ui, sans-serif;
    }
    button, input, select, textarea {
      min-height: 40px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #ffffff;
      color: var(--text);
      font: inherit;
    }
    button {
      padding: 0 14px;
      cursor: pointer;
      font-weight: 700;
      white-space: nowrap;
    }
    button.primary {
      border-color: #0e7490;
      background: #0891b2;
      color: #ffffff;
    }
    button.secondary {
      border-color: #bbf7d0;
      background: #ecfdf3;
      color: #166534;
    }
    button.warning {
      border-color: #fed7aa;
      background: #fff7ed;
      color: #9a3412;
    }
    button.danger {
      border-color: #fecdd3;
      background: #fff1f2;
      color: #9f1239;
    }
    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }
    input, select, textarea {
      width: 100%;
      padding: 0 12px;
      outline: none;
    }
    textarea {
      min-height: 88px;
      padding-top: 10px;
      resize: vertical;
    }
    input:focus, select:focus, textarea:focus {
      border-color: #0891b2;
      box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.12);
    }
    .layout {
      display: grid;
      min-height: 100vh;
    }
    nav {
      position: sticky;
      top: 0;
      z-index: 30;
      display: grid;
      grid-template-columns: minmax(220px, 330px) minmax(0, 1fr);
      gap: 18px;
      align-items: center;
      border-bottom: 1px solid var(--line);
      background: var(--nav);
      padding: 12px 22px;
      box-shadow: 0 1px 0 rgba(15, 23, 42, 0.03);
    }
    .brand {
      padding: 0;
    }
    .brand strong {
      display: block;
      font-size: 18px;
      letter-spacing: 0;
    }
    .brand span {
      display: block;
      margin-top: 6px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }
    .nav-group {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      overflow-x: auto;
    }
    .nav-button {
      width: auto;
      justify-content: flex-start;
      background: #f8fafc;
      color: #334155;
    }
    .nav-button.active {
      border-color: #67e8f9;
      background: #ecfeff;
      color: #0e7490;
    }
    header {
      border-bottom: 1px solid var(--line);
      background: #ffffff;
      padding: 14px 24px;
    }
    h1 {
      margin: 0;
      font-size: 24px;
      letter-spacing: 0;
    }
    .sub {
      margin-top: 6px;
      color: var(--muted);
      font-size: 13px;
    }
    .content {
      min-width: 0;
    }
    .view {
      display: none;
      width: min(100%, 1720px);
      margin: 0 auto;
      padding: 16px 24px 24px;
    }
    .view.active {
      display: block;
    }
    .grid {
      display: grid;
      gap: 14px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }
    .stat, .panel, .field, .location, .request-card, .check-item {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
    }
    .stat {
      padding: 12px;
      min-height: 78px;
    }
    .stat span {
      display: block;
      color: var(--muted);
      font-size: 12px;
    }
    .stat strong {
      display: block;
      margin-top: 6px;
      font-size: 24px;
      line-height: 1;
    }
    .stat small {
      display: block;
      margin-top: 6px;
      color: var(--muted);
      font-size: 12px;
    }
    .split {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 390px;
      gap: 16px;
    }
    .dashboard-layout {
      grid-template-columns: minmax(0, 1fr) 360px;
    }
    .review-layout {
      grid-template-columns: 430px minmax(0, 1fr);
      align-items: start;
    }
    .panel {
      min-width: 0;
      overflow: hidden;
      box-shadow: var(--shadow);
    }
    .panel-head, .status {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      border-bottom: 1px solid var(--line);
      padding: 12px 14px;
      color: var(--muted);
      font-size: 13px;
      background: #fbfdff;
    }
    .panel-head strong {
      color: var(--text);
      font-size: 15px;
    }
    .toolbar {
      display: grid;
      grid-template-columns: minmax(260px, 1fr) minmax(140px, 170px) auto auto auto auto;
      gap: 10px;
      align-items: center;
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      background: #fbfdff;
    }
    .import-note {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      border-bottom: 1px solid var(--line);
      padding: 10px 14px;
      color: var(--muted);
      background: #f8fafc;
      font-size: 12px;
      line-height: 1.5;
    }
    .format-guide {
      display: grid;
      gap: 8px;
      padding: 14px;
      border-top: 1px solid var(--line);
      background: #ffffff;
    }
    .format-row {
      display: grid;
      grid-template-columns: 150px 88px minmax(0, 1fr) minmax(0, 1fr);
      gap: 10px;
      align-items: start;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      background: #f8fafc;
      font-size: 12px;
      line-height: 1.45;
    }
    .format-row strong {
      color: var(--text);
      font-size: 13px;
    }
    .format-row span {
      color: var(--muted);
    }
    .format-required {
      display: inline-flex;
      width: fit-content;
      border-radius: 999px;
      padding: 3px 8px;
      background: #fff7ed;
      color: #9a3412;
      font-weight: 800;
    }
    .format-optional {
      display: inline-flex;
      width: fit-content;
      border-radius: 999px;
      padding: 3px 8px;
      background: #f1f5f9;
      color: #475569;
      font-weight: 800;
    }
    .table-wrap {
      max-height: calc(100vh - 288px);
      overflow: auto;
    }
    table {
      width: 100%;
      min-width: 1280px;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 13px;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 11px 12px;
      text-align: left;
      vertical-align: top;
      background: var(--panel);
    }
    th {
      position: sticky;
      top: 0;
      z-index: 6;
      background: #eef6fb;
      color: #075985;
      font-size: 12px;
    }
    th:nth-child(1), td:nth-child(1) {
      position: sticky;
      left: 0;
      z-index: 4;
      width: 150px;
      min-width: 150px;
      background: #ffffff;
    }
    th:nth-child(2), td:nth-child(2) {
      position: sticky;
      left: 150px;
      z-index: 4;
      width: 360px;
      min-width: 360px;
      background: #ffffff;
      box-shadow: 1px 0 0 var(--line);
    }
    th:nth-child(1), th:nth-child(2) {
      z-index: 8;
      background: #eef6fb;
    }
    td:nth-child(5), td:nth-child(6), td:nth-child(7), td:nth-child(8),
    th:nth-child(5), th:nth-child(6), th:nth-child(7), th:nth-child(8) {
      text-align: right;
    }
    tbody tr {
      cursor: pointer;
    }
    tbody tr:hover td, tbody tr.selected td {
      background: #ecfeff;
    }
    .part {
      display: block;
      color: #0f766e;
      font-weight: 800;
      white-space: nowrap;
    }
    .muted {
      display: block;
      margin-top: 3px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }
    .pill {
      display: inline-flex;
      border: 1px solid rgba(148, 163, 184, 0.28);
      border-radius: 999px;
      padding: 4px 8px;
      color: #0f172a;
      background: #f1f5f9;
      font-size: 12px;
      white-space: nowrap;
    }
    .danger { color: var(--red); }
    .warning-text { color: var(--amber); }
    .ok { color: var(--green); }
    .detail {
      position: sticky;
      top: 88px;
      align-self: start;
      max-height: calc(100vh - 112px);
      overflow: auto;
      padding: 16px;
    }
    .detail h2 {
      margin: 0;
      font-size: 18px;
    }
    .detail-grid {
      display: grid;
      gap: 10px;
      margin-top: 14px;
    }
    .field {
      background: var(--panel-2);
      padding: 10px;
    }
    .field span {
      display: block;
      color: var(--muted);
      font-size: 12px;
    }
    .field strong {
      display: block;
      margin-top: 4px;
      line-height: 1.5;
      word-break: break-word;
    }
    .locations, .request-list {
      display: grid;
      gap: 8px;
      margin-top: 14px;
    }
    .location, .request-card {
      padding: 12px;
      background: #ffffff;
    }
    .request-card {
      cursor: pointer;
      transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
    }
    .request-card.active {
      border-color: #22d3ee;
      background: #ecfeff;
      box-shadow: 0 10px 22px rgba(8, 145, 178, 0.12);
      transform: translateY(-1px);
    }
    .request-card-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
    }
    .request-card-head h2 {
      margin: 0;
    }
    .request-card-head strong {
      line-height: 1.35;
    }
    .request-title {
      display: block;
      margin-top: 8px;
      font-weight: 800;
      line-height: 1.35;
    }
    .request-meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 5px 10px;
      margin-top: 8px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 4px 8px;
      background: #f1f5f9;
      color: #475569;
      font-size: 12px;
      font-weight: 800;
      white-space: nowrap;
    }
    .status-badge.pending {
      background: #fff7ed;
      color: #9a3412;
    }
    .status-badge.approved {
      background: #ecfdf3;
      color: #166534;
    }
    .status-badge.rejected {
      background: #fff1f2;
      color: #9f1239;
    }
    .stock-badge {
      color: #166534;
      font-weight: 800;
    }
    .stock-badge.warn {
      color: #9a3412;
    }
    .location strong, .location span {
      display: block;
    }
    .location span {
      margin-top: 3px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }
    .request-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }
    .review-action-panel {
      margin-top: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #fbfdff;
    }
    .review-action-panel .request-actions {
      margin-top: 10px;
    }
    .movement-source {
      display: none;
      margin: 14px 14px 0;
      border: 1px solid #bae6fd;
      border-radius: 8px;
      padding: 10px 12px;
      background: #f0f9ff;
      color: #075985;
      font-size: 13px;
      line-height: 1.5;
    }
    .movement-source.active {
      display: block;
    }
    .issue-order-panel {
      margin-bottom: 12px;
      border-bottom: 1px solid var(--line);
      padding-bottom: 12px;
    }
    .issue-order-inline-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      color: var(--muted);
      font-size: 13px;
    }
    .issue-order-inline-head strong {
      color: var(--text);
      font-size: 15px;
    }
    .issue-order-panel .form-grid {
      margin-top: 10px;
      padding: 0;
    }
    .issue-order-panel .form-actions {
      padding: 0;
      margin-top: 10px;
    }
    .issue-order-status {
      display: flex;
      justify-content: flex-end;
      margin-top: 10px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }
    input[readonly], textarea[readonly], select:disabled {
      background: #f1f5f9;
      color: #475569;
      cursor: default;
    }
    .review-note {
      width: 100%;
      min-height: 64px;
      margin-top: 8px;
      resize: vertical;
    }
    .check-list {
      display: grid;
      gap: 8px;
      margin-top: 12px;
    }
    .check-item {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr);
      gap: 8px;
      padding: 10px;
      background: #ffffff;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }
    .check-item strong {
      display: block;
      margin-bottom: 3px;
      color: var(--text);
      font-size: 13px;
    }
    .check-dot {
      width: 12px;
      height: 12px;
      margin-top: 2px;
      border-radius: 999px;
      background: var(--green);
      box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.12);
    }
    .check-dot.warn {
      background: var(--amber);
      box-shadow: 0 0 0 3px rgba(180, 83, 9, 0.12);
    }
    .review-detail-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 14px;
    }
    .decision-card {
      grid-column: 1 / -1;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #f8fafc;
    }
    .decision-card span {
      display: block;
      color: var(--muted);
      font-size: 12px;
    }
    .decision-card strong {
      display: block;
      margin-top: 6px;
      line-height: 1.5;
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      padding: 14px;
    }
    .form-field label {
      display: block;
      margin-bottom: 6px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }
    .wide {
      grid-column: 1 / -1;
    }
    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 0 14px 14px;
    }
    .empty {
      padding: 22px;
      color: var(--muted);
      text-align: center;
    }
    .toast {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 50;
      max-width: min(420px, calc(100vw - 36px));
      border: 1px solid #67e8f9;
      border-radius: 8px;
      padding: 12px 14px;
      background: #ffffff;
      color: var(--text);
      box-shadow: var(--shadow);
    }
    .toast[hidden] {
      display: none;
    }
    @media (max-width: 1120px) {
      .layout { grid-template-columns: 1fr; }
      nav { position: sticky; grid-template-columns: 1fr; }
      .nav-group { justify-content: flex-start; }
      .split, .dashboard-layout, .review-layout { grid-template-columns: 1fr; }
      .detail { position: static; max-height: none; }
      .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .toolbar { grid-template-columns: 1fr 1fr; }
      .review-detail-grid { grid-template-columns: 1fr; }
      .format-row { grid-template-columns: 1fr 92px; }
    }
    @media (max-width: 720px) {
      nav { padding: 12px 14px; }
      .nav-group { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .stats, .form-grid, .request-meta { grid-template-columns: 1fr; }
      .view { padding: 14px; }
      table { min-width: 1120px; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <nav>
      <div class="brand">
        <strong>倉庫物料後台</strong>
        <span>前台填申請，倉庫只審核與建立異動單。</span>
      </div>
      <div class="nav-group">
        <button class="nav-button active" data-view-button="dashboard" type="button">作業台</button>
        <button class="nav-button" data-view-button="requests" type="button">待審核申請</button>
        <button class="nav-button" data-view-button="materials" type="button">物料查詢</button>
        <button class="nav-button" data-view-button="movement" type="button">庫存異動</button>
        <button class="nav-button" data-view-button="import" type="button">Excel 匯入</button>
        <button class="nav-button" data-view-button="counting" type="button">盤點作業</button>
      </div>
    </nav>
    <div class="content">
      <header>
        <h1 id="pageTitle">作業台</h1>
        <div id="pageSub" class="sub">資料來源：localhost:3001 API / Zeabur PostgreSQL</div>
      </header>

      <section id="dashboardView" class="view active">
        <div class="grid">
          <div class="stats">
            <div class="stat"><span>待審核申請</span><strong id="pendingCount">0</strong><small>前台送出尚未核准</small></div>
            <div class="stat"><span>已核准待建單</span><strong id="approvedCount">0</strong><small>可建立發料異動單</small></div>
            <div class="stat"><span>資料庫物料</span><strong id="materialTotal">0</strong><small>主檔總筆數</small></div>
            <div class="stat"><span>庫存不足</span><strong id="shortageCount">0</strong><small>可發料為 0 或需請購</small></div>
          </div>
          <div class="split dashboard-layout">
            <section class="panel">
              <div class="panel-head"><strong>前台申請流程</strong><span>資料由前台送入，後台不重填</span></div>
              <div class="request-list" id="dashboardRequests" style="padding:14px;margin-top:0"></div>
            </section>
            <section class="panel">
              <div class="panel-head"><strong>快速動作</strong><span>倉庫人員常用</span></div>
              <div class="form-grid">
                <button class="primary" data-go-view="requests" type="button">處理待審核</button>
                <button class="secondary" data-go-view="materials" type="button">查物料庫存</button>
                <button data-go-view="movement" type="button">手動異動單</button>
                <button data-go-view="import" type="button">匯入 Excel</button>
              </div>
            </section>
          </div>
        </div>
      </section>

      <section id="requestsView" class="view">
        <div class="split review-layout">
          <section class="panel">
            <div class="panel-head"><strong>待審核申請</strong><span>前台資料唯讀，倉庫只做審核</span></div>
            <div class="request-list" id="requestList" style="padding:14px;margin-top:0"></div>
          </section>
          <aside class="panel detail">
            <div id="requestDetail">
              <h2>審核明細</h2>
              <div class="empty">點左側申請單查看前台帶入資料、庫存與審核判斷。</div>
            </div>
          </aside>
        </div>
      </section>

      <section id="materialsView" class="view">
        <div class="split">
          <section class="panel">
            <div class="toolbar">
              <input id="search" placeholder="搜尋料號、品名、規格、系統別">
              <select id="filter">
                <option value="all">全部物料</option>
                <option value="needPurchase">需請購</option>
              </select>
              <button id="importExcel" class="secondary" type="button">匯入 Excel</button>
              <button id="template" type="button">下載格式</button>
              <button id="reload" class="primary" type="button">重新同步</button>
              <button id="raw" type="button">看原始 JSON</button>
              <input id="excelFile" type="file" accept=".csv,.xlsx,.xls" hidden>
            </div>
            <div class="status">
              <span id="statusText">讀取中...</span>
              <span><button id="prev" type="button">上一頁</button> <button id="next" type="button">下一頁</button></span>
            </div>
            <div id="importNote" class="import-note">
              <span>匯入格式：物料主檔 + 庫存位置。必填料號、品名、單位、系統/類型/屬性、倉庫、庫存狀態、數量。</span>
              <span>Excel 請依範本整理後另存 CSV 匯入。</span>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>料號</th>
                    <th>物料名稱 / 規格</th>
                    <th>系統 / 類型</th>
                    <th>屬性</th>
                    <th>可發料</th>
                    <th>已領出</th>
                    <th>總量</th>
                    <th>請購點</th>
                    <th>建議</th>
                  </tr>
                </thead>
                <tbody id="rows">
                  <tr><td colspan="9" class="empty">讀取中...</td></tr>
                </tbody>
              </table>
            </div>
          </section>
          <aside class="panel detail">
            <div id="detail">
              <h2>物料明細</h2>
              <div class="empty">點左側任一筆物料查看儲位與主檔欄位。</div>
            </div>
          </aside>
        </div>
      </section>

      <section id="movementView" class="view">
        <section class="panel">
          <div class="panel-head"><strong>庫存異動單</strong><span>前台申請帶入資料，倉庫確認倉庫與狀態後送出</span></div>
          <form id="movementForm">
            <div id="movementSource" class="movement-source"></div>
            <div class="form-grid">
              <div class="form-field"><label>異動類型</label><select name="movementType"><option value="ISSUE">領料</option><option value="RETURN">退料</option><option value="TRANSFER">調撥</option></select></div>
              <div class="form-field"><label>料號 / 物料名稱</label><select name="partNo" required><option value="">讀取物料主檔中...</option></select></div>
              <div class="form-field"><label>數量</label><input name="qty" type="number" min="0.001" step="0.001" value="1" required></div>
              <div class="form-field"><label>來源倉庫</label><select name="sourceWarehouseCode" required><option value="">讀取倉庫中...</option></select></div>
              <div class="form-field"><label>來源庫存狀態</label><select name="sourceStockStatus"><option value="AVAILABLE">AVAILABLE｜可發料</option><option value="ISSUED">ISSUED｜已領料</option><option value="IN_USE">IN_USE｜使用中</option><option value="QUARANTINE">QUARANTINE｜待判定</option><option value="REPAIR">REPAIR｜維修中</option><option value="SCRAPPED">SCRAPPED｜報廢</option></select></div>
              <input name="sourceBinCode" type="hidden" value="">
              <div class="form-field"><label>目的倉庫</label><select name="destinationWarehouseCode" required><option value="">讀取倉庫中...</option></select></div>
              <div class="form-field"><label>目的庫存狀態</label><select name="destinationStockStatus"><option value="ISSUED">ISSUED｜已領料</option><option value="AVAILABLE">AVAILABLE｜可發料</option><option value="IN_USE">IN_USE｜使用中</option><option value="QUARANTINE">QUARANTINE｜待判定</option><option value="REPAIR">REPAIR｜維修中</option><option value="SCRAPPED">SCRAPPED｜報廢</option></select></div>
              <input name="destinationBinCode" type="hidden" value="">
              <div class="form-field"><label>設備名稱</label><select name="equipmentNo"><option value="">請選擇設備</option></select></div>
              <div class="form-field"><label>關聯工單</label><select name="workOrderNo"><option value="">未關聯工單</option></select></div>
              <div class="form-field"><label>領用 / 保管人</label><select name="custodianName"><option value="">請選擇人員 / 單位</option></select></div>
              <div class="form-field wide"><label>異動備註</label><textarea name="note">後台庫存異動</textarea></div>
            </div>
            <div class="form-actions">
              <button type="button" id="movementClear">清空</button>
              <button type="submit" class="primary">建立異動單</button>
            </div>
          </form>
        </section>
      </section>

      <section id="importView" class="view">
        <section class="panel">
          <div class="panel-head"><strong>Excel 匯入</strong><span>先檢查格式，再確認寫入</span></div>
          <div class="form-grid">
            <button id="importExcel2" class="secondary" type="button">選擇 Excel / CSV</button>
            <button id="template2" type="button">下載匯入格式</button>
            <div class="field wide"><span>匯入狀態</span><strong id="importStatus">尚未選擇檔案</strong></div>
          </div>
          <div id="formatGuide" class="format-guide"></div>
        </section>
      </section>

      <section id="countingView" class="view">
        <section class="panel">
          <div class="panel-head"><strong>盤點作業</strong><span>第一版先保留盤點清單入口</span></div>
          <div class="form-grid">
            <div class="field"><span>盤點批號</span><strong>待建立</strong></div>
            <div class="field"><span>盤點狀態</span><strong>尚未開始</strong></div>
            <button type="button" class="primary">建立盤點單</button>
            <button type="button">下載盤點格式</button>
          </div>
        </section>
      </section>
    </div>
  </div>
  <div id="toast" class="toast" hidden></div>
  <script>
    var state = {
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
      query: "",
      filter: "all",
      selectedPartNo: "",
      selectedRequestId: "MR-1150518-001",
      materialChoices: [],
      warehouses: [],
      warehouseBins: {},
      requestMaterialCache: {},
      requestLocationsCache: {},
      requests: [
        { id: "MR-1150518-001", workOrderNo: "P-1150518-D-TS-001", partNo: "50.88.0005.LO", materialName: "R134冷媒錶組", qty: 1, unit: "ST", requester: "維修一組", phone: "2314", requestedAt: "2026-05-18 09:12", requiredDate: "2026-05-19", priority: "一般", equipmentNo: "D-TS-001", equipmentName: "淡海輕軌列車 D-TS-001", location: "淡海輕軌機廠", suggestedWarehouse: "TH-CENTER", status: "待審核", note: "預檢補充冷媒工具", reason: "R134 系統檢測需使用冷媒錶組確認壓力，預計於明日預檢班次使用。" },
        { id: "MR-1150518-002", workOrderNo: "C-1150518-D-TS-003", partNo: "50.83.0001.LO", materialName: "車門CHT3按鈕墊塊", qty: 2, unit: "PC", requester: "故檢人員", phone: "2368", requestedAt: "2026-05-18 10:05", requiredDate: "2026-05-18", priority: "急件", equipmentNo: "D-TS-003", equipmentName: "淡海輕軌列車 D-TS-003", location: "淡海輕軌分存站", suggestedWarehouse: "TH-CENTER", status: "待審核", note: "車門故障更換", reason: "車門按鈕墊塊磨耗，需更換後再回報故障工單。" },
        { id: "MR-1150518-003", workOrderNo: "P-1150518-D-TS-008", partNo: "50.94.0054.LO", materialName: "空調耗材", qty: 4, unit: "PC", requester: "預檢人員", phone: "2330", requestedAt: "2026-05-18 08:40", requiredDate: "2026-05-20", priority: "一般", equipmentNo: "D-TS-008", equipmentName: "淡海輕軌列車 D-TS-008", location: "淡海輕軌機廠", suggestedWarehouse: "TH-CENTER", status: "已核准", note: "例行保養", reason: "例行保養需補齊空調耗材，已確認本週預檢排程。" }
      ]
    };

    var titles = {
      dashboard: ["作業台", "前台送申請，倉庫審核，只有異動單會更新庫存。"],
      requests: ["待審核申請", "前台資料已帶入，倉庫只確認與核准。"],
      materials: ["物料查詢", "查料號、庫存、儲位與主檔欄位。"],
      movement: ["庫存異動單", "倉庫端唯一需要執行並影響庫存的單據。"],
      import: ["Excel 匯入", "下載格式、檢查欄位、準備寫入資料庫。"],
      counting: ["盤點作業", "盤點批次與庫存校正。"]
    };
    var defaults = {
      ISSUE: { sourceWarehouseCode: "TH-CENTER", sourceStockStatus: "AVAILABLE", destinationWarehouseCode: "TH-SUB", destinationStockStatus: "ISSUED", note: "領料至分存站保管" },
      RETURN: { sourceWarehouseCode: "TH-SUB", sourceStockStatus: "ISSUED", destinationWarehouseCode: "TH-CENTER", destinationStockStatus: "AVAILABLE", note: "退回主庫房" },
      TRANSFER: { sourceWarehouseCode: "TH-CENTER", sourceStockStatus: "AVAILABLE", destinationWarehouseCode: "TH-SUB", destinationStockStatus: "ISSUED", note: "庫存調撥" }
    };
    var importFieldDefs = [
      { key: "ImportAction", header: "匯入動作", required: true, sample: "UPSERT", note: "UPSERT 新增或更新；DISABLE 停用物料" },
      { key: "PartNo", header: "料號", required: true, sample: "50.88.0004.LO", note: "物料唯一代碼，不可空白" },
      { key: "MaterialName", header: "物料名稱", required: true, sample: "R134快速接頭", note: "前台與倉庫查詢顯示名稱" },
      { key: "Spec", header: "規格", required: false, sample: "適用於填充R134冷媒", note: "型號、尺寸、材質、適用設備等" },
      { key: "Unit", header: "單位", required: true, sample: "ST", note: "PC、ST、組、瓶等" },
      { key: "SystemName", header: "系統別", required: true, sample: "輕軌電聯車", note: "例：輕軌電聯車、號誌、供電" },
      { key: "MaterialType", header: "物料類型", required: true, sample: "車輛設備物料", note: "用於分類與篩選" },
      { key: "MaterialProperty", header: "物料屬性", required: true, sample: "系統備品", note: "例：系統備品、專屬物料、耗材" },
      { key: "WarehouseCode", header: "倉庫代碼", required: true, sample: "TH-CENTER", note: "需符合後台倉庫代碼" },
      { key: "BinCode", header: "儲位代碼", required: false, sample: "DMW4612", note: "可空白，空白時不指定儲位" },
      { key: "StockStatus", header: "庫存狀態", required: true, sample: "AVAILABLE", note: "AVAILABLE、ISSUED、IN_USE、QUARANTINE、REPAIR、SCRAPPED" },
      { key: "StockQty", header: "庫存數量", required: true, sample: "1", note: "只能填數字，可含小數" },
      { key: "SafetyLevel", header: "安全等級", required: false, sample: "4", note: "1-5，數字越高越重要" },
      { key: "ReorderPoint", header: "請購點", required: false, sample: "0", note: "低於此數量可提示補料/請購" },
      { key: "LeadTimeDays", header: "採購前置天數", required: false, sample: "30", note: "預估採購或到貨天數" },
      { key: "EstimatedUnitPrice", header: "預估單價", required: false, sample: "1400", note: "只填數字，不填貨幣符號" },
      { key: "Repairable", header: "可維修", required: false, sample: "否", note: "是/否" },
      { key: "IsSerialized", header: "序號管理", required: false, sample: "否", note: "是/否，有序號追蹤才填是" },
      { key: "ReviewNote", header: "備註", required: false, sample: "匯入範例，請刪除或改成正式資料", note: "來源、盤點說明、補充資訊" }
    ];
    var importHeaders = importFieldDefs.map(function (field) { return field.header; });
    var importRequiredHeaders = importFieldDefs.filter(function (field) { return field.required; }).map(function (field) { return field.header; });

    var rows = document.getElementById("rows");
    var detail = document.getElementById("detail");
    var requestDetail = document.getElementById("requestDetail");
    var statusText = document.getElementById("statusText");
    var search = document.getElementById("search");
    var filter = document.getElementById("filter");
    var reload = document.getElementById("reload");
    var prev = document.getElementById("prev");
    var next = document.getElementById("next");
    var raw = document.getElementById("raw");
    var importExcel = document.getElementById("importExcel");
    var importExcel2 = document.getElementById("importExcel2");
    var template = document.getElementById("template");
    var template2 = document.getElementById("template2");
    var formatGuide = document.getElementById("formatGuide");
    var excelFile = document.getElementById("excelFile");
    var importNote = document.getElementById("importNote");
    var importStatus = document.getElementById("importStatus");
    var movementForm = document.getElementById("movementForm");
    var movementSource = document.getElementById("movementSource");
    var toast = document.getElementById("toast");
    var debounceTimer = null;
    var toastTimer = null;

    function text(value, fallback) {
      var content = value === undefined || value === null || value === "" ? fallback : value;
      return String(content === undefined || content === null ? "" : content);
    }
    function escapeHtml(value) {
      return text(value, "").replace(/[&<>"]/g, function (char) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char];
      });
    }
    function number(value) {
      var parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    function qty(value) {
      return number(value).toLocaleString("zh-TW", { maximumFractionDigits: 3 });
    }
    function showToast(message) {
      toast.textContent = message;
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toast.hidden = true; }, 3200);
    }
    function optionHtml(value, label) {
      return '<option value="' + escapeHtml(value) + '">' + escapeHtml(label) + '</option>';
    }
    function ensureSelectOption(select, value, label) {
      if (!select || !value) return;
      var exists = Array.prototype.some.call(select.options, function (option) { return option.value === value; });
      if (!exists) select.insertAdjacentHTML("beforeend", optionHtml(value, label || value));
    }
    function setSelectValue(name, value, label) {
      var select = movementForm.elements[name];
      if (!select) return;
      ensureSelectOption(select, value, label);
      select.value = value || "";
    }
    function materialLabel(item) {
      return item.partNo + "｜" + item.materialName + (item.spec ? "｜" + String(item.spec).slice(0, 40) : "");
    }
    function mergeMaterialChoices(items) {
      var map = {};
      state.materialChoices.concat(items || []).forEach(function (item) {
        if (item && item.partNo) map[item.partNo] = item;
      });
      state.materialChoices = Object.keys(map).sort().map(function (partNo) { return map[partNo]; });
    }
    function populateMaterialSelect() {
      var select = movementForm.elements.partNo;
      var selected = select.value;
      var choices = state.materialChoices.length ? state.materialChoices : state.items;
      select.innerHTML = optionHtml("", choices.length ? "請選擇料號 / 物料" : "讀取物料主檔中...");
      choices.forEach(function (item) {
        select.insertAdjacentHTML("beforeend", optionHtml(item.partNo, materialLabel(item)));
      });
      if (selected) setSelectValue("partNo", selected, selected);
    }
    function loadMaterialChoices(offset) {
      var start = offset || 0;
      return fetch("/api/materials?limit=200&offset=" + start)
        .then(function (response) {
          if (!response.ok) throw new Error("API " + response.status);
          return response.json();
        })
        .then(function (data) {
          var items = Array.isArray(data.items) ? data.items : [];
          mergeMaterialChoices(items);
          populateMaterialSelect();
          var total = data.page && Number(data.page.total) || state.materialChoices.length;
          var nextOffset = start + items.length;
          if (items.length && nextOffset < total) return loadMaterialChoices(nextOffset);
          return null;
        })
        .catch(function () {
          populateMaterialSelect();
        });
    }
    function uniqueOptions(items, valueKey, labelFn) {
      var seen = {};
      return items.reduce(function (options, item) {
        var value = item[valueKey];
        if (!value || seen[value]) return options;
        seen[value] = true;
        options.push({ value: value, label: labelFn(item) });
        return options;
      }, []);
    }
    function populateSimpleSelect(name, emptyLabel, options) {
      var select = movementForm.elements[name];
      var selected = select.value;
      select.innerHTML = optionHtml("", emptyLabel);
      options.forEach(function (option) { select.insertAdjacentHTML("beforeend", optionHtml(option.value, option.label)); });
      if (selected) setSelectValue(name, selected, selected);
    }
    function populateRequestDrivenSelects() {
      populateSimpleSelect("equipmentNo", "請選擇設備", uniqueOptions(state.requests, "equipmentNo", function (item) {
        return item.equipmentNo + "｜" + (item.equipmentName || item.location || "未命名設備");
      }));
      populateSimpleSelect("workOrderNo", "未關聯工單", uniqueOptions(state.requests, "workOrderNo", function (item) {
        return item.workOrderNo + "｜" + item.materialName;
      }));
      populateSimpleSelect("custodianName", "請選擇人員 / 單位", uniqueOptions(state.requests, "requester", function (item) {
        return item.requester;
      }));
    }
    function warehouseLabel(item) {
      return item.warehouse_code + "｜" + item.warehouse_name;
    }
    function populateWarehouseSelects() {
      ["sourceWarehouseCode", "destinationWarehouseCode"].forEach(function (name) {
        var select = movementForm.elements[name];
        var selected = select.value;
        select.innerHTML = optionHtml("", state.warehouses.length ? "請選擇倉庫" : "讀取倉庫中...");
        state.warehouses.forEach(function (warehouse) {
          select.insertAdjacentHTML("beforeend", optionHtml(warehouse.warehouse_code, warehouseLabel(warehouse)));
        });
        if (selected) setSelectValue(name, selected, selected);
      });
    }
    function populateBinSelect(name, bins, selectedValue) {
      var select = movementForm.elements[name];
      if (!select || select.tagName !== "SELECT") {
        if (select) select.value = selectedValue || "";
        return;
      }
      select.innerHTML = optionHtml("", "自動挑選");
      (bins || []).forEach(function (bin) {
        if (bin && bin.is_active !== false) select.insertAdjacentHTML("beforeend", optionHtml(bin.bin_code, bin.bin_code + (bin.description ? "｜" + bin.description : "")));
      });
      if (selectedValue) setSelectValue(name, selectedValue, selectedValue);
    }
    function loadBinsForWarehouse(warehouseCode, fieldName, selectedValue) {
      var select = movementForm.elements[fieldName];
      if (!select || select.tagName !== "SELECT") {
        if (select) select.value = selectedValue || "";
        return Promise.resolve();
      }
      var code = String(warehouseCode || "").trim();
      if (!code) {
        populateBinSelect(fieldName, [], selectedValue);
        return Promise.resolve();
      }
      if (state.warehouseBins[code]) {
        populateBinSelect(fieldName, state.warehouseBins[code], selectedValue);
        return Promise.resolve();
      }
      populateBinSelect(fieldName, [], selectedValue);
      return fetch("/api/warehouses/" + encodeURIComponent(code) + "/bins")
        .then(function (response) {
          if (!response.ok) throw new Error("API " + response.status);
          return response.json();
        })
        .then(function (data) {
          state.warehouseBins[code] = data.bins || [];
          populateBinSelect(fieldName, state.warehouseBins[code], selectedValue);
        })
        .catch(function () {
          populateBinSelect(fieldName, [], selectedValue);
        });
    }
    function refreshBinSelects() {
      loadBinsForWarehouse(movementForm.elements.sourceWarehouseCode.value, "sourceBinCode", movementForm.elements.sourceBinCode.value);
      loadBinsForWarehouse(movementForm.elements.destinationWarehouseCode.value, "destinationBinCode", movementForm.elements.destinationBinCode.value);
    }
    function loadWarehouses() {
      return fetch("/api/warehouses")
        .then(function (response) {
          if (!response.ok) throw new Error("API " + response.status);
          return response.json();
        })
        .then(function (data) {
          state.warehouses = Array.isArray(data.items) ? data.items : [];
          populateWarehouseSelects();
          applyMovementDefaults(movementForm.elements.movementType.value || "ISSUE");
        })
        .catch(function () {
          populateWarehouseSelects();
        });
    }
    function setView(viewName) {
      Array.prototype.forEach.call(document.querySelectorAll(".view"), function (view) {
        view.classList.toggle("active", view.id === viewName + "View");
      });
      Array.prototype.forEach.call(document.querySelectorAll("[data-view-button]"), function (button) {
        button.classList.toggle("active", button.getAttribute("data-view-button") === viewName);
      });
      document.getElementById("pageTitle").textContent = titles[viewName][0];
      document.getElementById("pageSub").textContent = titles[viewName][1];
      if (viewName === "materials" && !state.items.length) loadMaterials();
    }
    function adviceFor(item) {
      if (item.stock && item.stock.stockAdvice) return item.stock.stockAdvice;
      if (number(item.stock && item.stock.availableQty) <= number(item.reorderPoint)) return "需檢討";
      return "正常";
    }
    function toneFor(item) {
      var advice = adviceFor(item);
      if (advice.indexOf("請購") !== -1 || number(item.stock && item.stock.availableQty) <= 0) return "danger";
      if (advice.indexOf("檢討") !== -1) return "warning-text";
      return "ok";
    }
    function apiPath() {
      var params = new URLSearchParams();
      params.set("limit", state.limit);
      params.set("offset", state.offset);
      if (state.query) params.set("search", state.query);
      if (state.filter === "needPurchase") params.set("needPurchase", "true");
      return "/api/materials?" + params.toString();
    }
    function loadMaterials() {
      statusText.textContent = "讀取中...";
      rows.innerHTML = '<tr><td colspan="9" class="empty">讀取中...</td></tr>';
      fetch(apiPath())
        .then(function (response) {
          if (!response.ok) throw new Error("API " + response.status);
          return response.json();
        })
        .then(function (data) {
          state.items = Array.isArray(data.items) ? data.items : [];
          state.total = data.page && data.page.total !== undefined ? Number(data.page.total) : state.items.length;
          mergeMaterialChoices(state.items);
          populateMaterialSelect();
          renderRows();
          renderDashboard();
        })
        .catch(function (error) {
          rows.innerHTML = '<tr><td colspan="9" class="empty">讀取失敗：' + escapeHtml(error.message) + '</td></tr>';
          statusText.textContent = "資料庫連線失敗";
        });
    }
    function renderRows() {
      var start = state.total ? state.offset + 1 : 0;
      var end = Math.min(state.offset + state.items.length, state.total);
      statusText.textContent = "顯示 " + start.toLocaleString("zh-TW") + " - " + end.toLocaleString("zh-TW") + " / " + state.total.toLocaleString("zh-TW") + " 筆";
      prev.disabled = state.offset <= 0;
      next.disabled = state.offset + state.limit >= state.total;
      if (!state.items.length) {
        rows.innerHTML = '<tr><td colspan="9" class="empty">沒有符合資料</td></tr>';
        return;
      }
      rows.innerHTML = state.items.map(function (item) {
        var stock = item.stock || {};
        var selected = item.partNo === state.selectedPartNo ? " selected" : "";
        return [
          '<tr class="' + selected + '" data-part-no="' + escapeHtml(item.partNo) + '">',
          '<td><span class="part">' + escapeHtml(item.partNo) + '</span></td>',
          '<td><strong>' + escapeHtml(item.materialName) + '</strong><span class="muted">' + escapeHtml(item.spec || "-") + '</span></td>',
          '<td>' + escapeHtml(item.systemName || "-") + '<span class="muted">' + escapeHtml(item.materialType || "-") + '</span></td>',
          '<td><span class="pill">' + escapeHtml(item.materialProperty || "-") + '</span></td>',
          '<td>' + qty(stock.availableQty) + '</td>',
          '<td>' + qty(number(stock.issuedQty) + number(stock.inUseQty)) + '</td>',
          '<td>' + qty(stock.totalTrackedQty) + '</td>',
          '<td>' + qty(item.reorderPoint) + '</td>',
          '<td class="' + toneFor(item) + '">' + escapeHtml(adviceFor(item)) + '</td>',
          '</tr>'
        ].join("");
      }).join("");
    }
    function loadDetail(partNo) {
      state.selectedPartNo = partNo;
      renderRows();
      detail.innerHTML = '<h2>' + escapeHtml(partNo) + '</h2><div class="empty">讀取明細中...</div>';
      fetch("/api/materials/" + encodeURIComponent(partNo))
        .then(function (response) {
          if (!response.ok) throw new Error("API " + response.status);
          return response.json();
        })
        .then(function (data) {
          renderDetail(data.item, data.locations || []);
        })
        .catch(function (error) {
          detail.innerHTML = '<h2>' + escapeHtml(partNo) + '</h2><div class="empty">讀取失敗：' + escapeHtml(error.message) + '</div>';
        });
    }
    function renderDetail(item, locations) {
      var stock = item.stock || {};
      var locationHtml = locations.length ? locations.map(function (location) {
        return '<div class="location"><strong>' + escapeHtml(location.warehouse_name) + ' / ' + escapeHtml(location.bin_code || "-") + '</strong><span>' + escapeHtml(location.stock_status) + '：' + qty(location.qty) + ' ' + escapeHtml(item.unit || "") + '</span></div>';
      }).join("") : '<div class="empty">沒有儲位資料</div>';
      detail.innerHTML = [
        '<h2>' + escapeHtml(item.partNo) + '</h2>',
        '<div class="sub">' + escapeHtml(item.materialName) + '</div>',
        '<div class="detail-grid">',
        field("規格", item.spec || "-"),
        field("單位", item.unit || "-"),
        field("系統別", item.systemName || "-"),
        field("物料類型", item.materialType || "-"),
        field("物料屬性", item.materialProperty || "-"),
        field("可發料", qty(stock.availableQty)),
        field("已領出 / 使用中", qty(number(stock.issuedQty) + number(stock.inUseQty))),
        field("追蹤總量", qty(stock.totalTrackedQty)),
        field("請購點", qty(item.reorderPoint)),
        field("資料備註", item.reviewNote || "-"),
        '</div>',
        '<div class="locations">' + locationHtml + '</div>'
      ].join("");
    }
    function field(label, value) {
      return '<div class="field"><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(value) + '</strong></div>';
    }
    function renderDashboard() {
      if (!state.selectedRequestId && state.requests.length) state.selectedRequestId = state.requests[0].id;
      var pending = state.requests.filter(function (item) { return item.status === "待審核"; }).length;
      var approved = state.requests.filter(function (item) { return item.status === "已核准"; }).length;
      var shortage = state.items.filter(function (item) {
        return adviceFor(item).indexOf("請購") !== -1 || number(item.stock && item.stock.availableQty) <= 0;
      }).length;
      document.getElementById("pendingCount").textContent = pending;
      document.getElementById("approvedCount").textContent = approved;
      document.getElementById("materialTotal").textContent = state.total.toLocaleString("zh-TW");
      document.getElementById("shortageCount").textContent = shortage.toLocaleString("zh-TW");
      document.getElementById("dashboardRequests").innerHTML = requestCardsHtml(state.requests.slice(0, 3), true);
      document.getElementById("requestList").innerHTML = requestCardsHtml(state.requests, false);
      renderRequestDetail();
    }
    function requestCardsHtml(items, compact) {
      if (!items.length) return '<div class="empty">目前沒有申請</div>';
      return items.map(function (item) {
        var active = item.id === state.selectedRequestId ? " active" : "";
        var material = materialForRequest(item);
        var available = material ? number(material.stock && material.stock.availableQty) : null;
        var enough = material ? available >= number(item.qty) : null;
        var stockText = material ? (enough ? "庫存足夠" : "庫存不足") : "待同步庫存";
        var stockClass = material && enough ? "" : " warn";
        var listActions = compact ? '' : [
          '<div class="request-actions">',
          '<button class="secondary" data-request-select="' + escapeHtml(item.id) + '" type="button">查看審核明細</button>',
          '</div>'
        ].join("");
        return [
          '<div class="request-card' + active + '" data-request-id="' + escapeHtml(item.id) + '">',
          '<div class="request-card-head"><strong>' + escapeHtml(item.id) + '</strong><span class="status-badge ' + statusClass(item.status) + '">' + escapeHtml(item.status) + '</span></div>',
          '<span class="request-title">' + escapeHtml(item.materialName) + '</span>',
          '<div class="request-meta">',
          '<span>工單：' + escapeHtml(item.workOrderNo) + '</span>',
          '<span>料號：' + escapeHtml(item.partNo) + '</span>',
          '<span>數量：' + qty(item.qty) + ' ' + escapeHtml(item.unit) + '</span>',
          '<span>申請：' + escapeHtml(item.requester) + '</span>',
          '<span>需求：' + escapeHtml(item.requiredDate || "-") + '</span>',
          '<span class="stock-badge' + stockClass + '">' + escapeHtml(stockText) + '</span>',
          '</div>',
          listActions,
          '</div>'
        ].join("");
      }).join("");
    }
    function statusClass(status) {
      if (status === "待審核") return "pending";
      if (status === "已核准") return "approved";
      if (status === "已建單") return "approved";
      if (status === "退回") return "rejected";
      return "";
    }
    function materialForRequest(item) {
      return state.requestMaterialCache[item.partNo] || state.items.find(function (material) { return material.partNo === item.partNo; }) || null;
    }
    function requestHasEnoughStock(item) {
      var material = materialForRequest(item);
      if (!material) return false;
      return number(material.stock && material.stock.availableQty) >= number(item.qty);
    }
    function requestActionsHtml(item, material) {
      var disabledApprove = item.status !== "待審核" ? " disabled" : "";
      if (item.status === "待審核" && material && number(material.stock && material.stock.availableQty) < number(item.qty)) disabledApprove = " disabled";
      if (item.status === "待審核" && !material) disabledApprove = " disabled";
      var disabledReject = item.status !== "待審核" ? " disabled" : "";
      return [
        '<button class="secondary" data-request-action="approve" data-request-id="' + escapeHtml(item.id) + '"' + disabledApprove + ' type="button">核准</button>',
        '<button class="danger" data-request-action="reject" data-request-id="' + escapeHtml(item.id) + '"' + disabledReject + ' type="button">退回</button>',
        '<button data-request-action="openMaterial" data-request-id="' + escapeHtml(item.id) + '" type="button">查主檔</button>'
      ].join("");
    }
    function renderRequestDetail() {
      var item = state.requests.find(function (request) { return request.id === state.selectedRequestId; });
      if (!item) {
        requestDetail.innerHTML = '<h2>審核明細</h2><div class="empty">點左側申請單查看工單、用途、庫存與審核判斷。</div>';
        return;
      }
      var material = materialForRequest(item);
      var locations = state.requestLocationsCache[item.partNo] || [];
      var stock = material && material.stock ? material.stock : {};
      var available = material ? number(stock.availableQty) : 0;
      var enough = material ? available >= number(item.qty) : false;
      var decisionClass = material ? (enough ? "ok" : "danger") : "warning-text";
      var decision = material ? (enough ? "可核准：庫存足夠，核准後可建立發料異動單。" : "不可直接核准：可發料不足，建議退回或改走請購。") : "同步庫存中：請稍後再核准。";
      var locationHtml = locations.length ? locations.map(function (location) {
        return '<div class="location"><strong>' + escapeHtml(location.warehouse_name) + ' / ' + escapeHtml(location.bin_code || "-") + '</strong><span>' + escapeHtml(location.stock_status) + '：' + qty(location.qty) + ' ' + escapeHtml(item.unit || "") + '</span></div>';
      }).join("") : '<div class="empty">正在同步或尚無儲位資料</div>';
      requestDetail.innerHTML = [
        '<div class="request-card-head"><div><h2>' + escapeHtml(item.id) + '</h2><div class="sub">' + escapeHtml(item.priority || "一般") + '｜' + escapeHtml(item.requestedAt || "-") + '</div></div><span class="status-badge ' + statusClass(item.status) + '">' + escapeHtml(item.status) + '</span></div>',
        '<div class="review-detail-grid">',
        field("工單 / 設備", item.workOrderNo + " / " + (item.equipmentName || item.equipmentNo || "-")),
        field("申請人 / 分機", item.requester + " / " + (item.phone || "-")),
        field("使用地點", item.location || "-"),
        field("需求日期", item.requiredDate || "-"),
        field("申請原因", item.reason || item.note || "-"),
        field("料號", item.partNo),
        field("物料名稱", item.materialName),
        field("規格", material && material.spec ? material.spec : "同步主檔後顯示"),
        field("申請數量", qty(item.qty) + " " + (item.unit || "")),
        field("目前可發料", material ? qty(available) + " " + (material.unit || item.unit || "") : "同步中"),
        field("建議來源", item.suggestedWarehouse || "-"),
        '<div class="decision-card"><span>審核判斷</span><strong class="' + decisionClass + '">' + escapeHtml(decision) + '</strong></div>',
        '</div>',
        '<div class="review-action-panel">',
        issueOrderPanelHtml(item),
        '<div class="field"><span>審核意見</span><textarea id="reviewNote" class="review-note" placeholder="只填審核意見；工單、用途、料號、數量由前台帶入">' + escapeHtml(item.reviewNote || "") + '</textarea></div>',
        '<div class="request-actions">' + requestActionsHtml(item, material) + '</div>',
        '</div>',
        '<div class="check-list">',
        checkItem(true, "工單確認", "核對工單、設備與使用地點是否對得上。"),
        checkItem(Boolean(item.reason || item.note), "用途確認", "申請原因需能說明為何要領這個料。"),
        checkItem(Boolean(material), "主檔確認", material ? "已同步物料主檔與規格。" : "正在同步物料主檔。"),
        checkItem(Boolean(material) && enough, "庫存確認", material ? ("申請 " + qty(item.qty) + "，目前可發料 " + qty(available) + "。") : "庫存同步後才可核准。"),
        '</div>',
        '<div class="locations">' + locationHtml + '</div>'
      ].join("");
      loadRequestMaterial(item);
    }
    function checkItem(ok, title, body) {
      return '<div class="check-item"><span class="check-dot' + (ok ? '' : ' warn') + '"></span><span><strong>' + escapeHtml(title) + '</strong>' + escapeHtml(body) + '</span></div>';
    }
    function warehouseOptionsHtml(selected) {
      var options = [optionHtml("", "請選擇倉庫")];
      state.warehouses.forEach(function (warehouse) {
        options.push(optionHtml(warehouse.warehouse_code, warehouseLabel(warehouse)));
      });
      if (selected && !state.warehouses.some(function (warehouse) { return warehouse.warehouse_code === selected; })) {
        options.push(optionHtml(selected, selected));
      }
      return options.join("").replace('value="' + escapeHtml(selected || "") + '"', 'value="' + escapeHtml(selected || "") + '" selected');
    }
    function stockStatusOptionsHtml(selected) {
      var labels = {
        AVAILABLE: "AVAILABLE｜可發料",
        ISSUED: "ISSUED｜已領料",
        IN_USE: "IN_USE｜使用中",
        QUARANTINE: "QUARANTINE｜待判定",
        REPAIR: "REPAIR｜維修中",
        SCRAPPED: "SCRAPPED｜報廢"
      };
      return Object.keys(labels).map(function (value) {
        return '<option value="' + value + '"' + (value === selected ? ' selected' : '') + '>' + labels[value] + '</option>';
      }).join("");
    }
    function binOptionsHtml(warehouseCode, selected) {
      var bins = state.warehouseBins[warehouseCode] || [];
      var options = [optionHtml("", "自動挑選")];
      bins.forEach(function (bin) {
        if (bin && bin.is_active !== false) options.push(optionHtml(bin.bin_code, bin.bin_code + (bin.description ? "｜" + bin.description : "")));
      });
      if (selected && !bins.some(function (bin) { return bin.bin_code === selected; })) options.push(optionHtml(selected, selected));
      return options.join("").replace('value="' + escapeHtml(selected || "") + '"', 'value="' + escapeHtml(selected || "") + '" selected');
    }
    function issueOrderPanelHtml(item) {
      var sourceWarehouse = defaults.ISSUE.sourceWarehouseCode;
      var destinationWarehouse = defaults.ISSUE.destinationWarehouseCode;
      var sourceStatus = defaults.ISSUE.sourceStockStatus;
      var destinationStatus = defaults.ISSUE.destinationStockStatus;
      var isApproved = item.status === "已核准";
      var isIssued = item.status === "已建單";
      var isRejected = item.status === "退回";
      var statusText = isIssued ? "已完成發料" : (isRejected ? "已退回，無需發料" : "核准後可發料");
      var headNote = isApproved ? "審核已核准，可直接確認發料。" : "前台資料已帶入，倉庫先核對；核准後才能發料。";
      var footerHtml = isApproved
        ? '<div class="form-actions"><button type="submit" class="primary">確認發料</button></div>'
        : '<div class="issue-order-status">' + escapeHtml(statusText) + '</div>';
      return [
        '<form id="inlineIssueOrder" class="issue-order-panel" data-request-id="' + escapeHtml(item.id) + '">',
        '<div class="issue-order-inline-head"><strong>發料設定</strong><span>' + escapeHtml(headNote) + '</span></div>',
        '<div class="form-grid">',
        '<div class="form-field"><label>來源倉庫</label><select name="sourceWarehouseCode" required>' + warehouseOptionsHtml(sourceWarehouse) + '</select></div>',
        '<div class="form-field"><label>來源庫存狀態</label><select name="sourceStockStatus">' + stockStatusOptionsHtml(sourceStatus) + '</select></div>',
        '<input name="sourceBinCode" type="hidden" value="">',
        '<div class="form-field"><label>目的倉庫</label><select name="destinationWarehouseCode" required>' + warehouseOptionsHtml(destinationWarehouse) + '</select></div>',
        '<div class="form-field"><label>目的庫存狀態</label><select name="destinationStockStatus">' + stockStatusOptionsHtml(destinationStatus) + '</select></div>',
        '<input name="destinationBinCode" type="hidden" value="">',
        '<div class="form-field wide"><label>發料備註</label><textarea name="note">' + escapeHtml(item.id + "｜" + item.note) + '</textarea></div>',
        '</div>',
        footerHtml,
        '</form>'
      ].join("");
    }
    function ensureIssuePanelBins(item) {
      if (!item) return;
      ["source", "destination"].forEach(function (kind) {
        var warehouseCode = kind === "source" ? defaults.ISSUE.sourceWarehouseCode : defaults.ISSUE.destinationWarehouseCode;
        if (!warehouseCode || state.warehouseBins[warehouseCode]) return;
        fetch("/api/warehouses/" + encodeURIComponent(warehouseCode) + "/bins")
          .then(function (response) {
            if (!response.ok) throw new Error("API " + response.status);
            return response.json();
          })
          .then(function (data) {
            state.warehouseBins[warehouseCode] = data.bins || [];
            if (state.selectedRequestId === item.id) renderRequestDetail();
          })
          .catch(function () {});
      });
    }
    function selectRequest(id) {
      state.selectedRequestId = id;
      renderDashboard();
    }
    function openRequestFromDashboard(id) {
      state.selectedRequestId = id;
      setView("requests");
      renderDashboard();
      requestDetail.scrollTop = 0;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    function loadRequestMaterial(item) {
      if (!item || state.requestMaterialCache[item.partNo]) return;
      fetch("/api/materials/" + encodeURIComponent(item.partNo))
        .then(function (response) {
          if (!response.ok) throw new Error("API " + response.status);
          return response.json();
        })
        .then(function (data) {
          state.requestMaterialCache[item.partNo] = data.item;
          state.requestLocationsCache[item.partNo] = data.locations || [];
          renderDashboard();
        })
        .catch(function () {
          state.requestMaterialCache[item.partNo] = { partNo: item.partNo, materialName: item.materialName, unit: item.unit, stock: {}, spec: "主檔讀取失敗" };
          state.requestLocationsCache[item.partNo] = [];
          renderRequestDetail();
        });
    }
    function updateRequest(action, id) {
      var target = state.requests.find(function (item) { return item.id === id; });
      if (!target) return;
      var noteInput = document.getElementById("reviewNote");
      if (noteInput) target.reviewNote = noteInput.value.trim();
      if (action === "approve") {
        if (!requestHasEnoughStock(target)) {
          showToast("庫存不足或尚未同步，不能直接核准：" + id);
          return;
        }
        target.status = "已核准";
        target.reviewedAt = new Date().toLocaleString("zh-TW", { hour12: false });
        showToast("已核准，可在申請明細內確認發料：" + id);
      } else if (action === "reject") {
        target.status = "退回";
        target.reviewedAt = new Date().toLocaleString("zh-TW", { hour12: false });
        showToast("已退回：" + id);
      } else if (action === "openMaterial") {
        setView("materials");
        loadDetail(target.partNo);
      }
      renderDashboard();
    }
    function fillMovementFromRequest(item) {
      movementForm.dataset.sourceRequestId = item.id;
      movementForm.elements.movementType.value = "ISSUE";
      applyMovementDefaults("ISSUE");
      setSelectValue("partNo", item.partNo, item.partNo + "｜" + item.materialName);
      movementForm.elements.qty.value = item.qty;
      setSelectValue("equipmentNo", item.equipmentNo, item.equipmentNo + "｜" + (item.equipmentName || item.location || "未命名設備"));
      setSelectValue("workOrderNo", item.workOrderNo, item.workOrderNo + "｜" + item.materialName);
      setSelectValue("custodianName", item.requester, item.requester);
      movementForm.elements.note.value = item.id + "｜" + item.note;
      setPrefilledMovement(true, item);
    }
    function setPrefilledMovement(prefilled, item) {
      ["partNo", "equipmentNo", "workOrderNo", "custodianName"].forEach(function (name) {
        movementForm.elements[name].disabled = Boolean(prefilled);
      });
      movementForm.elements.qty.readOnly = Boolean(prefilled);
      if (prefilled && item) {
        movementSource.classList.add("active");
        movementSource.textContent = "由前台申請 " + item.id + " 帶入：料號、設備、數量、工單、申請人不可在後台重填；倉庫只確認來源倉庫、目的倉庫與庫存狀態後建立異動單。";
      } else {
        delete movementForm.dataset.sourceRequestId;
        movementSource.classList.remove("active");
        movementSource.textContent = "";
      }
    }
    function applyMovementDefaults(type) {
      var data = defaults[type] || defaults.ISSUE;
      setSelectValue("sourceWarehouseCode", data.sourceWarehouseCode, data.sourceWarehouseCode);
      movementForm.elements.sourceStockStatus.value = data.sourceStockStatus;
      setSelectValue("destinationWarehouseCode", data.destinationWarehouseCode, data.destinationWarehouseCode);
      movementForm.elements.destinationStockStatus.value = data.destinationStockStatus;
      refreshBinSelects();
      if (!movementForm.elements.note.value || Object.keys(defaults).some(function (key) { return defaults[key].note === movementForm.elements.note.value; })) {
        movementForm.elements.note.value = data.note;
      }
    }
    function movementPayload() {
      function val(name) {
        var element = movementForm.elements[name];
        return String(element && element.value || "").trim();
      }
      return {
        movementType: val("movementType"),
        partNo: val("partNo"),
        qty: Number(val("qty")),
        sourceWarehouseCode: val("sourceWarehouseCode").toUpperCase(),
        sourceBinCode: val("sourceBinCode") || null,
        sourceStockStatus: val("sourceStockStatus"),
        destinationWarehouseCode: val("destinationWarehouseCode").toUpperCase(),
        destinationBinCode: val("destinationBinCode") || null,
        destinationStockStatus: val("destinationStockStatus"),
        equipmentNo: val("equipmentNo") || null,
        workOrderNo: val("workOrderNo") || null,
        custodianName: val("custodianName") || null,
        note: val("note") || null
      };
    }
    function submitMovement(event) {
      event.preventDefault();
      var payload = movementPayload();
      if (!payload.partNo || !payload.qty || payload.qty <= 0) {
        showToast("請填料號與正確數量");
        return;
      }
      fetch("/api/inventory/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (response) {
        return response.text().then(function (body) {
          var data = body ? JSON.parse(body) : {};
          if (!response.ok) throw new Error(data.error && data.error.message || "API " + response.status);
          return data;
        });
      }).then(function (data) {
        var doc = data.movement && data.movement.document && data.movement.document.document_no;
        showToast("已建立異動單：" + (doc || "完成"));
        loadMaterials();
      }).catch(function (error) {
        showToast("建立失敗：" + error.message);
      });
    }
    function inlineIssuePayload(form, item) {
      function val(name) {
        var element = form.elements[name];
        return String(element && element.value || "").trim();
      }
      return {
        movementType: "ISSUE",
        partNo: item.partNo,
        qty: Number(item.qty),
        sourceWarehouseCode: val("sourceWarehouseCode").toUpperCase(),
        sourceBinCode: val("sourceBinCode") || null,
        sourceStockStatus: val("sourceStockStatus"),
        destinationWarehouseCode: val("destinationWarehouseCode").toUpperCase(),
        destinationBinCode: val("destinationBinCode") || null,
        destinationStockStatus: val("destinationStockStatus"),
        equipmentNo: item.equipmentNo || null,
        workOrderNo: item.workOrderNo || null,
        custodianName: item.requester || null,
        note: val("note") || item.id + "｜" + item.note
      };
    }
    function submitInlineIssueOrder(event) {
      event.preventDefault();
      var form = event.target;
      var id = form.getAttribute("data-request-id");
      var item = state.requests.find(function (request) { return request.id === id; });
      if (!item) return;
      var payload = inlineIssuePayload(form, item);
      if (!payload.sourceWarehouseCode || !payload.destinationWarehouseCode) {
        showToast("請選擇來源倉庫與目的倉庫");
        return;
      }
      fetch("/api/inventory/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (response) {
        return response.text().then(function (body) {
          var data = body ? JSON.parse(body) : {};
          if (!response.ok) throw new Error(data.error && data.error.message || "API " + response.status);
          return data;
        });
      }).then(function (data) {
        var doc = data.movement && data.movement.document && data.movement.document.document_no;
        item.status = "已建單";
        item.issueDocumentNo = doc || "";
        renderDashboard();
        loadMaterials();
        showToast("已完成發料：" + (doc || item.id));
      }).catch(function (error) {
        showToast("建立失敗：" + error.message);
      });
    }
    function updateInlineBinSelect(selectName, warehouseCode, selectedValue) {
      var form = document.getElementById("inlineIssueOrder");
      if (!form) return;
      var select = form.elements[selectName];
      if (!select) return;
      var code = String(warehouseCode || "").trim();
      var render = function () {
        select.innerHTML = binOptionsHtml(code, selectedValue || "");
      };
      if (!code || state.warehouseBins[code]) {
        render();
        return;
      }
      select.innerHTML = optionHtml("", "讀取儲位中...");
      fetch("/api/warehouses/" + encodeURIComponent(code) + "/bins")
        .then(function (response) {
          if (!response.ok) throw new Error("API " + response.status);
          return response.json();
        })
        .then(function (data) {
          state.warehouseBins[code] = data.bins || [];
          render();
        })
        .catch(function () {
          select.innerHTML = optionHtml("", "自動挑選");
        });
    }
    function csvValue(value) {
      return '"' + String(value === undefined || value === null ? "" : value).replace(/"/g, '""') + '"';
    }
    function renderFormatGuide() {
      formatGuide.innerHTML = [
        '<div class="format-row"><strong>欄位</strong><strong>要求</strong><strong>範例</strong><strong>說明</strong></div>',
        importFieldDefs.map(function (field) {
          return [
            '<div class="format-row">',
            '<strong>' + escapeHtml(field.header) + '</strong>',
            '<span class="' + (field.required ? 'format-required' : 'format-optional') + '">' + (field.required ? '必填' : '選填') + '</span>',
            '<span>' + escapeHtml(field.sample || "-") + '</span>',
            '<span>' + escapeHtml(field.note || "-") + '</span>',
            '</div>'
          ].join("");
        }).join("")
      ].join("");
    }
    function downloadImportTemplate() {
      window.location.href = "/materials-db/import-template.csv";
    }
    function parseCsvLine(line) {
      var output = [];
      var current = "";
      var quoted = false;
      for (var i = 0; i < line.length; i += 1) {
        var char = line[i];
        if (char === '"') {
          if (quoted && line[i + 1] === '"') {
            current += '"';
            i += 1;
          } else {
            quoted = !quoted;
          }
        } else if (char === "," && !quoted) {
          output.push(current);
          current = "";
        } else {
          current += char;
        }
      }
      output.push(current);
      return output.map(function (value) { return value.replace(/^\\ufeff/, "").trim(); });
    }
    function previewImportFile(file) {
      if (!file) return;
      var name = file.name || "";
      if (!/\\.csv$/i.test(name)) {
        importNote.innerHTML = '<span>已選擇 ' + escapeHtml(name) + '。</span><span>目前請用「下載格式」整理後另存 CSV。</span>';
        importStatus.textContent = "目前先支援 CSV 格式檢查";
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var textContent = String(reader.result || "");
        var lines = textContent.split(/\\r?\\n/).filter(function (line) { return line.trim(); });
        var headers = lines.length ? parseCsvLine(lines[0]) : [];
        var missing = importHeaders.filter(function (name) { return headers.indexOf(name) === -1; });
        var missingRequired = importRequiredHeaders.filter(function (name) { return headers.indexOf(name) === -1; });
        var rowCount = Math.max(0, lines.length - 1);
        if (missing.length) {
          importNote.innerHTML = '<span>格式未符合，缺少欄位：' + escapeHtml(missing.join("、")) + '</span><span>請先下載格式再整理 Excel。</span>';
          importStatus.textContent = "格式未符合";
          return;
        }
        if (missingRequired.length) {
          importNote.innerHTML = '<span>必填欄位不足：' + escapeHtml(missingRequired.join("、")) + '</span><span>請先補齊再匯入。</span>';
          importStatus.textContent = "必填欄位不足";
          return;
        }
        importNote.innerHTML = '<span>已讀取 ' + escapeHtml(name) + '，共 ' + rowCount.toLocaleString("zh-TW") + ' 筆，欄位格式符合。</span><span>目前先做格式檢查；下一步可接預覽寫入。</span>';
        importStatus.textContent = "欄位格式符合，共 " + rowCount.toLocaleString("zh-TW") + " 筆";
      };
      reader.readAsText(file, "utf-8");
    }

    Array.prototype.forEach.call(document.querySelectorAll("[data-view-button]"), function (button) {
      button.addEventListener("click", function () { setView(button.getAttribute("data-view-button")); });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-go-view]"), function (button) {
      button.addEventListener("click", function () { setView(button.getAttribute("data-go-view")); });
    });
    rows.addEventListener("click", function (event) {
      var tr = event.target.closest("tr[data-part-no]");
      if (tr) loadDetail(tr.getAttribute("data-part-no"));
    });
    document.getElementById("dashboardRequests").addEventListener("click", function (event) {
      var card = event.target.closest("[data-request-id]");
      if (card) openRequestFromDashboard(card.getAttribute("data-request-id"));
    });
    document.getElementById("requestList").addEventListener("click", function (event) {
      var button = event.target.closest("[data-request-action]");
      if (button) {
        updateRequest(button.getAttribute("data-request-action"), button.getAttribute("data-request-id"));
        return;
      }
      var selectButton = event.target.closest("[data-request-select]");
      if (selectButton) {
        selectRequest(selectButton.getAttribute("data-request-select"));
        return;
      }
      var card = event.target.closest("[data-request-id]");
      if (card) selectRequest(card.getAttribute("data-request-id"));
    });
    requestDetail.addEventListener("click", function (event) {
      var button = event.target.closest("[data-request-action]");
      if (button) updateRequest(button.getAttribute("data-request-action"), button.getAttribute("data-request-id"));
    });
    requestDetail.addEventListener("submit", function (event) {
      if (event.target && event.target.id === "inlineIssueOrder") submitInlineIssueOrder(event);
    });
    requestDetail.addEventListener("change", function (event) {
      var select = event.target.closest("[data-inline-bin-target]");
      if (!select) return;
      updateInlineBinSelect(select.getAttribute("data-inline-bin-target"), select.value, "");
    });
    search.addEventListener("input", function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        state.query = search.value.trim();
        state.offset = 0;
        loadMaterials();
      }, 250);
    });
    filter.addEventListener("change", function () {
      state.filter = filter.value;
      state.offset = 0;
      loadMaterials();
    });
    reload.addEventListener("click", loadMaterials);
    prev.addEventListener("click", function () {
      state.offset = Math.max(0, state.offset - state.limit);
      loadMaterials();
    });
    next.addEventListener("click", function () {
      state.offset += state.limit;
      loadMaterials();
    });
    raw.addEventListener("click", function () { window.open(apiPath(), "_blank"); });
    template.addEventListener("click", downloadImportTemplate);
    template2.addEventListener("click", downloadImportTemplate);
    importExcel.addEventListener("click", function () { excelFile.click(); });
    importExcel2.addEventListener("click", function () { excelFile.click(); });
    excelFile.addEventListener("change", function () {
      previewImportFile(excelFile.files && excelFile.files[0]);
      excelFile.value = "";
    });
    movementForm.elements.movementType.addEventListener("change", function () {
      applyMovementDefaults(movementForm.elements.movementType.value);
    });
    movementForm.elements.sourceWarehouseCode.addEventListener("change", function () {
      loadBinsForWarehouse(movementForm.elements.sourceWarehouseCode.value, "sourceBinCode", "");
    });
    movementForm.elements.destinationWarehouseCode.addEventListener("change", function () {
      loadBinsForWarehouse(movementForm.elements.destinationWarehouseCode.value, "destinationBinCode", "");
    });
    movementForm.addEventListener("submit", submitMovement);
    document.getElementById("movementClear").addEventListener("click", function () {
      setPrefilledMovement(false);
      movementForm.reset();
      applyMovementDefaults("ISSUE");
    });

    populateRequestDrivenSelects();
    renderFormatGuide();
    populateMaterialSelect();
    populateWarehouseSelects();
    loadWarehouses();
    loadMaterialChoices();
    renderDashboard();
    loadMaterials();
  </script>
</body>
</html>`);
});

module.exports = router;
