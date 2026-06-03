// 查資料庫目前用量（注意：這是「已使用」，不是「總配額」；總配額看 Zeabur 後台）
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

  const cur = await client.query(
    "SELECT current_database() AS db, pg_size_pretty(pg_database_size(current_database())) AS size"
  );
  console.log(`本資料庫 ${cur.rows[0].db} 已用：${cur.rows[0].size}`);

  const all = await client.query(
    "SELECT datname, pg_size_pretty(pg_database_size(datname)) AS size, pg_database_size(datname) AS bytes FROM pg_database WHERE datistemplate = false ORDER BY pg_database_size(datname) DESC"
  );
  let total = 0;
  console.log("\n所有資料庫已用：");
  for (const r of all.rows) {
    console.log(`  ${r.datname}: ${r.size}`);
    total += Number(r.bytes);
  }
  console.log(`  合計約 ${(total / 1024 / 1024).toFixed(1)} MB`);

  const top = await client.query(
    `SELECT c.relname AS tbl, pg_size_pretty(pg_total_relation_size(c.oid)) AS size
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r'
     ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 8`
  );
  console.log("\n最大的幾張表：");
  for (const r of top.rows) console.log(`  ${r.tbl}: ${r.size}`);
} catch (e) {
  console.error("失敗：", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
