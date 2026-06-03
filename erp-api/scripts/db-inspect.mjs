// 唯讀檢查資料庫現況：workflow_option 群組 + 各主檔筆數
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
});

try {
  await client.connect();
  const v = await client.query("SELECT version()");
  console.log("連線：", v.rows[0].version.split(",")[0]);

  console.log("\n=== workflow_option 群組 ===");
  try {
    const g = await client.query(
      `SELECT option_group, count(*)::int AS n FROM workflow_option GROUP BY option_group ORDER BY option_group`
    );
    if (!g.rowCount) console.log("(workflow_option 空的)");
    for (const r of g.rows) console.log(`  ${r.option_group}: ${r.n}`);
  } catch {
    console.log("(無 workflow_option 表)");
  }

  console.log("\n=== 目前缺少的表（vs 目前 schema）===");
  const expected = [
    "workflow_option", "document_sequence", "project_work_order",
    "material_usage_history", "inventory_document", "inventory_document_line",
    "asset_installation_import_batch", "asset_installation_import_row"
  ];
  const have = (await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`
  )).rows.map((r) => r.table_name);
  const missing = expected.filter((t) => !have.includes(t));
  console.log("  缺少：", missing.join(", ") || "(無，已是最新)");

  console.log("\n=== 各主檔筆數 ===");
  const tables = [
    "app_user", "train", "warehouse", "warehouse_bin", "vendor",
    "equipment_group", "vehicle_position", "material", "instrument", "wi_document",
    "pm_template", "pm_template_material", "pm_template_instrument", "pm_template_wi",
    "material_import_source", "asset", "work_order"
  ];
  for (const name of tables) {
    try {
      const cnt = await client.query(`SELECT count(*)::int AS n FROM ${name}`);
      console.log(`  ${name}: ${cnt.rows[0].n}`);
    } catch {
      console.log(`  ${name}: (無此表)`);
    }
  }
} catch (e) {
  console.error("失敗：", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
