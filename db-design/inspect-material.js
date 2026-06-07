// 唯讀檢視雲端 material 表：欄位、筆數、分類欄位的實際值分布、樣本。
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const envText = fs.readFileSync(path.resolve(__dirname, "..", "erp-api", ".env"), "utf8");
const connectionString = envText.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/m)[1].trim();
const pool = new Pool({ connectionString });

(async () => {
  try {
    const cols = await pool.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'material' ORDER BY ordinal_position`
    );
    console.log("=== material 欄位 (" + cols.rowCount + ") ===");
    cols.rows.forEach(c => console.log("  " + c.column_name.padEnd(22) + c.data_type + (c.is_nullable === "NO" ? " NOT NULL" : "")));

    const cnt = await pool.query("SELECT count(*)::int n, count(*) FILTER (WHERE is_active) act FROM material");
    console.log("\n=== 筆數 ===\n  total=" + cnt.rows[0].n + "  active=" + cnt.rows[0].act);

    for (const f of ["system_name", "material_type", "material_property", "unit", "safety_level"]) {
      const r = await pool.query(`SELECT COALESCE(${f},'(null)') v, count(*)::int n FROM material GROUP BY 1 ORDER BY 2 DESC LIMIT 12`);
      console.log("\n=== 物料.${f} 實際值 ===".replace("${f}", f));
      r.rows.forEach(x => console.log("  " + String(x.n).padStart(5) + "  " + x.v));
    }

    console.log("\n=== 結構化欄位填充率 (非空筆數 / 1147) ===");
    for (const f of ["system_code", "category_code", "category_name", "sequence_no", "type_code", "estimated_unit_price", "lead_time_days", "market_available", "spec"]) {
      const r = await pool.query(`SELECT count(*) FILTER (WHERE ${f} IS NOT NULL AND ${f}::text <> '') n FROM material`);
      console.log("  " + f.padEnd(22) + r.rows[0].n);
    }
    const catName = await pool.query("SELECT COALESCE(category_name,'(null)') v, count(*)::int n FROM material GROUP BY 1 ORDER BY 2 DESC LIMIT 8");
    console.log("\n=== category_name 實際值 ===");
    catName.rows.forEach(x => console.log("  " + String(x.n).padStart(5) + "  " + x.v));

    const sys = await pool.query("SELECT DISTINCT split_part(part_no,'.',1) sc FROM material ORDER BY 1");
    console.log("\n=== 料號第一段(系統碼)種類 ===\n  " + sys.rows.map(r => r.sc).join(", "));

    const sample = await pool.query("SELECT part_no, material_name, system_name, material_type, material_property, unit FROM material ORDER BY part_no LIMIT 3");
    console.log("\n=== 樣本 ===");
    sample.rows.forEach(s => console.log("  " + JSON.stringify(s)));
  } catch (e) {
    console.error("FAILED: " + e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
