const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { Client } = require("pg");

process.env.NODE_ENV = "test";
process.env.ENV_FILE = process.env.ENV_FILE || ".env.test";
require("../src/config/loadEnvironment").loadEnvironment();

const { assertSafeDatabaseTarget, parseDatabaseTarget } = require("../src/config/databaseSafety");

const apiRoot = path.resolve(__dirname, "..");
const systemRoot = path.resolve(apiRoot, "..");
const dbRoot = path.join(systemRoot, "db-design");
const rehearsalRoot = path.join(systemRoot, ".local-rehearsal");
const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const freshName = `ntmc_erp_rehearsal_fresh_${timestamp}`;
const restoreName = `ntmc_erp_rehearsal_restore_${timestamp}`;

function databaseUrl(base, databaseName) {
  const url = new URL(base);
  url.pathname = `/${databaseName}`;
  url.search = "";
  return url.toString();
}

function toolPath(name) {
  if (name === "psql" && process.env.PSQL_PATH) return process.env.PSQL_PATH;
  if (process.env.PSQL_PATH) return path.join(path.dirname(process.env.PSQL_PATH), `${name}.exe`);
  return `${name}.exe`;
}

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: options.cwd || systemRoot,
    env: options.env || process.env,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error([
      `${path.basename(executable)} failed with exit code ${result.status}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join("\n"));
  }
  return `${result.stdout || ""}${result.stderr || ""}`;
}

function runSqlFile(database, file) {
  return run(
    toolPath("psql"),
    ["-X", "-v", "ON_ERROR_STOP=1", "-d", database, "-f", path.join(dbRoot, file)],
    { cwd: dbRoot },
  );
}

async function createDatabase(admin, databaseName) {
  assert.match(databaseName, /^ntmc_erp_rehearsal_[a-zA-Z0-9_]+$/);
  await admin.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0 ENCODING 'UTF8'`);
}

async function querySummary(database) {
  const client = new Client({ connectionString: database });
  await client.connect();
  try {
    const relations = await client.query(
      `SELECT
         (SELECT count(*)::int FROM schema_migration) AS ledger_rows,
         (SELECT count(*)::int FROM schema_migration WHERE migration_status='APPLIED') AS applied_rows,
         (SELECT count(*)::int FROM schema_migration WHERE migration_status='BASELINED') AS baselined_rows,
         to_regclass('public.equipment_alias')::text AS equipment_alias,
         to_regclass('public.v_equipment_alias')::text AS equipment_alias_view,
         (SELECT count(*)::int FROM app_user WHERE employee_no LIKE 'REH-%') AS rehearsal_users`,
    );
    const core = await client.query(
      `SELECT
         (SELECT count(*)::int FROM work_order) AS work_orders,
         (SELECT count(*)::int FROM material) AS materials,
         (SELECT count(*)::int FROM asset) AS assets,
         (SELECT count(*)::int FROM inventory_transaction) AS inventory_transactions`,
    );
    return { ...relations.rows[0], ...core.rows[0] };
  } finally {
    await client.end();
  }
}

async function main() {
  const sourceUrl = process.env.DATABASE_URL;
  if (!sourceUrl) throw new Error("DATABASE_URL is required");
  assertSafeDatabaseTarget({
    connectionString: sourceUrl,
    safetyMode: "rehearsal",
    allowedNamePattern: process.env.DATABASE_ALLOWED_NAME_PATTERN,
  });
  const sourceTarget = parseDatabaseTarget(sourceUrl);
  const adminUrl = databaseUrl(sourceUrl, "postgres");
  const freshUrl = databaseUrl(sourceUrl, freshName);
  const restoreUrl = databaseUrl(sourceUrl, restoreName);
  assertSafeDatabaseTarget({ connectionString: freshUrl, safetyMode: "rehearsal" });
  assertSafeDatabaseTarget({ connectionString: restoreUrl, safetyMode: "rehearsal" });

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await createDatabase(admin, freshName);
  } finally {
    await admin.end();
  }

  runSqlFile(freshUrl, "schema.postgres.sql");

  const runnerEnv = {
    ...process.env,
    DATABASE_URL: freshUrl,
    DATABASE_SAFETY_MODE: "rehearsal",
  };
  const firstMigrationRun = run(
    process.execPath,
    [
      path.join(apiRoot, "scripts", "apply-rehearsal-migrations.js"),
      "--baseline-existing",
      "--apply-missing",
    ],
    { cwd: apiRoot, env: runnerEnv },
  );
  assert.match(firstMigrationRun, /"ledgerRows": 26/);

  const seedFiles = [
    "seed-reference-data.sql",
    "seed-repair-workflow-options.sql",
    "seed-reference-lists.sql",
    "material-import-tamhai.sql",
    "import-master-data.sql",
    "import-pm-templates.sql",
    "seed-pm-p1-attachments.sql",
    "seed-rehearsal-integration.sql",
  ];
  seedFiles.forEach((file) => runSqlFile(freshUrl, file));
  runSqlFile(freshUrl, "verify-rehearsal-integration.sql");

  const secondMigrationRun = run(
    process.execPath,
    [path.join(apiRoot, "scripts", "apply-rehearsal-migrations.js"), "--apply-missing"],
    { cwd: apiRoot, env: runnerEnv },
  );
  assert.match(secondMigrationRun, /"verified": 25/);
  assert.match(secondMigrationRun, /"applied": 0/);

  const freshSummary = await querySummary(freshUrl);
  assert.equal(freshSummary.ledger_rows, 26);
  assert.equal(freshSummary.applied_rows + freshSummary.baselined_rows, 26);
  assert.equal(freshSummary.equipment_alias, "equipment_alias");
  assert.equal(freshSummary.equipment_alias_view, "v_equipment_alias");
  assert.equal(freshSummary.rehearsal_users, 6);

  process.env.DATABASE_URL = freshUrl;
  process.env.DATABASE_SAFETY_MODE = "rehearsal";
  process.env.AUTH_MODE = "api";
  process.env.SERVE_FRONTEND = "false";
  const app = require("../src/app");
  const { pool } = require("../src/db");
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const endpoints = [
    "/api/health",
    "/api/health/db",
    "/api/dashboard/summary",
    "/api/work-orders/all?limit=2",
    "/api/precheck/schedules?limit=2",
    "/api/inventory/summary?limit=2",
    "/api/turnaround/r-orders?limit=2",
    "/api/master-data/resources?limit=2",
    "/api/equipment-aliases?limit=2",
    "/api/reports/maintenance?limit=2",
  ];
  const endpointResults = [];
  try {
    for (const endpoint of endpoints) {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        headers: endpoint.startsWith("/api/health")
          ? {}
          : { authorization: "Bearer reh-system-admin-token" },
      });
      endpointResults.push({ endpoint, status: response.status });
      assert.equal(response.status, 200, `${endpoint} returned ${response.status}`);
    }
    const login = await fetch(`${baseUrl}/api/session/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "FRESH-DB-LOGIN" },
      body: JSON.stringify({
        account: "rehearsal.admin@example.invalid",
        password: "Rehearsal!2026",
      }),
    });
    assert.equal(login.status, 200);
    assert.match(login.headers.get("set-cookie"), /HttpOnly/);
    endpointResults.push({ endpoint: "/api/session/login", status: login.status });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool.end();
  }

  fs.mkdirSync(rehearsalRoot, { recursive: true });
  const backupPath = path.join(rehearsalRoot, `fresh-session-${timestamp}.dump`);
  run(toolPath("pg_dump"), [
    "-Fc", "--no-owner", "--no-privileges", "--file", backupPath, freshUrl,
  ]);
  const backup = fs.statSync(backupPath);
  assert.ok(backup.size > 0);

  const restoreAdmin = new Client({ connectionString: adminUrl });
  await restoreAdmin.connect();
  try {
    await createDatabase(restoreAdmin, restoreName);
  } finally {
    await restoreAdmin.end();
  }
  run(toolPath("pg_restore"), [
    "--dbname", restoreUrl, "--no-owner", "--no-privileges", "--exit-on-error", backupPath,
  ]);
  const restoreSummary = await querySummary(restoreUrl);
  assert.deepEqual(restoreSummary, freshSummary);

  console.log(JSON.stringify({
    ok: true,
    sourceDatabase: sourceTarget.database,
    freshDatabase: freshName,
    restoreDatabase: restoreName,
    migrationFirstRun: {
      ledgerRows: freshSummary.ledger_rows,
      applied: freshSummary.applied_rows,
      baselined: freshSummary.baselined_rows,
    },
    migrationSecondRun: { verified: 25, applied: 0 },
    freshSummary,
    restoreMatchesFresh: true,
    backup: { path: backupPath, bytes: backup.size },
    endpoints: endpointResults,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
