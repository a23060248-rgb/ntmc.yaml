const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

process.env.NODE_ENV = "test";
process.env.ENV_FILE = process.env.ENV_FILE || ".env.test";
require("../src/config/loadEnvironment").loadEnvironment();

const { assertSafeDatabaseTarget, parseDatabaseTarget } = require("../src/config/databaseSafety");

const systemRoot = path.resolve(__dirname, "..", "..");
const defaultInput = path.join(systemRoot, "db-design", "templates", "equipment_alias.csv");
const args = process.argv.slice(2);

function argument(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? path.resolve(args[index + 1]) : fallback;
}

function parseLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) throw new Error("equipment alias CSV is empty");
  const headers = parseLine(lines.shift()).map((header) => header.trim().replace(/^\uFEFF/, ""));
  const required = ["source_system", "alias_name", "target_kind", "target_code"];
  required.forEach((header) => {
    if (!headers.includes(header)) throw new Error(`missing CSV header: ${header}`);
  });
  return lines.map((line, index) => {
    const columns = parseLine(line);
    return Object.fromEntries([
      ["rowNo", index + 2],
      ...headers.map((header, column) => [header, String(columns[column] || "").trim()]),
    ]);
  });
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  assertSafeDatabaseTarget({
    connectionString: process.env.DATABASE_URL,
    safetyMode: "rehearsal",
    allowedNamePattern: process.env.DATABASE_ALLOWED_NAME_PATTERN,
  });
  const inputPath = argument("--file", defaultInput);
  if (!fs.existsSync(inputPath)) throw new Error(`equipment alias CSV not found: ${inputPath}`);
  const text = fs.readFileSync(inputPath, "utf8");
  const rows = parseCsv(text);
  const duplicates = new Map();
  rows.forEach((row) => {
    const key = `${String(row.source_system || "FAULT_C").toUpperCase()}\u0000${String(row.alias_name).toLocaleLowerCase("zh-TW")}`;
    duplicates.set(key, [...(duplicates.get(key) || []), row.rowNo]);
  });

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const results = [];
  try {
    for (const row of rows) {
      const sourceSystem = String(row.source_system || "FAULT_C").trim().toUpperCase();
      const aliasName = String(row.alias_name || "").trim();
      const targetKind = String(row.target_kind || "").trim().toUpperCase();
      const targetCode = String(row.target_code || "").trim().toUpperCase();
      const note = String(row.note || "").trim();
      const reasons = [];
      if (!aliasName) reasons.push("缺少 alias_name");
      if (!sourceSystem) reasons.push("缺少 source_system");
      if (!targetCode) reasons.push("缺少 target_code");
      if (!["GROUP", "MATERIAL"].includes(targetKind)) reasons.push("target_kind 必須是 GROUP 或 MATERIAL");
      if (/範例|example/i.test(note)) reasons.push("資料標記為範例，不能作為正式匯入來源");
      const duplicateRows = duplicates.get(`${sourceSystem}\u0000${aliasName.toLocaleLowerCase("zh-TW")}`) || [];
      if (duplicateRows.length > 1) reasons.push(`CSV 重複列：${duplicateRows.join(", ")}`);

      let canonicalName = null;
      if (!reasons.length && targetKind === "GROUP") {
        const target = await client.query(
          `SELECT group_name AS canonical_name FROM equipment_group WHERE group_code=$1`,
          [targetCode],
        );
        if (!target.rowCount) reasons.push(`找不到設備群組 ${targetCode}`);
        else canonicalName = target.rows[0].canonical_name;
      }
      if (!reasons.length && targetKind === "MATERIAL") {
        const target = await client.query(
          `SELECT material_name AS canonical_name FROM material WHERE part_no=$1`,
          [targetCode],
        );
        if (!target.rowCount) reasons.push(`找不到料號 ${targetCode}`);
        else canonicalName = target.rows[0].canonical_name;
      }

      const existing = aliasName
        ? await client.query(
          `SELECT target_kind, target_code, canonical_name, is_active
             FROM v_equipment_alias WHERE source_system=$1 AND alias_name=$2`,
          [sourceSystem, aliasName],
        )
        : { rowCount: 0, rows: [] };
      results.push({
        rowNo: row.rowNo,
        sourceSystem,
        aliasName,
        targetKind,
        targetCode,
        note,
        canonicalName,
        valid: reasons.length === 0,
        reasons,
        action: existing.rowCount ? "UPDATE" : "INSERT",
        existing: existing.rows[0] || null,
      });
    }
  } finally {
    await client.end();
  }

  const invalid = results.filter((row) => !row.valid);
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const defaultReport = path.join(systemRoot, ".local-rehearsal", `equipment-alias-validation-${stamp}.json`);
  const reportPath = argument("--report", defaultReport);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "VALIDATE_ONLY",
    database: parseDatabaseTarget(process.env.DATABASE_URL).database,
    input: {
      path: inputPath,
      sha256: crypto.createHash("sha256").update(text).digest("hex").toUpperCase(),
      rows: rows.length,
    },
    summary: {
      valid: results.length - invalid.length,
      invalid: invalid.length,
      readyToImport: invalid.length === 0 && results.length > 0,
    },
    rows: results,
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...report.summary, reportPath }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
