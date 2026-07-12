/* =====================================================================
 * 故障工單管理(C 工單)原生模組 — 供預檢工單系統以分頁方式掛載
 * 用法:CWOModule.mount(containerElement) / CWOModule.unmount()
 * 資料:erp-api /api/work-orders(PostgreSQL);互鎖目錄:dispatch-catalog.js
 * 樣式:slate 色系(與預檢系統一致),全部限定在 #cwo-root 之下
 * ===================================================================== */
(function () {
  "use strict";
  const WO_API = "http://localhost:3001/api/work-orders";

  /* ---------- 參照常數(與 keeper 一致) ---------- */
  const STATUS = {
    0: { t: "報修", c: "#7fa9e0" }, 1: { t: "接單", c: "#6fa0c0" }, 2: { t: "派工", c: "#d8a020" },
    3: { t: "完工", c: "#2fbf8f" }, 4: { t: "覆核", c: "#3f9fd8" }, 5: { t: "結案", c: "#9fb0bc" },
    6: { t: "併單", c: "#9f8ad0" }, 7: { t: "轉單", c: "#b08ad0" }, 8: { t: "作廢", c: "#e07070" },
    9: { t: "缺料", c: "#e8903a" }, 10: { t: "觀察", c: "#4fc0c0" }
  };
  const STATUS_NAMES = { 0: "報修", 1: "接單", 2: "派工", 3: "完工", 4: "覆核", 5: "結案", 6: "併單", 7: "轉單", 8: "作廢", 9: "缺料", 10: "觀察" };
  const TRAINS = ["101車", "102車", "103車", "104車", "105車", "106車", "107車", "108車", "109車", "110車", "111車", "112車", "113車", "114車", "115車", "201車", "202車", "203車", "204車", "205車", "206車", "207車", "208車", "209車", "210車", "211車", "212車", "213車", "214車", "215車", "117車", "118車", "119車", "測台"];
  const LOC2 = ["1號車廂", "1號駕駛室", "2號車廂", "3號車廂", "4號車廂", "5號車廂", "5號駕駛室", "車軸1", "車軸2", "車軸3", "車軸4", "車軸5", "車軸6", "NA"];
  const ACTIONS = ["更換", "更換(使用廠商保固用料)", "重置", "重新安裝軟體", "車削", "添加", "互換", "修補", "調整", "鎖固", "清潔", "檢測正常", "合併工單", "專案處理(關閉)", "待重置", "待料更換", "不影響營運", "潤滑", "觀察", "賦歸", "移除", "黏固", "更換電池"];
  const WARRANTIES = ["A. 牽引馬達", "B. 齒輪箱", "C. 車間走道撓性元件", "D. 煞車卡鉗(不含煞車片)", "E. 空調機組", "F. 車門門機", "G. 車門與車窗之密封材料", "H. 車體塗裝及/或飾條", "I. 轉向架塗裝", "J. 集電弓(不含集電接觸片)", "K. 彈性車輪之橡膠元件", "L. 旅客資訊顯示器", "X非保固範圍X", "M.兩年保固用料"];
  const DANGERWORK = ["一、在活電下進入軌道(第三軌)緊急搶修作業、轉轍器維修及運轉操作等作業", "二、AC 16I/22.8KV GIS 及主變壓器檢修", "三、PPSS 750V 高速斷路器檢修", "四、PPSS GBSS 接地開關(GGBS) 檢修", "五、電力設備(22KV 開關盤、整流變壓器、阻環路開關、車站用變壓器)耐壓及功率因數試驗", "六、受電室高壓設備保養維修工作", "七、低壓高電流(600V以下、100伏特以上)之設備保養維修工作", "八、電聯車及軌道養護車推進、低壓供電及空調反向器設備活線檢修作業", "九、推進系統推進換流器盤測試", "十、靜態換流器(SIV)或電池充電器之靜態試驗", "十一、其它簽奉核可之活電作業。", "十二、地下車床車輪車削作業", "十三、高架作業(一)挑空區域照明及路燈更換", "十三、高架作業(二)排煙風門、探測器及灑水頭維修保養", "十三、高架作業(三)電聯車頂空調檢修排水孔檢修等車頂作業", "十三、高架作業(四)洗車機更換橫刷馬達作業", "十三、高架作業(五)供電電纜捲揚器、滑動式供電系統檢修作業", "十三、高架作業(六)起重機高空檢修作業", "十三、高架作業(七)站體設備(PIDS、PA、CCTV 等)檢修作業", "十三、高架作業(八)車站屋頂(含屋頂設備)、樑柱結構、建築裝修之檢修作業", "十三、高架作業(九)車站空調送風機維修保養", "十三、高架作業(十)軌道養護車輛車頂設備檢修作業", "十三、高架作業(十一)其他簽奉核可之高空檢修作業", "十四、從事電(扶)梯機坑或升降機頂端之檢修作業", "十五、局限空間/缺氧作業(一)廢水處理廠廢水處理池與儲槽內檢修作業", "十五、局限空間/缺氧作業(二)車站月台下方廊道檢修作業", "十五、局限空間/缺氧作業(三)豎坑內電纜更換作業", "十五、局限空間/缺氧作業(四)機廠涵洞內檢修作業", "十五、局限空間/缺氧作業(五)電纜人孔內部從事電纜檢修作業", "十五、局限空間/缺氧作業(六)日用水箱、消防水箱、集水坑、列車清洗儲水坑井內清潔及檢修作業", "十五、局限空間/缺氧作業(七)其它簽奉核可之局限空間作業", "十六、軌道鋁熱焊檢修作業"];

  /* ---------- 模組狀態 ---------- */
  let root = null, tickTimer = null;
  let ORDERS = [], loaded = false, loadError = null;
  let tablePage = 1; const pageSize = 100;
  let curOrder = null, filterOpen = false, sortByDeadline = false;
  let editTarget = null, finishOpen = false;
  let wSel = { sub: "", sym: "", comp: "", cause: "" };
  let FILTER = { dateFrom: "", dateTo: "", level: "", statuses: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false, 7: true, 8: true, 9: true, 10: true }, q: "", qr: "" };

  /* ---------- 小工具 ---------- */
  function esc(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function toast(m, err) {
    const t = document.createElement("div");
    t.className = "cwo-toast" + (err ? " err" : "");
    t.textContent = m;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }
  function lvText(l) { return l === 4 ? "未標示" : "LEVEL " + l; }
  function fmtRemain(diff, prefix) {
    const a = Math.abs(diff);
    const d = Math.floor(a / 86400000), h = Math.floor(a % 86400000 / 3600000), m = Math.floor(a % 3600000 / 60000), s = Math.floor(a % 60000 / 1000);
    return diff < 0 ? "逾期 " + d + "天 " + h + "小時 " + m + "分 " + s + "秒" : (prefix || "剩餘") + " " + d + "天 " + h + "小時 " + m + "分 " + s + "秒";
  }
  function remainHtml(o) {
    if ([3, 4, 5, 6, 8].includes(o.status)) return "";
    let h = "";
    const diff = new Date(o.deadline).getTime() - Date.now();
    h += '<div class="cwo-remain ' + (diff < 0 ? "over" : "") + '" data-cwodl="' + o.deadline + '">' + fmtRemain(diff) + "</div>";
    if (o.status === 10 && o.observeUntil) {
      const od = new Date(o.observeUntil).getTime() - Date.now();
      h += '<div class="cwo-remain obs" data-cwodl="' + o.observeUntil + '" data-pre="觀察剩餘">' + fmtRemain(od, "觀察剩餘") + "</div>";
    }
    return h;
  }

  /* ---------- API ---------- */
  async function loadOrders(force) {
    if (loaded && !force) return;
    loadError = null;
    try {
      const r = await fetch(WO_API + "?limit=5000");
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = await r.json();
      ORDERS = d.items.map((o, i) => Object.assign({}, o, { msid: i + 1, logs: o.logs || [], logsLoaded: false }));
      loaded = true;
    } catch (e) {
      loadError = e.message;
    }
    render();
  }
  async function loadLogs(o, after) {
    if (o.logsLoaded) { if (after) after(); return; }
    try {
      const r = await fetch(WO_API + "/" + encodeURIComponent(o.orderno) + "/events");
      const d = await r.json();
      o.logs = d.items || []; o.logsLoaded = true;
    } catch (e) { o.logsLoaded = true; }
    if (after) after();
  }
  function persistOrder(o) {
    fetch(WO_API + "/" + encodeURIComponent(o.orderno), {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: o.status, level: o.level, tsname: o.tsname, fdesc: o.fdesc, note: o.note })
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) { toast("寫入資料庫失敗:" + ((d.error && d.error.message) || ""), true); return; }
        if (d.row) { o.assignee = d.row.assignee || o.assignee; o.observeUntil = d.row.observeUntil || o.observeUntil; }
        o.logsLoaded = false; o.logs = [];
        render();
      })
      .catch((e) => toast("寫入資料庫失敗:" + e.message, true));
  }

  /* ---------- 篩選/統計 ---------- */
  function orderStats() {
    let overdue = 0, shortage = 0, observeDue = 0;
    const now = Date.now();
    for (const o of ORDERS) {
      if (o.status === 9) shortage++;
      if ([0, 1, 2].includes(o.status) && new Date(o.deadline).getTime() < now) overdue++;
      if (o.status === 10 && o.observeUntil && new Date(o.observeUntil).getTime() < now) observeDue++;
    }
    return { overdue, shortage, observeDue };
  }
  function filteredOrders() {
    let list = ORDERS.filter((o) => {
      if (!FILTER.statuses[o.status]) return false;
      if (FILTER.level !== "") { if (FILTER.level === "4") { if (o.level !== 4) return false; } else if (o.level != +FILTER.level) return false; }
      if (FILTER.dateFrom && o.createdate.slice(0, 10) < FILTER.dateFrom) return false;
      if (FILTER.dateTo && o.createdate.slice(0, 10) > FILTER.dateTo) return false;
      if (FILTER.q && !o.orderno.toLowerCase().includes(FILTER.q.toLowerCase())) return false;
      if (FILTER.qr && !(o.repair && o.repair.report && o.repair.report.includes(FILTER.qr))) return false;
      return true;
    });
    if (sortByDeadline) list = list.slice().sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    return list;
  }

  /* ---------- 對外掛載 ---------- */
  const CWO = {
    mount(container) {
      if (root) this.unmount();
      injectStyle();
      root = document.createElement("div");
      root.id = "cwo-root";
      container.appendChild(root);
      render();
      loadOrders(false);
      tickTimer = setInterval(() => {
        document.querySelectorAll("[data-cwodl]").forEach((el) => {
          const diff = new Date(el.dataset.cwodl).getTime() - Date.now();
          el.textContent = fmtRemain(diff, el.dataset.pre || "剩餘");
          if (!el.classList.contains("obs")) el.classList.toggle("over", diff < 0);
        });
      }, 1000);
    },
    unmount() {
      if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
      closeModal();
      if (root && root.parentElement) root.parentElement.removeChild(root);
      root = null;
    },
    /* 供 inline onclick 使用 */
    setF, setSt, allSt, resetF, setPage, toggleFilter, toggleSort, exportCsv,
    openOrder, backToList, openEditModal, closeModal, saveEditModal, createFinish,
    toggleFinish, setWSel, setCause, addImg, refresh: () => loadOrders(true)
  };
  window.CWOModule = CWO;
  window.CWO = CWO;

  function setF(k, v) { FILTER[k] = v; tablePage = 1; render(); }
  function setSt(k, v) { FILTER.statuses[k] = v; tablePage = 1; render(); }
  function allSt(v) { Object.keys(FILTER.statuses).forEach((k) => (FILTER.statuses[k] = v)); tablePage = 1; render(); }
  function resetF() { FILTER = { dateFrom: "", dateTo: "", level: "", statuses: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false, 7: true, 8: true, 9: true, 10: true }, q: "", qr: "" }; tablePage = 1; render(); }
  function setPage(p) { tablePage = p; render(); if (root) root.scrollIntoView({ block: "start" }); }
  function toggleFilter() { filterOpen = !filterOpen; render(); }
  function toggleSort() { sortByDeadline = !sortByDeadline; render(); }
  function toggleFinish() { finishOpen = !finishOpen; renderEditModal(); }

  /* ---------- 主渲染 ---------- */
  function render() {
    if (!root) return;
    if (loadError) {
      root.innerHTML = '<div class="cwo-panel" style="text-align:center;padding:50px"><div style="font-size:16px;font-weight:700;margin-bottom:8px">⚠ 無法連線 erp-api</div>' +
        '<div class="cwo-mut">' + esc(loadError) + ' — 請確認 API(localhost:3001)與資料庫(5433)已啟動</div>' +
        '<button class="cwo-btn" style="margin-top:14px" onclick="CWO.refresh()">重試</button></div>';
      return;
    }
    if (!loaded) {
      root.innerHTML = '<div class="cwo-panel" style="text-align:center;padding:50px" class="cwo-mut">工單資料載入中…</div>';
      return;
    }
    root.innerHTML = curOrder ? viewDetail() : viewOrders();
  }

  function viewOrders() {
    const st = orderStats();
    const all = filteredOrders();
    const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
    if (tablePage > totalPages) tablePage = 1;
    const rows = all.slice((tablePage - 1) * pageSize, tablePage * pageSize);
    return '<div class="cwo-title">工單管理 <span class="cwo-mut" style="font-size:13px;font-weight:400">資料來源:erp-api / PostgreSQL · <button class="cwo-mini" onclick="CWO.refresh()">↻ 重新整理</button></span></div>' +
      '<p class="cwo-desc">依據日期、故障等級與系統別篩選工單,並可直接編輯工單內容。</p>' +
      '<div class="cwo-panel"><div class="cwo-h3">工單狀況</div><div class="cwo-cards">' +
      '<div class="cwo-scard"><div class="k">逾期工單</div><div class="v" style="color:#f87171">' + st.overdue + "</div></div>" +
      '<div class="cwo-scard"><div class="k">觀察截止工單</div><div class="v" style="color:#60a5fa">' + st.observeDue + "</div></div>" +
      '<div class="cwo-scard"><div class="k">缺料工單</div><div class="v" style="color:#fbbf24">' + st.shortage + "</div></div>" +
      "</div></div>" +
      '<div class="cwo-panel">' +
      '<div class="cwo-toolbar" style="justify-content:space-between"><div class="cwo-h3" style="margin:0">工單篩選</div>' +
      '<button class="cwo-btn" onclick="CWO.toggleFilter()">' + (filterOpen ? "隱藏" : "顯示") + " 工單篩選</button>" +
      '<button class="cwo-btn ' + (sortByDeadline ? "on" : "") + '" onclick="CWO.toggleSort()">依到期時間排序</button></div>' +
      (filterOpen ? filterPanel(all.length) : "") +
      "</div>" +
      '<div class="cwo-panel">' + pager(all.length, totalPages) +
      '<div style="overflow-x:auto"><table class="cwo-table"><thead><tr>' +
      "<th>建立日期</th><th>工單編號</th><th>嚴重等級</th><th>故障報修系統層</th><th>故障設備位置層</th><th>派工作業系統層</th><th>狀況</th><th>操作</th>" +
      "</tr></thead><tbody>" +
      (rows.length ? rows.map(rowHtml).join("") : '<tr><td colspan="8" style="text-align:center;padding:34px" class="cwo-mut">沒有符合條件的工單</td></tr>') +
      "</tbody></table></div></div>";
  }
  function filterPanel(count) {
    const stChks = Object.keys(STATUS_NAMES).map((k) =>
      '<label class="cwo-chk"><input type="checkbox" ' + (FILTER.statuses[k] ? "checked" : "") + ' onchange="CWO.setSt(' + k + ',this.checked)"/>' + STATUS_NAMES[k] + "</label>").join("");
    return '<div class="cwo-fgrid" style="margin-top:10px">' +
      '<div><label class="cwo-lbl">起始日期</label><input class="cwo-in" type="date" value="' + FILTER.dateFrom + '" onchange="CWO.setF(\'dateFrom\',this.value)"/></div>' +
      '<div><label class="cwo-lbl">結束日期</label><input class="cwo-in" type="date" value="' + FILTER.dateTo + '" onchange="CWO.setF(\'dateTo\',this.value)"/></div>' +
      '<div><label class="cwo-lbl">故障等級</label><select class="cwo-in" onchange="CWO.setF(\'level\',this.value)">' +
      '<option value="">全部</option><option value="4"' + (FILTER.level === "4" ? " selected" : "") + ">未標示</option>" +
      [1, 2, 3].map((l) => '<option value="' + l + '"' + (FILTER.level === String(l) ? " selected" : "") + ">LEVEL " + l + "</option>").join("") +
      "</select></div></div>" +
      '<div style="margin-top:10px"><label class="cwo-lbl">狀況</label>' +
      '<div class="cwo-toolbar" style="margin:4px 0"><button class="cwo-mini" onclick="CWO.allSt(true)">全選</button><button class="cwo-mini" onclick="CWO.allSt(false)">取消全選</button></div>' +
      '<div class="cwo-chkline">' + stChks + "</div></div>" +
      '<div style="margin-top:10px"><label class="cwo-lbl">搜尋工單</label><div class="cwo-srow">' +
      '<input class="cwo-in" id="cwoQ" placeholder="請輸入工單編號" value="' + esc(FILTER.q) + '"/>' +
      '<button class="cwo-btn" onclick="CWO.setF(\'q\',document.getElementById(\'cwoQ\').value)">搜尋</button></div></div>' +
      '<div style="margin-top:10px"><label class="cwo-lbl">完工報告搜尋</label><div class="cwo-srow">' +
      '<input class="cwo-in" id="cwoQR" placeholder="請輸入完工報告關鍵字" value="' + esc(FILTER.qr) + '"/>' +
      '<button class="cwo-btn" onclick="CWO.setF(\'qr\',document.getElementById(\'cwoQR\').value)">搜尋</button></div></div>' +
      '<div class="cwo-toolbar" style="justify-content:space-between;margin-top:10px"><span class="cwo-mut">符合條件的工單:' + count.toLocaleString() + " 筆</span>" +
      '<button class="cwo-btn" onclick="CWO.resetF()">重設條件</button></div>';
  }
  function pager(total, totalPages) {
    const opts = Array.from({ length: totalPages }, (_, i) =>
      '<option value="' + (i + 1) + '"' + (tablePage === i + 1 ? " selected" : "") + ">第 " + (i + 1) + " 頁</option>").join("");
    return '<div class="cwo-toolbar" style="justify-content:center">' +
      '<button class="cwo-btn primary" onclick="CWO.exportCsv()">匯出資料</button>' +
      '<button class="cwo-btn" ' + (tablePage <= 1 ? "disabled" : "") + ' onclick="CWO.setPage(' + (tablePage - 1) + ')">上一頁</button>' +
      '<span class="cwo-mut">第 ' + tablePage + " / " + totalPages + " 頁 · 顯示第 " + (total ? (tablePage - 1) * pageSize + 1 : 0) + " - " + Math.min(tablePage * pageSize, total) + " 筆,共 " + total.toLocaleString() + " 筆</span>" +
      '<button class="cwo-btn" ' + (tablePage >= totalPages ? "disabled" : "") + ' onclick="CWO.setPage(' + (tablePage + 1) + ')">下一頁</button>' +
      '<span class="cwo-mut">跳至頁面</span><select class="cwo-in" style="width:auto" onchange="CWO.setPage(+this.value)">' + opts + "</select></div>";
  }
  function pathHtml(arr, cls) {
    return (arr || []).map((p, i) =>
      '<div class="' + (i ? "sub " : "") + (cls || "") + '">' + (i ? "　".repeat(i - 1) + "⮑ " : "") + esc(p) + "</div>").join("");
  }
  function rowHtml(o) {
    const done = [3, 4, 5].includes(o.status);
    const wcls = done ? "wdone" : "";
    const s = STATUS[o.status] || { t: o.status, c: "#94a3b8" };
    return "<tr>" +
      '<td style="min-width:78px">' + o.createdate.slice(0, 10) + "<br>" + o.createdate.slice(11, 16) + "</td>" +
      '<td style="min-width:160px"><button class="cwo-link" onclick="CWO.openOrder(' + o.msid + ')">' + esc(o.orderno) + "</button>" + remainHtml(o) + "</td>" +
      '<td style="min-width:60px">' + lvText(o.level) + "</td>" +
      '<td class="cwo-path" style="min-width:200px">' + pathHtml(o.full_path) + "</td>" +
      '<td class="cwo-path" style="min-width:110px">' + pathHtml(o.loc) + "</td>" +
      '<td class="cwo-path ' + wcls + '" style="min-width:200px">' + pathHtml(o.wpath, wcls) + "</td>" +
      '<td><span class="cwo-pill" style="background:' + s.c + "22;color:" + s.c + ";border:1px solid " + s.c + '77">' + s.t + "</span></td>" +
      '<td><button class="cwo-edit" onclick="CWO.openEditModal(' + o.msid + ')">編輯</button></td>' +
      "</tr>";
  }
  function exportCsv() {
    const all = filteredOrders();
    const head = ["建立日期", "工單編號", "等級", "報修系統層", "設備位置層", "派工作業系統層", "狀況", "處理人員", "通報人", "到期日", "故障描述"];
    const lines = [head.join(",")].concat(all.map((o) => [o.createdate.replace("T", " "), o.orderno, lvText(o.level), (o.full_path || []).join(" > "), (o.loc || []).join(" > "), (o.wpath || []).join(" > "), (STATUS[o.status] || {}).t || o.status, o.assignee || "", o.uname || "", (o.deadline || "").slice(0, 10), (o.fdesc || "").replace(/"/g, "'")].map((x) => '"' + x + '"').join(",")));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "工單匯出.csv"; a.click();
    toast("已匯出 " + all.length + " 筆工單");
  }

  /* ---------- 詳情 ---------- */
  function openOrder(msid) {
    curOrder = ORDERS.find((o) => o.msid === msid) || null;
    render();
    if (root) root.scrollIntoView({ block: "start" });
    if (curOrder) loadLogs(curOrder, () => { if (curOrder) render(); });
  }
  function backToList() { curOrder = null; render(); }
  function viewDetail() {
    const o = curOrder;
    const s = STATUS[o.status] || { t: o.status, c: "#94a3b8" };
    return '<div class="cwo-title">工單管理</div>' +
      '<div class="cwo-toolbar" style="justify-content:space-between">' +
      '<button class="cwo-btn" onclick="CWO.backToList()">← 返回工單列表</button>' +
      '<button class="cwo-btn primary" onclick="CWO.openEditModal(' + o.msid + ')">編輯工單</button></div>' +
      '<div class="cwo-panel"><div class="cwo-h3">工單詳情 · ' + esc(o.orderno) + "</div>" +
      '<div class="cwo-dgrid">' +
      dcell("工單編號", esc(o.orderno) + remainHtml(o)) +
      dcell("建立日期", o.createdate.replace("T", " ").slice(0, 16)) +
      dcell("狀態", '<span class="cwo-pill" style="background:' + s.c + "22;color:" + s.c + ";border:1px solid " + s.c + '77">' + s.t + "</span>") +
      dcell("嚴重等級", lvText(o.level)) +
      dcell("主系統", esc((o.full_path || [])[0] || "電聯車系統")) +
      dcell("報修人員", esc(o.uname || "—")) +
      dcell("列車編號", esc(o.tsname || "—")) +
      dcell("處理人員", esc(o.assignee || "—")) +
      (o.shortageItem ? dcell("缺料品項", esc(o.shortageItem)) : "") +
      "</div>" +
      '<div class="cwo-h4">系統層級</div><div class="cwo-tree">' + pathHtml(o.full_path) + "</div>" +
      '<div class="cwo-h4">設備位置</div><div class="cwo-tree">' + pathHtml(o.loc) + "</div>" +
      '<div class="cwo-h4">派工作業系統層</div><div class="cwo-tree ' + ([3, 4, 5].includes(o.status) ? "wdone" : "") + '">' + pathHtml(o.wpath, [3, 4, 5].includes(o.status) ? "wdone" : "") + "</div>" +
      '<div class="cwo-h4">操作歷程</div>' +
      (o.logsLoaded
        ? ((o.logs || []).length ? o.logs.map((l) => '<div class="cwo-log"><div class="top"><span>' + esc(l.date) + "</span><span>" + esc(l.actor) + '</span></div><div class="act">' + esc(l.act) + "</div><div>" + esc(l.note) + "</div></div>").join("") : '<div class="cwo-mut">暫無操作紀錄。</div>')
        : '<div class="cwo-mut">操作歷程載入中…</div>') +
      '<div class="cwo-h4">故障描述</div><div class="cwo-box">' + esc(o.fdesc) + "</div>" +
      '<div class="cwo-h4">工單備註</div><div class="cwo-box">' + esc(o.note || "NA") + "</div>" +
      '<div class="cwo-h4">維修紀錄</div>' + (o.repair ? repairHtml(o.repair) : '<div class="cwo-mut">暫無維修紀錄。</div>') +
      "</div>";
  }
  function dcell(k, v) { return '<div class="cwo-dcell"><div class="k">' + k + '</div><div class="v">' + v + "</div></div>"; }
  function repairHtml(r) {
    return '<div class="cwo-repair"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">' +
      '<div style="font-weight:700">' + esc(r.who) + '<div class="cwo-mut" style="font-size:12px;font-weight:400">建立時間:' + esc(r.time) + "</div></div>" +
      '<span class="cwo-pill" style="background:#2fbf8f22;color:#2fbf8f;border:1px solid #2fbf8f77">已完工</span></div>' +
      '<div class="cwo-h4">完工報告</div><div class="cwo-box">' + esc(r.report) + "</div>" +
      '<div class="cwo-dgrid" style="margin-top:10px">' +
      dcell("處理動作", esc(r.action || "—")) +
      dcell("是否為旅客介面", esc(r.pax || "否")) +
      dcell("設備運轉/里程/次數", String(r.mileage || 0)) +
      (r.cause ? dcell("故障原因", esc(r.cause)) : "") +
      (r.warranty ? dcell("五年保固用料(廠商)", esc(r.warranty)) : "") +
      "</div>" +
      '<div class="cwo-mut" style="font-size:12px;margin-top:8px">接單時間:' + esc(r.accept || "—") + "</div>" +
      '<div style="display:flex;align-items:center;gap:8px;margin-top:8px;color:#2fbf8f;font-weight:700"><span>維修作業已完成</span><span class="cwo-cir">✓</span><span>最終完工報告</span></div></div>';
  }

  /* ---------- 編輯 modal ---------- */
  function openEditModal(msid) {
    editTarget = ORDERS.find((o) => o.msid === msid) || null;
    if (!editTarget) return;
    finishOpen = false;
    wSel = { sub: (editTarget.full_path || [])[1] || "", sym: "", comp: "", cause: "" };
    renderEditModal();
    loadLogs(editTarget, () => { if (editTarget && document.getElementById("cwo-modal-ov")) renderEditModal(); });
  }
  function closeModal() { const m = document.getElementById("cwo-modal-ov"); if (m) m.remove(); }
  function setWSel(k, v) {
    wSel[k] = v;
    if (k === "sub") { wSel.sym = ""; wSel.comp = ""; wSel.cause = ""; }
    if (k === "sym") { wSel.comp = ""; wSel.cause = ""; }
    if (k === "comp") { wSel.cause = ""; }
    renderEditModal();
  }
  function setCause(v) { wSel.cause = v; }
  function renderEditModal() {
    closeModal();
    const o = editTarget; if (!o) return;
    const ov = document.createElement("div");
    ov.id = "cwo-modal-ov";
    ov.innerHTML = '<div class="cwo-modal">' +
      '<div class="cwo-h3" style="display:flex;justify-content:space-between">編輯工單 #' + esc(o.orderno) +
      '<button class="cwo-x" onclick="CWO.closeModal()">✕</button></div>' +
      '<div class="cwo-fgrid">' +
      '<div><label class="cwo-lbl">建立日期</label><div class="cwo-ro">' + o.createdate.replace("T", " ").slice(0, 16) + "</div></div>" +
      '<div><label class="cwo-lbl">故障等級 <span class="cwo-hint">未能判斷,請選擇 未標示</span></label><select class="cwo-in" id="cwoLv">' +
      '<option value="">請選擇等級</option><option value="4"' + (o.level === 4 ? " selected" : "") + ">未標示</option>" +
      [1, 2, 3].map((l) => '<option value="' + l + '"' + (o.level === l ? " selected" : "") + ">LEVEL " + l + "</option>").join("") + "</select></div></div>" +
      '<div style="margin-top:10px"><label class="cwo-lbl">狀態 <span class="cwo-hint">請選擇狀態,進行作業</span></label><select class="cwo-in" id="cwoSt">' +
      '<option value="">請選擇狀態</option>' + Object.keys(STATUS_NAMES).map((k) => '<option value="' + k + '"' + (o.status == k ? " selected" : "") + ">" + STATUS_NAMES[k] + "</option>").join("") + "</select></div>" +
      '<div style="margin-top:10px"><label class="cwo-lbl">故障報修系統層</label><div class="cwo-ro cwo-tree">' + pathHtml(o.full_path) + "</div></div>" +
      '<div style="margin-top:10px"><label class="cwo-lbl">列車編號</label><select class="cwo-in" id="cwoTrain"><option value="">請選擇列車編號</option>' +
      TRAINS.map((t) => "<option" + (o.tsname === t ? " selected" : "") + ">" + t + "</option>").join("") + "</select></div>" +
      '<div style="margin-top:10px"><label class="cwo-lbl">故障描述 <span class="cwo-hint">僅報修者可修改</span></label><textarea class="cwo-in" id="cwoDesc" rows="3">' + esc(o.fdesc) + "</textarea></div>" +
      '<div style="margin-top:10px"><label class="cwo-lbl">備註 <span class="cwo-hint">若需注記,請管理者於此填寫</span></label><textarea class="cwo-in" id="cwoNote" rows="2">' + esc(o.note === "NA" ? "" : o.note || "") + "</textarea></div>" +
      '<div style="margin-top:12px"><label class="cwo-lbl">操作歷程</label>' +
      (o.logsLoaded
        ? ((o.logs || []).length ? o.logs.map((l) => '<div class="cwo-log"><div class="top"><span>' + esc(l.date) + "</span><span>" + esc(l.actor) + '</span></div><div class="act">' + esc(l.act) + "</div><div>" + esc(l.note) + "</div></div>").join("") : '<div class="cwo-ro cwo-mut">暫無操作紀錄。</div>')
        : '<div class="cwo-ro cwo-mut">載入中…</div>') + "</div>" +
      '<div style="font-weight:700;margin-top:12px">完工作業資料建立</div>' +
      '<div class="cwo-collapse" onclick="CWO.toggleFinish()">' + (finishOpen ? "▲ 收合完工表單" : "▼ 建立完工資料") + "</div>" +
      (finishOpen ? finishFormHtml(o) : "") +
      '<div class="cwo-toolbar" style="justify-content:flex-end;margin-top:14px">' +
      '<button class="cwo-btn" onclick="CWO.closeModal()">取消</button>' +
      '<button class="cwo-btn primary" onclick="CWO.saveEditModal()">儲存變更</button></div>' +
      "</div>";
    ov.addEventListener("click", (e) => { if (e.target === ov) closeModal(); });
    document.body.appendChild(ov);
  }
  function finishFormHtml(o) {
    const CAT = window.DISPATCH_CATALOG || [];
    const subs = [...new Set(CAT.map((r) => r[0]))];
    const syms = wSel.sub ? [...new Set(CAT.filter((r) => r[0] === wSel.sub).map((r) => r[1]))] : [];
    const comps = wSel.sym ? [...new Set(CAT.filter((r) => r[0] === wSel.sub && r[1] === wSel.sym).map((r) => r[2]))] : [];
    const causes = wSel.comp ? [...new Set(CAT.filter((r) => r[0] === wSel.sub && r[1] === wSel.sym && r[2] === wSel.comp).map((r) => r[3]))] : [];
    const sel = (id, items, cur, handler, dis) =>
      '<select class="cwo-in" onchange="' + handler + '" ' + (dis ? "disabled" : "") + '><option value="">請選擇</option>' +
      items.map((s) => "<option" + (cur === s ? " selected" : "") + ">" + esc(s) + "</option>").join("") + "</select>";
    return '<div class="cwo-sub">' +
      '<div style="font-weight:700;margin-bottom:8px">派工系統層設定 (若需修改)</div>' +
      '<div class="cwo-fgrid">' +
      '<div><label class="cwo-lbl">主系統 <span class="cwo-hint">主系統不可變動</span></label><select class="cwo-in" disabled><option>電聯車系統</option></select></div>' +
      '<div><label class="cwo-lbl">子系統</label>' + sel("s", subs, wSel.sub, "CWO.setWSel('sub',this.value)", false) + "</div>" +
      '<div><label class="cwo-lbl">故障徵狀</label>' + sel("y", syms, wSel.sym, "CWO.setWSel('sym',this.value)", !syms.length) + "</div>" +
      '<div><label class="cwo-lbl">故障零組件</label>' + sel("c", comps, wSel.comp, "CWO.setWSel('comp',this.value)", !comps.length) + "</div>" +
      '<div><label class="cwo-lbl">故障原因</label><select class="cwo-in" onchange="CWO.setCause(this.value)" ' + (causes.length ? "" : "disabled") + '><option value="">請選擇故障原因</option>' +
      causes.map((s) => "<option" + (wSel.cause === s ? " selected" : "") + ">" + esc(s) + "</option>").join("") + "</select></div>" +
      "</div>" +
      '<div class="cwo-fgrid" style="margin-top:8px">' +
      '<div><label class="cwo-lbl">處理動作</label><select class="cwo-in" id="cwoAct"><option value="">請選擇處理動作</option>' + ACTIONS.map((a) => "<option>" + a + "</option>").join("") + "</select></div>" +
      '<div><label class="cwo-lbl">五年保固用料(廠商)</label><select class="cwo-in" id="cwoWarr"><option value="">請選擇廠商</option>' + WARRANTIES.map((w) => "<option>" + esc(w) + "</option>").join("") + "</select></div>" +
      "</div>" +
      '<label class="cwo-chk" style="margin:8px 0"><input type="checkbox" id="cwoPax"/>旅客介面</label>' +
      '<div style="font-weight:700;margin:6px 0">設備位置</div>' +
      '<div class="cwo-fgrid">' +
      '<div><label class="cwo-lbl">主設備位置</label><select class="cwo-in" id="cwoLoc1"><option value="">請選擇</option>' + TRAINS.filter((t) => t !== "測台").map((t) => "<option" + ((o.loc || [])[0] === t ? " selected" : "") + ">" + t + "</option>").join("") + "</select></div>" +
      '<div><label class="cwo-lbl">第 2 層位置</label><select class="cwo-in" id="cwoLoc2"><option value="">請選擇</option>' + LOC2.map((l) => "<option" + ((o.loc || [])[1] === l ? " selected" : "") + ">" + l + "</option>").join("") + "</select></div>" +
      "</div>" +
      '<div style="margin-top:8px"><label class="cwo-lbl">危險作業項目</label><select class="cwo-in" id="cwoDw"><option value="">請選擇危險作業項目</option>' + DANGERWORK.map((d) => "<option>" + esc(d) + "</option>").join("") + "</select></div>" +
      '<div class="cwo-fgrid" style="margin-top:8px">' +
      '<div><label class="cwo-lbl">設備運轉/里程/次數</label><input class="cwo-in" type="number" id="cwoMile" placeholder="未填則視為 0"/></div>' +
      '<div><label class="cwo-lbl">拆下設備序號</label><input class="cwo-in" id="cwoSN1" placeholder="可留空"/></div>' +
      '<div><label class="cwo-lbl">供換設備序號</label><input class="cwo-in" id="cwoSN2" placeholder="可留空"/></div>' +
      "</div>" +
      '<div style="margin-top:8px"><label class="cwo-lbl">完工報告</label><textarea class="cwo-in" id="cwoReport" rows="4" placeholder="請輸入完工內容、檢修結果與相關說明..."></textarea></div>' +
      '<button class="cwo-btn primary" style="margin-top:10px" onclick="CWO.createFinish()">建立完工作業資料</button>' +
      "</div>";
  }
  function saveEditModal() {
    const o = editTarget; if (!o) return;
    const lv = document.getElementById("cwoLv").value; if (lv) o.level = +lv;
    const st = document.getElementById("cwoSt").value;
    if (st !== "" && +st !== o.status) o.status = +st;
    const tr = document.getElementById("cwoTrain").value; if (tr) { o.tsname = tr; if (o.loc && o.loc.length) o.loc[0] = tr; else o.loc = [tr]; }
    o.fdesc = document.getElementById("cwoDesc").value;
    const note = document.getElementById("cwoNote").value.trim(); o.note = note || "NA";
    persistOrder(o);
    closeModal(); toast("已儲存工單變更(寫入資料庫)"); render();
  }
  function createFinish() {
    const o = editTarget; if (!o) return;
    const rep = document.getElementById("cwoReport").value.trim();
    if (!rep) { toast("請輸入完工報告", true); return; }
    const payload = {
      report: rep,
      action: document.getElementById("cwoAct").value || null,
      warranty: document.getElementById("cwoWarr").value || null,
      danger: document.getElementById("cwoDw").value || null,
      pax: document.getElementById("cwoPax").checked,
      mileage: +document.getElementById("cwoMile").value || 0,
      removed_serial: document.getElementById("cwoSN1").value || null,
      installed_serial: document.getElementById("cwoSN2").value || null,
      subsystem: wSel.sub || null, symptom: wSel.sym || null, component: wSel.comp || null, cause: wSel.cause || null
    };
    fetch(WO_API + "/" + encodeURIComponent(o.orderno) + "/finish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) { toast("完工寫入失敗:" + ((d.error && d.error.message) || ""), true); return; }
        Object.assign(o, { status: d.row.status, wpath: d.row.wpath, repair: d.row.repair });
        o.logsLoaded = false; o.logs = [];
        toast("已建立完工作業資料(已寫入資料庫)"); closeModal(); render();
      })
      .catch((e) => toast("完工寫入失敗:" + e.message, true));
  }
  function addImg() { toast("圖片上傳將於正式版支援", true); }

  /* ---------- 樣式(限定 #cwo-root 與 modal/toast) ---------- */
  function injectStyle() {
    if (document.getElementById("cwo-style")) return;
    const css = `
#cwo-root{color:#e2e8f0;font-family:"Segoe UI","Microsoft JhengHei",system-ui,sans-serif;padding:4px 2px 30px}
#cwo-root .cwo-title{font-size:24px;font-weight:800;margin:6px 0 2px}
#cwo-root .cwo-desc{color:#94a3b8;font-size:13px;margin:0 0 14px}
#cwo-root .cwo-h3{font-size:16px;font-weight:700;margin:0 0 12px}
#cwo-root .cwo-h4,.cwo-modal .cwo-h4{font-size:14px;font-weight:700;color:#a5c8dd;margin:16px 0 6px}
#cwo-root .cwo-mut,.cwo-modal .cwo-mut{color:#94a3b8}
#cwo-root .cwo-panel{background:#0f172a;border:1px solid rgba(148,163,184,.18);border-radius:16px;padding:16px 18px;margin-bottom:14px}
#cwo-root .cwo-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
#cwo-root .cwo-scard{background:#1e293b;border-radius:14px;padding:16px;text-align:center}
#cwo-root .cwo-scard .k{color:#94a3b8;font-size:13px;margin-bottom:4px}
#cwo-root .cwo-scard .v{font-size:30px;font-weight:800}
#cwo-root .cwo-toolbar,.cwo-modal .cwo-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#cwo-root .cwo-btn,.cwo-modal .cwo-btn{background:#1e293b;border:1px solid rgba(148,163,184,.25);color:#e2e8f0;padding:8px 15px;border-radius:999px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}
#cwo-root .cwo-btn:hover,.cwo-modal .cwo-btn:hover{background:#28374d}
#cwo-root .cwo-btn.primary,.cwo-modal .cwo-btn.primary{background:linear-gradient(90deg,#4a63e7,#8b3ee0);border:none;color:#fff}
#cwo-root .cwo-btn.on{background:#1c4a63;border-color:#4fa8d8}
#cwo-root .cwo-btn:disabled{opacity:.4;cursor:default}
#cwo-root .cwo-mini{background:#1e293b;border:1px solid rgba(148,163,184,.25);color:#cbd5e1;padding:4px 11px;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit}
#cwo-root .cwo-in,.cwo-modal .cwo-in{width:100%;padding:9px 12px;background:#0b1323;border:1px solid rgba(148,163,184,.25);border-radius:10px;color:#e2e8f0;font-size:13px;outline:none;font-family:inherit;box-sizing:border-box}
#cwo-root .cwo-in:focus,.cwo-modal .cwo-in:focus{border-color:#60a5fa}
#cwo-root select.cwo-in option,.cwo-modal select.cwo-in option{background:#0f172a}
#cwo-root .cwo-lbl,.cwo-modal .cwo-lbl{display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:#cbd5e1}
#cwo-root .cwo-hint,.cwo-modal .cwo-hint{color:#64748b;font-size:11px;font-weight:400}
#cwo-root .cwo-fgrid,.cwo-modal .cwo-fgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
#cwo-root .cwo-chkline{display:flex;flex-wrap:wrap;gap:6px 16px}
#cwo-root .cwo-chk,.cwo-modal .cwo-chk{display:flex;align-items:center;gap:6px;font-size:13px;color:#e2e8f0}
#cwo-root .cwo-chk input,.cwo-modal .cwo-chk input{width:15px;height:15px}
#cwo-root .cwo-srow{display:flex;gap:8px}
#cwo-root .cwo-srow .cwo-in{flex:1}
#cwo-root .cwo-table{width:100%;border-collapse:collapse;font-size:12px}
#cwo-root .cwo-table th,#cwo-root .cwo-table td{padding:9px 10px;text-align:left;border-bottom:1px solid rgba(148,163,184,.14);vertical-align:top;white-space:nowrap}
#cwo-root .cwo-table th{color:#94a3b8;font-weight:600;font-size:12px}
#cwo-root .cwo-table tr:hover td{background:rgba(148,163,184,.06)}
#cwo-root .cwo-link{color:#7dd3fc;background:none;border:none;padding:0;font-size:13px;font-weight:700;text-decoration:underline;cursor:pointer;font-family:inherit;text-align:left}
#cwo-root .cwo-path{color:#cbd5e1;line-height:1.5;white-space:normal}
#cwo-root .cwo-path .sub{color:#94a3b8}
#cwo-root .cwo-path.wdone,#cwo-root .cwo-path .wdone,#cwo-root .cwo-tree.wdone,#cwo-root .cwo-tree.wdone div{color:#4ade80!important}
#cwo-root .cwo-remain{display:inline-block;margin-top:4px;background:#fdf3d8;color:#8a6110;font-size:11px;padding:2px 8px;border-radius:6px;font-weight:700}
#cwo-root .cwo-remain.over{background:#fbdcdc;color:#a32d2d}
#cwo-root .cwo-remain.obs{background:#d8f0f0;color:#0f6e6e}
#cwo-root .cwo-pill{display:inline-block;padding:3px 12px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap}
#cwo-root .cwo-edit{width:48px;height:48px;border-radius:50%;border:none;color:#fff;font-size:13px;font-weight:700;cursor:pointer;background:linear-gradient(135deg,#3b4fd8,#7a3ee0);font-family:inherit}
#cwo-root .cwo-dgrid,.cwo-modal .cwo-dgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin-bottom:8px}
#cwo-root .cwo-dcell,.cwo-modal .cwo-dcell{background:#1e293b;border:1px solid rgba(148,163,184,.15);border-radius:12px;padding:12px 14px}
#cwo-root .cwo-dcell .k,.cwo-modal .cwo-dcell .k{color:#94a3b8;font-size:12px;margin-bottom:5px}
#cwo-root .cwo-dcell .v,.cwo-modal .cwo-dcell .v{font-size:14px;font-weight:600}
#cwo-root .cwo-tree,.cwo-modal .cwo-tree{line-height:1.8;font-size:13px}
#cwo-root .cwo-box,.cwo-modal .cwo-box{background:#1e293b;border:1px solid rgba(148,163,184,.15);border-radius:12px;padding:12px 14px;line-height:1.7;white-space:pre-wrap;font-size:13px}
#cwo-root .cwo-log,.cwo-modal .cwo-log{background:#1e293b;border:1px solid rgba(148,163,184,.15);border-radius:12px;padding:11px 13px;margin-bottom:8px;font-size:13px}
#cwo-root .cwo-log .top,.cwo-modal .cwo-log .top{display:flex;justify-content:space-between;color:#94a3b8;font-size:12px}
#cwo-root .cwo-log .act,.cwo-modal .cwo-log .act{color:#fbbf24;font-weight:700;margin:4px 0}
#cwo-root .cwo-repair{background:#122032;border:1px solid rgba(96,165,250,.3);border-radius:14px;padding:16px;margin-top:6px}
#cwo-root .cwo-cir{width:20px;height:20px;border-radius:50%;background:#14532d;display:inline-flex;align-items:center;justify-content:center;font-size:12px}
#cwo-modal-ov{position:fixed;inset:0;background:rgba(2,6,23,.8);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:22px;overflow:auto}
.cwo-modal{width:100%;max-width:760px;background:#0f172a;border:1px solid rgba(148,163,184,.3);border-radius:18px;padding:20px 24px;margin:auto;color:#e2e8f0;font-family:"Segoe UI","Microsoft JhengHei",system-ui,sans-serif}
.cwo-modal .cwo-h3{font-size:17px;font-weight:700;margin:0 0 14px}
.cwo-modal .cwo-x{background:none;border:none;color:#94a3b8;font-size:17px;cursor:pointer}
.cwo-modal .cwo-ro{background:rgba(148,163,184,.08);border:1px solid rgba(148,163,184,.15);border-radius:10px;padding:9px 12px;font-size:13px}
.cwo-modal .cwo-collapse{background:#1c2f47;border:1px solid rgba(96,165,250,.35);border-radius:10px;padding:10px 13px;font-weight:700;font-size:13px;cursor:pointer;margin-top:8px;user-select:none}
.cwo-modal .cwo-sub{background:rgba(148,163,184,.06);border:1px solid rgba(148,163,184,.15);border-radius:12px;padding:13px 15px;margin-top:10px}
.cwo-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0d3321;border:1px solid #22c55e;color:#bbf7d0;padding:11px 19px;border-radius:11px;font-size:13px;z-index:10000;font-family:"Segoe UI","Microsoft JhengHei",sans-serif}
.cwo-toast.err{background:#3f1420;border-color:#f87171;color:#fecaca}
`;
    const st = document.createElement("style");
    st.id = "cwo-style";
    st.textContent = css;
    document.head.appendChild(st);
  }
})();
