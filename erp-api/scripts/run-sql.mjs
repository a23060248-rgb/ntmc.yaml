// 依序對 DATABASE_URL 執行指定的 SQL 檔（每檔為一個 simple query，多語句自動單一交易）。
// 用法：node scripts/run-sql.mjs <db-design 內的檔名> ...
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });
const dbDesign = path.resolve(__dirname, "../../db-design");

const files = process.argv.slice(2);
if (!files.length) {
  console.error("用法：node scripts/run-sql.mjs <檔名.sql> ...");
  process.exit(1);
}

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
});

await client.connect();
try {
  for (const f of files) {
    const p = path.isAbsolute(f) ? f : path.join(dbDesign, f);
    const sql = fs.readFileSync(p, "utf8");
    process.stdout.write(`==> ${f} ... `);
    await client.query(sql);
    console.log("OK");
  }
  console.log("全部完成 ✅");
} catch (e) {
  console.error("\n失敗：", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
