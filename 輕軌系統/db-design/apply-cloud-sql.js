// 把指定的 .sql 檔套用到 erp-api/.env 裡的雲端 DATABASE_URL。
// 用法： node apply-cloud-sql.js <檔名.sql>
// 需設定 NODE_PATH 指到 erp-api 的 runtime node_modules（內含 pg）。
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const sqlArg = process.argv[2];
if (!sqlArg) {
  console.error("用法: node apply-cloud-sql.js <檔名.sql>");
  process.exit(1);
}

const envPath = path.resolve(__dirname, "..", "erp-api", ".env");
const envText = fs.readFileSync(envPath, "utf8");
const match = envText.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/m);
if (!match) {
  console.error("在 " + envPath + " 找不到 DATABASE_URL");
  process.exit(1);
}
const connectionString = match[1].trim();
const sql = fs.readFileSync(path.resolve(__dirname, sqlArg), "utf8");

const pool = new Pool({ connectionString });

(async () => {
  try {
    await pool.query(sql);
    const r = await pool.query(
      "SELECT option_code, option_label, sort_order FROM workflow_option WHERE option_group = 'MATERIAL_SYSTEM' ORDER BY sort_order"
    );
    console.log("套用成功。MATERIAL_SYSTEM 目前共 " + r.rowCount + " 項：");
    for (const row of r.rows) {
      console.log("  " + String(row.sort_order).padStart(3) + "  " + row.option_code.padEnd(8) + "  " + row.option_label);
    }
  } catch (e) {
    console.error("套用失敗: " + e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
