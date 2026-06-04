// 匯入設備別名對應：db-design/templates/equipment_alias.csv → equipment_alias（雲端，免 psql）
// 用法：node scripts/import-equipment-alias.mjs
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });
const csvPath = path.resolve(__dirname, "../../db-design/templates/equipment_alias.csv");

function parseLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i += 1; } else { q = false; } }
      else { cur += c; }
    } else if (c === '"') { q = true; }
    else if (c === ",") { out.push(cur); cur = ""; }
    else { cur += c; }
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(function (l) { return l.trim() !== ""; });
  const rows = lines.map(parseLine);
  const header = rows.shift().map(function (h) { return h.trim().replace(/^﻿/, ""); });
  return rows.map(function (cols) {
    const o = {};
    header.forEach(function (h, i) { o[h] = (cols[i] != null ? cols[i] : "").trim(); });
    return o;
  });
}

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
});

try {
  if (!fs.existsSync(csvPath)) { console.error("找不到範本：", csvPath); process.exit(1); }
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  await client.connect();
  let ok = 0;
  let skip = 0;
  for (const r of rows) {
    if (!r.alias_name) { skip += 1; continue; }
    const src = r.source_system || "FAULT_C";
    const kind = String(r.target_kind || "").toUpperCase();
    let groupId = null;
    let matId = null;
    if (kind === "GROUP") {
      const g = await client.query("SELECT id FROM equipment_group WHERE group_code = $1", [r.target_code]);
      if (!g.rowCount) { console.warn("略過（找不到設備群組 " + r.target_code + "）：" + r.alias_name); skip += 1; continue; }
      groupId = g.rows[0].id;
    } else if (kind === "MATERIAL") {
      const m = await client.query("SELECT id FROM material WHERE part_no = $1", [r.target_code]);
      if (!m.rowCount) { console.warn("略過（找不到料號 " + r.target_code + "）：" + r.alias_name); skip += 1; continue; }
      matId = m.rows[0].id;
    } else {
      console.warn("略過（target_kind 必須是 GROUP 或 MATERIAL）：" + r.alias_name);
      skip += 1;
      continue;
    }
    await client.query(
      `
        INSERT INTO equipment_alias (source_system, alias_name, target_kind, equipment_group_id, material_id, note)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (source_system, alias_name) DO UPDATE SET
          target_kind = EXCLUDED.target_kind,
          equipment_group_id = EXCLUDED.equipment_group_id,
          material_id = EXCLUDED.material_id,
          note = EXCLUDED.note,
          updated_at = now()
      `,
      [src, r.alias_name, kind, groupId, matId, r.note || null]
    );
    ok += 1;
  }
  console.log("匯入完成：成功 " + ok + " 筆、略過 " + skip + " 筆");
} catch (e) {
  console.error("失敗：", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
