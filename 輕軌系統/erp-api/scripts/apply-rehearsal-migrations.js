const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { Client } = require("pg");

process.env.NODE_ENV = "test";
process.env.ENV_FILE ||= ".env.test";
process.env.DATABASE_SAFETY_MODE ||= "rehearsal";
require("../src/config/loadEnvironment").loadEnvironment();

const { assertSafeDatabaseTarget, parseDatabaseTarget } = require("../src/config/databaseSafety");
const {
  sha256File,
  validateMigrationManifest,
  verifyMigration,
} = require("../src/services/migrationLedger");

const root = path.resolve(__dirname, "..");
const dbDesignRoot = path.resolve(root, "..", "db-design");
const manifestPath = path.join(dbDesignRoot, "migration-manifest.json");
const ledgerPath = path.join(dbDesignRoot, "migration-schema-ledger.sql");
const args = new Set(process.argv.slice(2));
const baselineExisting = args.has("--baseline-existing");
const applyMissing = args.has("--apply-missing");
const planOnly = args.has("--plan") || (!baselineExisting && !applyMissing);

function readManifest() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return validateMigrationManifest(manifest, dbDesignRoot);
}

function runPsql(filePath) {
  const executable = process.env.PSQL_PATH || "psql.exe";
  const startedAt = Date.now();
  const result = spawnSync(
    executable,
    ["-X", "-v", "ON_ERROR_STOP=1", "-d", process.env.DATABASE_URL, "-f", filePath],
    { cwd: dbDesignRoot, encoding: "utf8", windowsHide: true },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`psql failed for ${path.basename(filePath)}:\n${result.stdout}\n${result.stderr}`);
  }
  return Date.now() - startedAt;
}

async function recordMigration(client, entry, status, executionMs, note) {
  await client.query(
    `INSERT INTO schema_migration (
       migration_id, sequence_no, file_name, file_sha256,
       migration_status, execution_ms, note
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [entry.id, entry.sequence, entry.file, entry.sha256, status, executionMs, note || null],
  );
}

async function ensureLedger(client) {
  const ledgerSql = fs.readFileSync(ledgerPath, "utf8");
  const ledgerSha = sha256File(ledgerPath);
  await client.query(ledgerSql);
  const existing = await client.query(
    `SELECT file_sha256 FROM schema_migration WHERE migration_id='schema-migration-ledger'`,
  );
  if (existing.rowCount) {
    if (existing.rows[0].file_sha256.trim() !== ledgerSha) {
      throw new Error("migration-schema-ledger.sql checksum changed after registration");
    }
    return;
  }
  await recordMigration(
    client,
    {
      id: "schema-migration-ledger",
      sequence: 0,
      file: path.basename(ledgerPath),
      sha256: ledgerSha,
    },
    "APPLIED",
    0,
    "Ledger bootstrap",
  );
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  assertSafeDatabaseTarget({
    connectionString: process.env.DATABASE_URL,
    safetyMode: process.env.DATABASE_SAFETY_MODE,
    allowedNamePattern: process.env.DATABASE_ALLOWED_NAME_PATTERN,
  });
  const target = parseDatabaseTarget(process.env.DATABASE_URL);
  const migrations = readManifest();
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();
  try {
    if (planOnly) {
      const plan = [];
      for (const entry of migrations) {
        plan.push({
          sequence: entry.sequence,
          file: entry.file,
          state: (await verifyMigration(client, entry)) ? "PRESENT" : "MISSING",
        });
      }
      plan.forEach((entry) => console.log(`${entry.state.padEnd(7)} ${entry.sequence} ${entry.file}`));
      console.log(JSON.stringify({
        ok: true,
        mode: "plan",
        database: target.database,
        present: plan.filter((entry) => entry.state === "PRESENT").length,
        missing: plan.filter((entry) => entry.state === "MISSING").length,
      }, null, 2));
      return;
    }

    await ensureLedger(client);
    const summary = { verified: 0, baselined: 0, applied: 0 };

    for (const entry of migrations) {
      const ledger = await client.query(
        `SELECT file_sha256, migration_status FROM schema_migration WHERE migration_id=$1`,
        [entry.id],
      );
      if (ledger.rowCount) {
        if (ledger.rows[0].file_sha256.trim() !== entry.sha256) {
          throw new Error(`${entry.file} checksum differs from schema_migration`);
        }
        if (!(await verifyMigration(client, entry))) {
          throw new Error(`${entry.file} is recorded but its verification query failed`);
        }
        summary.verified += 1;
        console.log(`VERIFY   ${entry.sequence} ${entry.file}`);
        continue;
      }

      if (await verifyMigration(client, entry)) {
        if (!baselineExisting) {
          throw new Error(`${entry.file} already exists but is not recorded; rerun with --baseline-existing`);
        }
        await recordMigration(client, entry, "BASELINED", 0, "Verified existing rehearsal schema");
        summary.baselined += 1;
        console.log(`BASELINE ${entry.sequence} ${entry.file}`);
        continue;
      }

      if (!applyMissing) {
        throw new Error(`${entry.file} is missing; rerun with --apply-missing after review`);
      }
      const executionMs = runPsql(entry.filePath);
      if (!(await verifyMigration(client, entry))) {
        throw new Error(`${entry.file} completed but its verification query failed`);
      }
      await recordMigration(client, entry, "APPLIED", executionMs, "Applied by rehearsal migration runner");
      summary.applied += 1;
      console.log(`APPLY    ${entry.sequence} ${entry.file}`);
    }

    const ledgerCount = await client.query(`SELECT count(*)::int AS count FROM schema_migration`);
    console.log(JSON.stringify({
      ok: true,
      database: target.database,
      manifestVersion: 1,
      migrations: migrations.length,
      ledgerRows: ledgerCount.rows[0].count,
      ...summary,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
