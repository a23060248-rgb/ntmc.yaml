/* 種入 C 工單示範資料(依線上系統真實分布)
 * 執行:node scripts/seed-work-orders.js
 * 冪等:若 work_order 已有 C 工單則跳過(--force 重灌:先刪 C 工單再種)
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 與前端 clone 相同的可重現亂數
let SEED = 20260704;
function rnd() { SEED = (SEED * 1103515245 + 12345) & 0x7fffffff; return SEED / 0x7fffffff; }
function pick(a) { return a[Math.floor(rnd() * a.length)]; }
function pad(n, w = 2) { return String(n).padStart(w, "0"); }

const REAL_DESCS = [
  "113車整備完畢後回報，CCTV人機介面CAM11畫面顯示為黑屏",
  "103車整備時回報，開機後CMS未顯示四顆牽引T字燈",
  "114車於V28 1月台回報，CMS顯示M1端駕駛室空調實際溫度26度，設定22度，壓縮機未做動",
  "106車整備完畢後回報，M1端撒砂裝置未做動",
  "V01運務員回報，旅客反映下車時發現107車L5車門TSDU顯示黑屏",
  "101車換端時發現M5端CCTV人機介面CAM15顯示黑屏",
  "107車整備完畢後回報，M1端近駕駛室側TMDS畫面顯示黑屏",
  "105車於V01 2月台回報，M1/M5端CMS顯示時間皆慢標準時間3秒",
  "115車整備完畢後回報，M5端撒砂裝置未作動",
  "111車整備完畢後回報，CCTV人機介面CAM09畫面顯示黑屏",
  "106車於V09 2月台回報，以無架空線模式通過濱海沙崙路口(V28→V09)時，列車牽引動力不足，CMS顯示「ESS1放電電流過大」告警",
  "115車整備完畢後回報，M1端L-Side後視鏡小視窗顯示為黑屏",
  "103車整備完畢後回報，CCTV人機介面CAM01為黑屏",
  "104車 M1R 裙板內側脫漆",
  "214車 M3靠M2 TMDS顯示新北LOGO",
  "106車整備完畢後回報，M1端撒砂裝置未作動；OCC指示持續留意列車狀況"
];
const REPORTERS = ["淡海輕軌車務中心", "行控中心PSC", "王筌儀", "鄭先任", "郭韋妤", "王立雄", "廖威荏", "林彥睿", "OCC", "楊淯喆"];
const LOC2 = ["1號車廂", "1號駕駛室", "2號車廂", "3號車廂", "4號車廂", "5號車廂", "5號駕駛室"];
const LOC3 = ["左側", "右側"];
const MONTHS = [["2025-12", 636], ["2026-01", 1081], ["2026-02", 1049], ["2026-03", 1118], ["2026-04", 914], ["2026-05", 887], ["2026-06", 998], ["2026-07", 132]];
const MONTH_POOL = [];
MONTHS.forEach(([m, w]) => { for (let i = 0; i < Math.round(w / 6815 * 300); i++) MONTH_POOL.push(m); });
const STATUS_COUNTS = [["0", 31], ["2", 85], ["3", 1243], ["4", 1022], ["5", 4], ["8", 97], ["9", 215], ["10", 2]];
const DEADLINE_DAYS = { 1: 3, 2: 7, 3: 30, 4: 30 };
const ACTION_CODES = ["01", "02", "03", "09", "10", "11", "12"];

function rocNo(dateStr, seq) {
  const y = +dateStr.slice(0, 4) - 1911;
  return `C-${y}${dateStr.slice(5, 7)}${dateStr.slice(8, 10)}-D-TS-${pad(seq, 3)}`;
}
function finishReport(dateStr, who) {
  return `一、故障履歷(兩個月內)：第${1 + Math.floor(rnd() * 3)}次\n二、檢查內容：\n1.${pick(["檢測功能正常", "更換後測試正常", "重新啟動後恢復正常", "清潔調整後正常"])}，故結單。(${dateStr.slice(5, 7)}/${dateStr.slice(8, 10)} ${who.slice(1)})\n三、更換物料名稱/序號：無。\n四、互換物料名稱/序號：無。`;
}

async function main() {
  const force = process.argv.includes("--force");
  const client = await pool.connect();
  try {
    const existing = await client.query(`SELECT count(*)::int n FROM work_order WHERE work_order_type='C'`);
    if (existing.rows[0].n > 0 && !force) {
      console.log(`已存在 ${existing.rows[0].n} 筆 C 工單,跳過(--force 可重灌)`);
      return;
    }
    await client.query("BEGIN");
    if (force && existing.rows[0].n > 0) {
      await client.query(`DELETE FROM work_order WHERE work_order_type='C'`);
      await client.query(`DELETE FROM document_sequence WHERE document_type='C'`);
      console.log("已清除舊 C 工單");
    }

    // 參照資料
    const trains = (await client.query(`SELECT id, train_no FROM train WHERE train_no ~ '^[0-9]+車$'`)).rows;
    const opsUsers = (await client.query(`SELECT id, display_name FROM app_user WHERE department='輕軌營運處'`)).rows;
    const fixUsers = (await client.query(`SELECT id, display_name FROM app_user WHERE department IN ('輕軌維修處','車輛課') AND display_name<>'系統管理員'`)).rows;
    // 報修矩陣:子系統(節點) × 樣態(等級)
    const phenom = (await client.query(`
      SELECT n.id AS sub_id, n.name AS subsystem, p.name AS phenomenon, p.severity_level
      FROM fault_phenomenon p JOIN fault_system_node n ON n.id = p.subsystem_node_id`)).rows;
    // 各子系統的報修徵狀(官方)
    const cats = (await client.query(`
      SELECT c.id, c.name, c.parent_id FROM fault_system_node c WHERE c.level = 3`)).rows;
    const catsBySub = {};
    cats.forEach(c => { (catsBySub[c.parent_id] = catsBySub[c.parent_id] || []).push(c); });
    // 派工目錄(攤平),依子系統分組
    const cat2 = (await client.query(`SELECT subsystem, symptom, component, cause, component_id, cause_id FROM fault_dispatch_catalog`)).rows;
    const dispBySub = {};
    cat2.forEach(r => { (dispBySub[r.subsystem] = dispBySub[r.subsystem] || []).push(r); });

    // 狀態池洗牌
    const pool_ = [];
    STATUS_COUNTS.forEach(([st, n]) => { for (let i = 0; i < n; i++) pool_.push(st); });
    for (let i = pool_.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1));[pool_[i], pool_[j]] = [pool_[j], pool_[i]]; }

    const seqByDate = {};
    let inserted = 0, finishes = 0, events = 0;
    for (const st of pool_) {
      const mo = pick(MONTH_POOL);
      const day = 1 + Math.floor(rnd() * (mo === "2026-07" ? 3 : 28));
      const dateStr = `${mo}-${pad(day)}`;
      seqByDate[dateStr] = (seqByDate[dateStr] || 0) + 1;
      const seq = seqByDate[dateStr];
      const hh = pad(4 + Math.floor(rnd() * 18)), mi = pad(Math.floor(rnd() * 60));
      const createdAt = `${dateStr}T${hh}:${mi}:00+08:00`;

      const ph = pick(phenom);
      const subCats = catsBySub[ph.sub_id] || [];
      const cat = subCats.length ? pick(subCats) : { name: "其他" };
      const level = ph.severity_level;
      const deadline = new Date(new Date(createdAt).getTime() + (DEADLINE_DAYS[level] || 30) * 86400000).toISOString();
      const train = pick(trains);
      const reporter = pick(REPORTERS);
      const fixer = fixUsers.length ? pick(fixUsers) : null;
      const opsU = opsUsers.length ? pick(opsUsers) : null;
      const locR = rnd();
      const loc = locR < 0.6 ? [train.train_no] : locR < 0.9 ? [train.train_no, pick(LOC2)] : [train.train_no, pick(LOC2), pick(LOC3)];
      const desc = `${hh}:${mi} ${pick(REAL_DESCS)}`;
      const done = ["3", "4", "5"].includes(st);

      const wo = await client.query(`
        INSERT INTO work_order (work_order_no, work_order_type, work_order_date, site_code, target_code,
          daily_sequence, title, status, train_id, created_by, assigned_to, created_at,
          actual_finish_at, closed_at)
        VALUES ($1,'C',$2,'D','TS',$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [rocNo(dateStr, seq), dateStr, seq, desc.slice(0, 60), st, train.id,
          opsU ? opsU.id : null, (st >= "2" && fixer) ? fixer.id : null, createdAt,
          done ? createdAt : null, st === "5" ? createdAt : null]);
      const woId = wo.rows[0].id;

      await client.query(`
        INSERT INTO fault_work_order (work_order_id, main_system, fault_category, fault_component, fault_sub_component,
          fault_description, severity_level, deadline_at, observe_until, shortage_item, reporter_text, location_path, fault_found_at)
        VALUES ($1,'電聯車系統',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [woId, ph.subsystem, cat.name, ph.phenomenon, desc, level, deadline,
          st === "10" ? new Date(Date.now() + 2 * 86400000).toISOString() : null,
          st === "9" ? "待料更換" : null, reporter, loc, createdAt]);

      await client.query(`INSERT INTO work_order_event (work_order_id, actor_text, action_code, note, created_at)
        VALUES ($1,$2,'0','故障通報建立',$3)`, [woId, reporter, createdAt]);
      events++;
      if (st >= "2") {
        await client.query(`INSERT INTO work_order_event (work_order_id, actor_text, action_code, note, created_at)
          VALUES ($1,'ADMIN ADMIN','2',$2,$3)`, [woId, `${fixer ? fixer.display_name : "維修員"} 於手機APP進行派工`, createdAt]);
        events++;
      }
      if (done) {
        const dRows = dispBySub[ph.subsystem] || cat2;
        const d = pick(dRows);
        await client.query(`
          INSERT INTO fault_finish_record (work_order_id, finished_by_text, finish_report, action_code,
            is_passenger_ui, mileage, dispatch_node_id, dispatch_component, accepted_at, is_final, created_at)
          VALUES ($1,$2,$3,$4,false,0,$5,$6,$7,true,$7)`,
          [woId, fixer ? fixer.display_name : "維修員", finishReport(dateStr, fixer ? fixer.display_name : "維修員"),
            pick(ACTION_CODES), d.cause_id, d.component, createdAt]);
        await client.query(`INSERT INTO work_order_event (work_order_id, actor_text, action_code, note, created_at)
          VALUES ($1,$2,'3','0',$3)`, [woId, fixer ? fixer.display_name : "維修員", createdAt]);
        finishes++; events++;
      }
      if (st === "9") {
        await client.query(`INSERT INTO work_order_event (work_order_id, actor_text, action_code, note, created_at)
          VALUES ($1,$2,'9','待料更換',$3)`, [woId, fixer ? fixer.display_name : "維修員", createdAt]);
        events++;
      }
      inserted++;
      if (inserted % 500 === 0) console.log(`...已種入 ${inserted}`);
    }
    // 同步 document_sequence
    for (const [d, s] of Object.entries(seqByDate)) {
      await client.query(`
        INSERT INTO document_sequence (document_type, sequence_date, site_code, target_code, last_sequence)
        VALUES ('C',$1,'D','TS',$2)
        ON CONFLICT (document_type, sequence_date, site_code, target_code)
        DO UPDATE SET last_sequence = GREATEST(document_sequence.last_sequence, EXCLUDED.last_sequence)`, [d, s]);
    }
    await client.query("COMMIT");
    console.log(`完成:工單 ${inserted} 筆、完工紀錄 ${finishes}、事件 ${events}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("種入失敗:", e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}
main();
