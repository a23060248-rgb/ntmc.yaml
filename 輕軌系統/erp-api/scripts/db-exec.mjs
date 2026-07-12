// 執行一段任意 SQL（維運小工具）。用法：node scripts/db-exec.mjs "SQL..."
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const sql = process.argv[2];
if (!sql) { console.error('用法：node scripts/db-exec.mjs "SQL..."'); process.exit(1); }

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
});

try {
  await client.connect();
  const r = await client.query(sql);
  console.log("rowCount:", r.rowCount);
  if (r.rows && r.rows.length) console.log(JSON.stringify(r.rows, null, 2));
} catch (e) {
  console.error("失敗：", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
