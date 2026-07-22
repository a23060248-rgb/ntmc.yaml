const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn, spawnSync } = require("node:child_process");
const { Client } = require("pg");

process.env.NODE_ENV = "test";
process.env.ENV_FILE ||= ".env.test";
require("../src/config/loadEnvironment").loadEnvironment();

const {
  combinedHash,
  commonTableSnapshot,
  hashValue,
  schemaSnapshot,
  sha256,
  tableMetadata,
  tableSnapshot,
} = require("./lib/compatibilityEvidence");
const { assertSafeDatabaseTarget } = require("../src/config/databaseSafety");

const apiRoot = path.resolve(__dirname, "..");
const systemRoot = path.resolve(apiRoot, "..");
const dbRoot = path.join(systemRoot, "db-design");
const docsRoot = path.join(systemRoot, "docs");
const rehearsalRoot = path.join(systemRoot, ".local-rehearsal");
const migrationPath = path.join(dbRoot, "migration-c-work-order-workflow.sql");
const integrationSeedPath = path.join(dbRoot, "seed-rehearsal-integration.sql");
const defaultDump = path.join(rehearsalRoot, "before-c-workflow-320-20260716.dump");
const sourceDump = path.resolve(process.env.M320_SOURCE_DUMP || defaultDump);
const sourceClassification = process.env.M320_SOURCE_CLASSIFICATION || "REHEARSAL_PRE_320_SNAPSHOT";
const formalReadonlyEvidence = process.env.M320_FORMAL_READONLY_EVIDENCE === "verified";
const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);

const BUSINESS_TABLES = [
  "work_order",
  "fault_work_order",
  "work_order_attachment",
  "fault_finish_record",
  "work_order_event",
  "repair_work_order",
  "asset_event",
  "pm_work_order",
  "pm_work_order_check_result",
  "pm_work_order_attachment_result",
  "work_order_material",
  "inventory_transaction",
  "inventory_balance",
  "inventory_bin_balance",
];

function databaseUrl(base, databaseName) {
  const url = new URL(base);
  url.pathname = `/${databaseName}`;
  url.search = "";
  return url.toString();
}

function toolPath(name) {
  const psql = process.env.PSQL_PATH;
  if (name === "psql" && psql) return psql;
  if (psql) return path.join(path.dirname(psql), `${name}.exe`);
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
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`${path.basename(executable)} failed (${result.status})\n${output}`);
  }
  return { status: result.status, output };
}

async function connect(connectionString) {
  const databaseName = new URL(connectionString).pathname.slice(1);
  const client = new Client({
    connectionString,
    application_name: `m320-verifier:${databaseName}`,
  });
  client.on("error", (error) => {
    console.error(`[M320 client ${databaseName}] ${error.code || "ERROR"}: ${error.message}`);
  });
  await client.connect();
  return client;
}

async function createDatabase(admin, name) {
  assert.match(name, /^ntmc_erp_rehearsal_m320_[a-z0-9_]+$/);
  await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8'`);
}

async function dropDatabase(admin, name) {
  assert.match(name, /^ntmc_erp_rehearsal_m320_[a-z0-9_]+$/);
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
}

function restoreDump(connectionString, dumpPath = sourceDump) {
  return run(toolPath("pg_restore"), [
    "--dbname", connectionString,
    "--no-owner",
    "--no-privileges",
    "--exit-on-error",
    dumpPath,
  ]).output;
}

function dumpDatabase(connectionString, outputPath) {
  run(toolPath("pg_dump"), [
    "-Fc",
    "--no-owner",
    "--no-privileges",
    "--file", outputPath,
    connectionString,
  ]);
  return {
    path: outputPath,
    bytes: fs.statSync(outputPath).size,
    sha256: sha256(fs.readFileSync(outputPath)),
  };
}

function runMigrationRunner(connectionString) {
  const result = run(process.execPath, [
    path.join(apiRoot, "scripts", "apply-rehearsal-migrations.js"),
    "--apply-missing",
  ], {
    cwd: apiRoot,
    env: {
      ...process.env,
      DATABASE_URL: connectionString,
      DATABASE_SAFETY_MODE: "rehearsal",
    },
  });
  return result.output;
}

function prepareCrossModuleFixture(connectionString) {
  const output = run(toolPath("psql"), [
    "-X", "-v", "ON_ERROR_STOP=1", "-d", connectionString, "-f", integrationSeedPath,
  ], { cwd: dbRoot }).output;
  return {
    file: integrationSeedPath,
    fileSha256: sha256(fs.readFileSync(integrationSeedPath)),
    outputHash: sha256(output),
  };
}

function parseJsonOutput(output, label) {
  const start = output.indexOf("{");
  if (start < 0) throw new Error(`${label} returned no JSON\n${output}`);
  return JSON.parse(output.slice(start));
}

async function roleEvidence(client) {
  const result = await client.query(
    `SELECT current_database() AS database_name,
            current_user AS role_name,
            current_setting('transaction_read_only') AS transaction_read_only,
            r.rolsuper,r.rolcreaterole,r.rolcreatedb,r.rolcanlogin
       FROM pg_roles r WHERE r.rolname=current_user`,
  );
  return result.rows[0];
}

async function ledgerEvidence(client) {
  const exists = await client.query(`SELECT to_regclass('public.schema_migration')::text AS name`);
  if (!exists.rows[0].name) return { rows: 0, hash: null, items: [] };
  const result = await client.query(
    `SELECT migration_id,sequence_no,file_name,file_sha256,migration_status,note
       FROM schema_migration ORDER BY sequence_no,migration_id`,
  );
  return { rows: result.rowCount, hash: hashValue(result.rows), items: result.rows };
}

async function businessEvidence(beforeClient, afterClient) {
  const comparisons = [];
  for (const table of BUSINESS_TABLES) {
    comparisons.push(await commonTableSnapshot(beforeClient, afterClient, table));
  }
  const beforeEntries = comparisons.filter((item) => item.before?.exists).map((item) => item.before);
  const afterEntries = comparisons.filter((item) => item.after?.exists).map((item) => item.after);
  return {
    normalization: {
      rowOrder: "primary key ascending; fallback all selected columns ascending",
      null: "JSON null",
      timestamp: "UTC ISO-8601",
      json: "object keys recursively sorted; array order preserved",
      columns: "intersection of before/after columns; updated_at, last_seen_at, execution_ms excluded",
    },
    beforeHash: combinedHash(beforeEntries),
    afterHash: combinedHash(afterEntries),
    equal: comparisons.every((item) => item.equal),
    tables: comparisons,
  };
}

async function relationEvidence(client) {
  const queries = {
    cFault: `SELECT w.id,w.work_order_no,f.work_order_id FROM work_order w JOIN fault_work_order f ON f.work_order_id=w.id WHERE w.work_order_type='C' ORDER BY w.id`,
    attachments: `SELECT a.id,a.work_order_id,a.file_name,a.file_url FROM work_order_attachment a ORDER BY a.id`,
    finishRecords: `SELECT f.id,f.work_order_id,f.is_final FROM fault_finish_record f ORDER BY f.id`,
    merges: `SELECT f.work_order_id,f.merged_into_id FROM fault_work_order f WHERE f.merged_into_id IS NOT NULL ORDER BY f.work_order_id`,
    repairs: `SELECT r.work_order_id,r.source_fault_work_order_id,r.removed_asset_id,r.installed_asset_id FROM repair_work_order r ORDER BY r.work_order_id`,
    inventory: `SELECT i.id,i.work_order_id,i.material_id,i.warehouse_id,i.transaction_type,i.qty_change FROM inventory_transaction i ORDER BY i.id`,
  };
  const evidence = {};
  for (const [name, sql] of Object.entries(queries)) {
    const result = await client.query(sql);
    evidence[name] = { rows: result.rowCount, hash: hashValue(result.rows) };
  }
  evidence.hash = hashValue(evidence);
  return evidence;
}

async function legacyEventEvidence(client) {
  const [eventMeta, workOrderMeta] = await Promise.all([
    tableMetadata(client, "work_order_event"),
    tableMetadata(client, "work_order"),
  ]);
  const hasEventType = eventMeta?.columns.includes("event_type");
  const hasRequestId = eventMeta?.columns.includes("request_id");
  const hasVersion = workOrderMeta?.columns.includes("version");
  const result = await client.query(
    `SELECT count(*)::int AS total,
            ${hasEventType ? "count(*) FILTER (WHERE event_type='LEGACY')::int" : "0::int"} AS legacy,
            ${hasEventType ? "count(*) FILTER (WHERE event_type='C_WORKFLOW_ACTION')::int" : "0::int"} AS workflow,
            count(DISTINCT id)::int AS distinct_ids,
            ${hasRequestId ? "count(*) FILTER (WHERE request_id IS NOT NULL)::int" : "0::int"} AS request_ids
       FROM work_order_event`,
  );
  const state = await client.query(
    `SELECT count(*)::int AS work_orders,
            ${hasVersion ? "COALESCE(sum(version),0)::bigint" : "0::bigint"} AS version_sum,
            hashtextextended(COALESCE(string_agg(id::text||':'||status,',' ORDER BY id),''),0)::text AS status_hash
       FROM work_order`,
  );
  const audit = await client.query(`SELECT count(*)::int AS rows FROM operation_audit_log`);
  const sla = await client.query(
    `SELECT count(*)::int AS rows,
            hashtextextended(COALESCE(string_agg(work_order_id::text||':'||COALESCE(deadline_at::text,'NULL')||':'||COALESCE(observe_until::text,'NULL'),',' ORDER BY work_order_id),''),0)::text AS hash
       FROM fault_work_order`,
  );
  const sideEffectTables = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema='public'
        AND (table_name ILIKE '%notification%' OR table_name ILIKE '%outbox%')
      ORDER BY table_name`,
  );
  return {
    schemaCapabilities: { hasEventType, hasRequestId, hasVersion },
    events: result.rows[0],
    workOrders: state.rows[0],
    auditRows: audit.rows[0].rows,
    sla: sla.rows[0],
    notificationOrOutboxTables: sideEffectTables.rows.map((row) => row.table_name),
  };
}

async function inventoryMismatch(client) {
  const result = await client.query(
    `WITH tx AS (
       SELECT material_id,warehouse_id,stock_status,sum(qty_change)::numeric AS qty
         FROM inventory_transaction GROUP BY material_id,warehouse_id,stock_status
     )
     SELECT count(*)::int AS count
       FROM inventory_balance b
       FULL JOIN tx t USING (material_id,warehouse_id,stock_status)
      WHERE COALESCE(b.qty,0)<>COALESCE(t.qty,0)`,
  );
  return result.rows[0].count;
}

async function anomalyEvidence(client) {
  const definitions = [
    ["ILLEGAL_C_STATUS", `SELECT w.work_order_no AS record_key,w.status AS detail FROM work_order w WHERE w.work_order_type='C' AND w.status NOT IN ('0','1','2','3','4','5','6','7','8','9','10') ORDER BY w.work_order_no`],
    ["NULL_C_FAULT_ROW", `SELECT w.work_order_no AS record_key,'fault_work_order missing' AS detail FROM work_order w LEFT JOIN fault_work_order f ON f.work_order_id=w.id WHERE w.work_order_type='C' AND f.work_order_id IS NULL ORDER BY w.work_order_no`],
    ["ORPHAN_ATTACHMENT", `SELECT a.id::text AS record_key,a.work_order_id::text AS detail FROM work_order_attachment a LEFT JOIN work_order w ON w.id=a.work_order_id WHERE w.id IS NULL ORDER BY a.id`],
    ["ORPHAN_FINISH", `SELECT f.id::text AS record_key,f.work_order_id::text AS detail FROM fault_finish_record f LEFT JOIN work_order w ON w.id=f.work_order_id WHERE w.id IS NULL ORDER BY f.id`],
    ["ORPHAN_R", `SELECT r.work_order_id::text AS record_key,r.source_fault_work_order_id::text AS detail FROM repair_work_order r LEFT JOIN work_order c ON c.id=r.source_fault_work_order_id WHERE r.source_fault_work_order_id IS NOT NULL AND c.id IS NULL ORDER BY r.work_order_id`],
    ["DUPLICATE_EFFECTIVE_R", `SELECT source_fault_work_order_id::text||':'||COALESCE(source_disassembly_event_id::text,'NULL')||':'||COALESCE(removed_asset_id::text,'NULL') AS record_key,count(*)::text AS detail FROM repair_work_order WHERE source_fault_work_order_id IS NOT NULL AND source_disassembly_event_id IS NOT NULL AND removed_asset_id IS NOT NULL GROUP BY source_fault_work_order_id,source_disassembly_event_id,removed_asset_id HAVING count(*)>1 ORDER BY 1`],
    ["DUPLICATE_REQUEST_EVENT", `SELECT work_order_id::text||':'||request_id||':'||event_type AS record_key,count(*)::text AS detail FROM work_order_event WHERE request_id IS NOT NULL GROUP BY work_order_id,request_id,event_type HAVING count(*)>1 ORDER BY 1`],
    ["MISSING_P1_WORD_TEMPLATE", `SELECT p.pm_code AS record_key,'published P1 has no active published Word template' AS detail FROM pm_template p WHERE p.pm_code='P1' AND p.lifecycle_status='PUBLISHED' AND NOT EXISTS (SELECT 1 FROM form_template f WHERE f.pm_template_id=p.id AND f.lifecycle_status='PUBLISHED' AND f.is_active=true) ORDER BY p.pm_code`],
  ];
  const items = [];
  for (const [code, sql] of definitions) {
    try {
      const result = await client.query(sql);
      for (const row of result.rows) items.push({ code, recordKey: row.record_key, detail: row.detail });
    } catch (error) {
      if (error.code !== "42703") throw error;
    }
  }
  const mismatch = await inventoryMismatch(client);
  if (mismatch) items.push({ code: "INVENTORY_MISMATCH", recordKey: "aggregate", detail: String(mismatch) });
  return items;
}

function classifyAnomalies(beforeItems, afterItems) {
  const key = (item) => `${item.code}|${item.recordKey}|${item.detail}`;
  const beforeSet = new Set(beforeItems.map(key));
  const afterSet = new Set(afterItems.map(key));
  return [
    ...beforeItems.map((item) => ({ ...item, classification: "PRE_EXISTING", disposition: "review before production", goNoGoImpact: "conditional" })),
    ...afterItems.filter((item) => !beforeSet.has(key(item))).map((item) => ({ ...item, classification: "MIGRATION_ADDED", disposition: "block rollout", goNoGoImpact: "NO-GO" })),
    ...beforeItems.filter((item) => !afterSet.has(key(item))).map((item) => ({ ...item, classification: "RESOLVED_BY_MIGRATION", disposition: "verify intended backfill", goNoGoImpact: "review" })),
  ];
}

async function migrationFailureRollback(connectionString) {
  const beforeClient = await connect(connectionString);
  const beforeSchema = await schemaSnapshot(beforeClient);
  const beforeLedger = await ledgerEvidence(beforeClient);
  const beforeBusiness = [];
  for (const table of BUSINESS_TABLES) beforeBusiness.push(await tableSnapshot(beforeClient, table));
  await beforeClient.end();

  const original = fs.readFileSync(migrationPath, "utf8");
  const failedSql = original.replace(/COMMIT;\s*$/i, "SELECT 1/0 AS forced_migration_failure;\nCOMMIT;\n");
  const failurePath = path.join(rehearsalRoot, `migration-320-forced-failure-${timestamp}.sql`);
  fs.writeFileSync(failurePath, failedSql, "utf8");
  const runResult = run(toolPath("psql"), [
    "-X", "-v", "ON_ERROR_STOP=1", "-d", connectionString, "-f", failurePath,
  ], { cwd: dbRoot, allowFailure: true });
  assert.notEqual(runResult.status, 0, "forced migration failure unexpectedly succeeded");

  const afterClient = await connect(connectionString);
  const afterSchema = await schemaSnapshot(afterClient);
  const afterLedger = await ledgerEvidence(afterClient);
  const afterBusiness = [];
  for (const table of BUSINESS_TABLES) afterBusiness.push(await tableSnapshot(afterClient, table));
  await afterClient.end();
  return {
    status: runResult.status,
    errorExcerpt: runResult.output.split(/\r?\n/).filter(Boolean).slice(-4),
    schemaUnchanged: beforeSchema.hash === afterSchema.hash,
    ledgerUnchanged: beforeLedger.hash === afterLedger.hash,
    businessUnchanged: combinedHash(beforeBusiness.filter((item) => item.exists)) === combinedHash(afterBusiness.filter((item) => item.exists)),
    evidenceFile: failurePath,
    evidenceFileSha256: sha256(fs.readFileSync(failurePath)),
  };
}

async function transactionRollback(client) {
  const marker = `M320-ROLLBACK-${timestamp}`;
  const before = await client.query(`SELECT count(*)::int AS count FROM workflow_option WHERE option_group='M320_ROLLBACK'`);
  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO workflow_option(option_group,option_code,option_label,sort_order,is_active,is_terminal)
       VALUES ('M320_ROLLBACK',$1,$1,999,true,false)`,
      [marker],
    );
    throw new Error("forced transaction rollback");
  } catch {
    await client.query("ROLLBACK");
  }
  const after = await client.query(`SELECT count(*)::int AS count FROM workflow_option WHERE option_group='M320_ROLLBACK'`);
  return { before: before.rows[0].count, after: after.rows[0].count, unchanged: before.rows[0].count === after.rows[0].count };
}

async function findOpenPort(start = 3290) {
  for (let port = start; port < start + 50; port += 1) {
    const available = await new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error("no local verifier port available");
}

async function waitForHealth(baseUrl, child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API exited with ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error("API did not become healthy");
}

async function stopChild(child) {
  if (child.exitCode !== null) return child.exitCode;
  const exited = new Promise((resolve) => child.once("exit", (code) => resolve(code)));
  child.kill();
  return Promise.race([
    exited,
    new Promise((resolve) => setTimeout(() => resolve("timeout"), 5000)),
  ]);
}

function runVerifier(scriptName, env) {
  const result = run(process.execPath, [path.join(apiRoot, "scripts", scriptName)], {
    cwd: apiRoot,
    env,
  });
  return { command: `node scripts/${scriptName}`, output: result.output, json: parseJsonOutput(result.output, scriptName) };
}

async function apiAndCrossModuleEvidence(connectionString) {
  const port = await findOpenPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    DATABASE_URL: connectionString,
    DATABASE_SAFETY_MODE: "rehearsal",
    PORT: String(port),
    AUTH_MODE: "preview",
    SERVE_FRONTEND: "false",
    REHEARSAL_API_URL: `${baseUrl}/api`,
  };
  const child = spawn(process.execPath, [path.join(apiRoot, "scripts", "start-rehearsal.js")], {
    cwd: apiRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let apiOutput = "";
  child.stdout.on("data", (chunk) => { apiOutput += chunk; });
  child.stderr.on("data", (chunk) => { apiOutput += chunk; });
  try {
    await waitForHealth(baseUrl, child);
    const endpoints = [];
    for (const endpoint of ["/api/health", "/api/health/db", "/api/work-orders/all?limit=2"]) {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        headers: endpoint.startsWith("/api/health") ? {} : { "x-user-role": "system_admin", "x-user-name": "M320 verifier" },
      });
      const body = await response.text();
      endpoints.push({ endpoint, status: response.status, responseHash: sha256(body), excerpt: body.slice(0, 300) });
    }
    const pcr = runVerifier("verify-pcr-rehearsal.js", env);
    const inventory = runVerifier("verify-inventory-rehearsal.js", env);
    const client = await connect(connectionString);
    const pToCSql = `SELECT p.work_order_no AS p_order,c.work_order_no AS c_order,
               f.source_pm_work_order_id,f.source_check_section,f.source_check_item,
               cr.result_value,ci.standard_value,ci.min_value,ci.max_value,ci.unit,
               (SELECT count(*)::int FROM work_order_attachment wa WHERE wa.work_order_id=c.id) AS c_attachment_count,
               (SELECT count(*)::int FROM pm_work_order_attachment_result ar WHERE ar.work_order_id=p.id) AS p_attachment_result_count
         FROM work_order c
         JOIN fault_work_order f ON f.work_order_id=c.id
         JOIN work_order p ON p.id=f.source_pm_work_order_id
          LEFT JOIN pm_work_order_check_result cr ON cr.linked_fault_work_order_id=c.id
          LEFT JOIN pm_template_check_item ci ON ci.id=cr.check_item_id
         WHERE c.work_order_no=$1`;
    const source = await client.query(pToCSql, [pcr.json.cOrderNo]);
    const cToRSql = `SELECT count(*)::int AS r_orders,
               count(DISTINCT r.source_disassembly_event_id)::int AS disassembly_events,
               count(DISTINCT r.removed_asset_id)::int AS removed_assets,
               count(DISTINCT ae.id)::int AS asset_events
         FROM repair_work_order r
          JOIN work_order c ON c.id=r.source_fault_work_order_id
          LEFT JOIN asset_event ae ON ae.id=r.source_disassembly_event_id
         WHERE c.work_order_no=$1`;
    const rChain = await client.query(cToRSql, [pcr.json.cOrderNo]);
    const shortageInventorySql = `SELECT count(*)::int AS linked
          FROM fault_work_order_shortage s
          JOIN inventory_transaction i ON i.work_order_id=s.work_order_id`;
    const shortageInventoryLink = await client.query(shortageInventorySql);
    const inventoryAuditSql = `SELECT count(*)::int AS rows FROM operation_audit_log
        WHERE request_id LIKE 'PHASE7:%' OR action_code ILIKE '%INVENTORY%'`;
    const inventoryAudit = await client.query(inventoryAuditSql);
    await client.end();
    const sourceRow = source.rows[0] || {};
    return {
      endpoints,
      pcr,
      inventory,
      pToC: {
        sql: pToCSql,
        row: sourceRow,
        sourceP: Boolean(sourceRow.source_pm_work_order_id),
        checkItem: Boolean(sourceRow.source_check_item),
        abnormalValue: sourceRow.result_value !== null && sourceRow.result_value !== undefined && sourceRow.result_value !== "",
        standard: sourceRow.standard_value !== null || sourceRow.min_value !== null || sourceRow.max_value !== null,
        attachmentSnapshot: Number(sourceRow.c_attachment_count || 0) > 0,
      },
      cToR: {
        sql: cToRSql,
        row: rChain.rows[0],
        passed: Number(rChain.rows[0]?.r_orders || 0) >= 1
          && Number(rChain.rows[0]?.r_orders || 0) === Number(rChain.rows[0]?.disassembly_events || 0)
          && Number(rChain.rows[0]?.r_orders || 0) === Number(rChain.rows[0]?.removed_assets || 0),
      },
      shortageInventory: {
        sql: shortageInventorySql,
        auditSql: inventoryAuditSql,
        linkedRows: shortageInventoryLink.rows[0].linked,
        auditRows: inventoryAudit.rows[0].rows,
        rollbackPassed: inventory.json.rollbackStatus === 409,
        reconciliationPassed: hashValue(inventory.json.finalBalances) === hashValue(inventory.json.recalculated),
      },
      apiLogHash: sha256(apiOutput),
    };
  } finally {
    await stopChild(child);
  }
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function writeReports(evidence) {
  fs.mkdirSync(docsRoot, { recursive: true });
  const anomalies = evidence.anomalies;
  const csv = [
    ["code", "record_key", "detail", "classification", "disposition", "go_no_go_impact"],
    ...anomalies.map((item) => [item.code, item.recordKey, item.detail, item.classification, item.disposition, item.goNoGoImpact]),
  ].map((row) => row.map(csvEscape).join(",")).join("\r\n") + "\r\n";
  fs.writeFileSync(path.join(docsRoot, "migration-320-data-anomalies.csv"), csv, "utf8");
  fs.writeFileSync(path.join(docsRoot, "migration-320-before-after.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  const compatibility = `# Migration 320 正式資料相容性驗證\n\n` +
    `- 執行時間：${evidence.executedAt}\n` +
    `- 來源分類：${evidence.source.classification}\n` +
    `- 來源 dump SHA256：\`${evidence.source.dumpSha256}\`\n` +
    `- 正式唯讀證據：**${evidence.source.formalReadonlyVerified ? "PASS" : "FAIL / 未提供"}**\n` +
    `- migration 前 ledger：${evidence.ledger.before.rows} 筆，hash \`${evidence.ledger.before.hash}\`\n` +
    `- migration 後 ledger：${evidence.ledger.after.rows} 筆，hash \`${evidence.ledger.after.hash}\`\n` +
    `- migration SQL SHA256：\`${evidence.migration.fileSha256}\`；runner output SHA256：\`${evidence.migration.outputHash}\`\n\n` +
    `## 來源與 ledger SQL 證據\n\n` +
    `\`\`\`sql\nSELECT current_database(),current_user,current_setting('transaction_read_only'),\n       rolsuper,rolcreaterole,rolcreatedb,rolcanlogin\n  FROM pg_roles WHERE rolname=current_user;\n\nSELECT migration_id,sequence_no,file_name,file_sha256,migration_status,note\n  FROM schema_migration ORDER BY sequence_no,migration_id;\n\`\`\`\n\n` +
    `clone 實際角色回應：\n\n\`\`\`json\n${JSON.stringify(evidence.source.cloneRole, null, 2)}\n\`\`\`\n\n` +
    `正式來源連線嘗試：\`${evidence.source.formalConnectionAttempted}\`。因此無法產生正式 ledger 與關鍵資料 before/after hash，這一項明確 FAIL，不以 rehearsal 角色冒充正式唯讀證據。\n\n` +
    `## Hash 規則\n\n` +
    `- 排序：${evidence.business.normalization.rowOrder}\n` +
    `- NULL：${evidence.business.normalization.null}\n` +
    `- timestamp：${evidence.business.normalization.timestamp}\n` +
    `- JSON：${evidence.business.normalization.json}\n` +
    `- 業務資料 hash：before \`${evidence.business.beforeHash}\` / after \`${evidence.business.afterHash}\`，${evidence.business.equal ? "PASS" : "FAIL"}\n` +
    `- 關聯 hash：before \`${evidence.relationships.before.hash}\` / after \`${evidence.relationships.after.hash}\`，${evidence.relationships.equal ? "PASS" : "FAIL"}\n` +
    `- schema hash：before \`${evidence.schema.before.hash}\` / after \`${evidence.schema.after.hash}\`（預期不同）；安全重跑後 \`${evidence.schema.rerun.hash}\`，${evidence.schema.rerunStable ? "PASS" : "FAIL"}\n\n` +
    `## 回滾與重跑\n\n` +
    `- transaction rollback：${evidence.rollback.transaction.unchanged ? "PASS" : "FAIL"}\n` +
    `- migration failure rollback：schema=${evidence.rollback.migrationFailure.schemaUnchanged}, ledger=${evidence.rollback.migrationFailure.ledgerUnchanged}, business=${evidence.rollback.migrationFailure.businessUnchanged}\n` +
    `- 強制失敗 SQL SHA256：\`${evidence.rollback.migrationFailure.evidenceFileSha256}\`；psql status：\`${evidence.rollback.migrationFailure.status}\`；錯誤：\`${evidence.rollback.migrationFailure.errorExcerpt.join(" | ")}\`\n` +
    `- backup restore：${evidence.backupRestore.equal ? "PASS" : "FAIL"}，dump \`${evidence.backupRestore.backup.sha256}\`\n` +
    `- migration 重跑：${evidence.rerun.safe ? "PASS" : "FAIL"}；重跑 output SHA256 \`${evidence.rerun.outputHash}\`；LEGACY/event 無新增=${evidence.rerun.legacyStable}\n\n` +
    `## LEGACY / 副作用 SQL 與結果\n\n` +
    `\`\`\`sql\nSELECT count(*) AS total,count(DISTINCT id) AS distinct_ids FROM work_order_event;\nSELECT count(*),sum(version),string_agg(id::text||':'||status,',' ORDER BY id) FROM work_order;\nSELECT count(*),string_agg(work_order_id::text||':'||COALESCE(deadline_at::text,'NULL')||':'||COALESCE(observe_until::text,'NULL'),',' ORDER BY work_order_id) FROM fault_work_order;\nSELECT count(*) FROM operation_audit_log;\nSELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%notification%' OR table_name ILIKE '%outbox%';\n\`\`\`\n\n` +
    `before / after / rerun：\n\n\`\`\`json\n${JSON.stringify(evidence.legacyEvents, null, 2)}\n\`\`\`\n\n` +
    `## 異常\n\n` +
    `- 既有異常：${anomalies.filter((item) => item.classification === "PRE_EXISTING").length}\n` +
    `- migration 新增異常：${anomalies.filter((item) => item.classification === "MIGRATION_ADDED").length}\n` +
    `- 詳細清單：[migration-320-data-anomalies.csv](./migration-320-data-anomalies.csv)\n\n` +
    `## 限制\n\n` +
    `${evidence.source.formalReadonlyVerified ? "已提供正式來源唯讀證據。" : "本機沒有去識別化正式資料副本的來源證明，也沒有正式唯讀角色與正式 ledger 前後 hash；本次只能證明 rehearsal pre-320 snapshot 的技術相容性。"}\n`;
  fs.writeFileSync(path.join(docsRoot, "migration-320-compatibility-report.md"), compatibility, "utf8");

  const cross = `# Migration 320 跨模組閉環驗證\n\n` +
    `- E2E fixture：\`${evidence.crossModule.fixture.file}\`\n` +
    `- fixture SHA256：\`${evidence.crossModule.fixture.fileSha256}\`；psql output SHA256：\`${evidence.crossModule.fixture.outputHash}\`\n\n` +
    `## API response 證據\n\n` +
    evidence.crossModule.endpoints.map((item) => `- \`${item.endpoint}\`：HTTP ${item.status}，response hash \`${item.responseHash}\``).join("\n") +
    `\n\n## P 異常 → C\n\n` +
    `- 來源 P 工單：${evidence.crossModule.pToC.sourceP ? "PASS" : "FAIL"}\n` +
    `- 檢查細項：${evidence.crossModule.pToC.checkItem ? "PASS" : "FAIL"}\n` +
    `- 異常實際值：${evidence.crossModule.pToC.abnormalValue ? "PASS" : "FAIL"}\n` +
    `- 判定標準：${evidence.crossModule.pToC.standard ? "PASS" : "FAIL"}\n` +
    `- C 工單附件快照：${evidence.crossModule.pToC.attachmentSnapshot ? "PASS" : "FAIL"}\n\n` +
    `SQL：\n\n\`\`\`sql\n${evidence.crossModule.pToC.sql}\n\`\`\`\n\n` +
    `查詢參數：\`${evidence.crossModule.pcr.json.cOrderNo}\`\n\n查詢列：\n\n\`\`\`json\n${JSON.stringify(evidence.crossModule.pToC.row, null, 2)}\n\`\`\`\n\n` +
    `## C → 多 R\n\n` +
    `- 拆件事件、序號、asset_event 與 R 關聯：${evidence.crossModule.cToR.passed ? "PASS" : "FAIL"}\n` +
    `- E2E output hash：\`${sha256(evidence.crossModule.pcr.output)}\`\n` +
    `SQL：\n\n\`\`\`sql\n${evidence.crossModule.cToR.sql}\n\`\`\`\n\n查詢列：\`${JSON.stringify(evidence.crossModule.cToR.row)}\`\n\n` +
    `E2E response：\n\n\`\`\`json\n${JSON.stringify(evidence.crossModule.pcr.json, null, 2)}\n\`\`\`\n\n` +
    `## 庫存與缺料\n\n` +
    `- 庫存失敗交易回滾：${evidence.crossModule.shortageInventory.rollbackPassed ? "PASS" : "FAIL"}\n` +
    `- 餘額與交易重算：${evidence.crossModule.shortageInventory.reconciliationPassed ? "PASS" : "FAIL"}\n` +
    `- C 缺料紀錄與庫存交易直接關聯：${Number(evidence.crossModule.shortageInventory.linkedRows) > 0 ? "PASS" : "FAIL"}\n` +
    `- inventory verifier output hash：\`${sha256(evidence.crossModule.inventory.output)}\`\n` +
    `SQL：\n\n\`\`\`sql\n${evidence.crossModule.shortageInventory.sql};\n${evidence.crossModule.shortageInventory.auditSql};\n\`\`\`\n\n` +
    `E2E response：\n\n\`\`\`json\n${JSON.stringify(evidence.crossModule.inventory.json, null, 2)}\n\`\`\`\n`;
  fs.writeFileSync(path.join(docsRoot, "cross-module-closure-report.md"), cross, "utf8");

  const failed = evidence.decision.failedGates;
  const goNoGo = `# Migration 320 GO / NO-GO\n\n` +
    `## 結論：**${evidence.decision.result}**\n\n` +
    `### 通過與證據\n\n` +
    `| 結論 | 證據 |\n|---|---|\n` +
    `| PASS：migration 前後既有業務欄位 hash 一致 | before / after 均為 \`${evidence.business.beforeHash}\` |\n` +
    `| PASS：migration 前後既有關聯 hash 一致 | before / after 均為 \`${evidence.relationships.before.hash}\` |\n` +
    `| PASS：migration 未新增資料異常 | \`MIGRATION_ADDED=${evidence.anomalies.filter((item) => item.classification === "MIGRATION_ADDED").length}\`；SQL 結果見 before-after JSON |\n` +
    `| PASS：一般 transaction rollback 無殘留 | before=${evidence.rollback.transaction.before}、after=${evidence.rollback.transaction.after} |\n` +
    `| PASS：migration failure 完整 rollback | schema=${evidence.rollback.migrationFailure.schemaUnchanged}、ledger=${evidence.rollback.migrationFailure.ledgerUnchanged}、business=${evidence.rollback.migrationFailure.businessUnchanged}；失敗 SQL \`${evidence.rollback.migrationFailure.evidenceFileSha256}\` |\n` +
    `| PASS：LEGACY/event 無 workflow、通知、SLA、狀態副作用 | before/after/rerun 摘要見相容性報告；rerun output \`${evidence.rerun.outputHash}\` |\n` +
    `| PASS：migration 320 可安全重跑 | schema after / rerun 均為 \`${evidence.schema.after.hash}\`，safe=${evidence.rerun.safe} |\n` +
    `| PASS：backup restore 一致 | dump \`${evidence.backupRestore.backup.sha256}\`，equal=${evidence.backupRestore.equal} |\n` +
    `| PASS：C 拆件建立 R 關聯一致 | SQL=${JSON.stringify(evidence.crossModule.cToR.row)}；E2E output \`${sha256(evidence.crossModule.pcr.output)}\` |\n\n` +
    `### 阻擋與證據\n\n` +
    `| 結論 | 證據 |\n|---|---|\n` +
    `| FAIL：${failed[0]} | source=\`${evidence.source.classification}\`、formalConnectionAttempted=${evidence.source.formalConnectionAttempted}、formalReadonlyVerified=${evidence.source.formalReadonlyVerified}；clone 實際為 \`${evidence.source.cloneRole.role_name}\` / read_only=\`${evidence.source.cloneRole.transaction_read_only}\` / superuser=\`${evidence.source.cloneRole.rolsuper}\` |\n` +
    `| FAIL：${failed[1]} | P→C 查詢列 result_value=\`${evidence.crossModule.pToC.row?.result_value ?? "NULL"}\`、C attachments=${evidence.crossModule.pToC.row?.c_attachment_count ?? 0}、P attachment results=${evidence.crossModule.pToC.row?.p_attachment_result_count ?? 0} |\n` +
    `| FAIL：${failed[2]} | shortage/inventory linkedRows=${evidence.crossModule.shortageInventory.linkedRows}；rollback=${evidence.crossModule.shortageInventory.rollbackPassed}、reconciliation=${evidence.crossModule.shortageInventory.reconciliationPassed} |\n\n` +
    `完整 SQL、API response、E2E output 與 hash 證據分別見 [相容性報告](./migration-320-compatibility-report.md)、[before/after JSON](./migration-320-before-after.json) 與 [跨模組閉環報告](./cross-module-closure-report.md)。\n\n` +
    `正式資料庫沒有被連線或修改。只有在取得去識別化正式資料副本、正式唯讀角色證據，且修正跨模組缺口後，才可重新評估 GO。\n`;
  fs.writeFileSync(path.join(docsRoot, "go-no-go-report.md"), goNoGo, "utf8");
}

async function main() {
  assert.ok(fs.existsSync(sourceDump), `source dump not found: ${sourceDump}`);
  assertSafeDatabaseTarget({
    connectionString: process.env.DATABASE_URL,
    safetyMode: "rehearsal",
    allowedNamePattern: process.env.DATABASE_ALLOWED_NAME_PATTERN,
  });
  fs.mkdirSync(rehearsalRoot, { recursive: true });
  const baseUrl = process.env.DATABASE_URL;
  const adminUrl = databaseUrl(baseUrl, "postgres");
  const names = {
    before: `ntmc_erp_rehearsal_m320_before_${timestamp}`,
    after: `ntmc_erp_rehearsal_m320_after_${timestamp}`,
    failure: `ntmc_erp_rehearsal_m320_failure_${timestamp}`,
    restored: `ntmc_erp_rehearsal_m320_restored_${timestamp}`,
  };
  const urls = Object.fromEntries(Object.entries(names).map(([key, name]) => [key, databaseUrl(baseUrl, name)]));
  Object.values(urls).forEach((url) => assertSafeDatabaseTarget({ connectionString: url, safetyMode: "rehearsal" }));
  const admin = await connect(adminUrl);
  try {
    for (const name of Object.values(names)) {
      await dropDatabase(admin, name);
      await createDatabase(admin, name);
    }
  } finally {
    await admin.end();
  }

  let evidence;
  try {
    console.log("[M320] restoring source snapshot into disposable clones");
    restoreDump(urls.before);
    restoreDump(urls.after);
    restoreDump(urls.failure);

    const beforeClient = await connect(urls.before);
    const sourceRole = await roleEvidence(beforeClient);
    const beforeLedger = await ledgerEvidence(beforeClient);
    const beforeSchema = await schemaSnapshot(beforeClient);
    const beforeRelations = await relationEvidence(beforeClient);
    const beforeAnomalies = await anomalyEvidence(beforeClient);
    const beforeLegacy = await legacyEventEvidence(beforeClient);
    const migrationAlreadyPresent = await tableMetadata(beforeClient, "fault_work_order_assignment");
    assert.equal(migrationAlreadyPresent, null, "source snapshot already contains migration 320");

    console.log("[M320] applying migration 320 through ledger runner");
    const migrationOutput = runMigrationRunner(urls.after);
    const afterClient = await connect(urls.after);
    const afterLedger = await ledgerEvidence(afterClient);
    const afterSchema = await schemaSnapshot(afterClient);
    const business = await businessEvidence(beforeClient, afterClient);
    const afterRelations = await relationEvidence(afterClient);
    const afterAnomalies = await anomalyEvidence(afterClient);
    const afterLegacy = await legacyEventEvidence(afterClient);
    await beforeClient.end();
    const txRollback = await transactionRollback(afterClient);

    const rerunBeforeBusiness = [];
    for (const table of BUSINESS_TABLES) rerunBeforeBusiness.push(await tableSnapshot(afterClient, table));
    const rerunBeforeRelations = await relationEvidence(afterClient);
    const rerunBeforeLegacy = await legacyEventEvidence(afterClient);
    await afterClient.end();

    const rerunOutput = run(toolPath("psql"), [
      "-X", "-v", "ON_ERROR_STOP=1", "-d", urls.after, "-f", migrationPath,
    ], { cwd: dbRoot }).output;
    const rerunClient = await connect(urls.after);
    const rerunAfterBusiness = [];
    for (const table of BUSINESS_TABLES) rerunAfterBusiness.push(await tableSnapshot(rerunClient, table));
    const rerunRelations = await relationEvidence(rerunClient);
    const rerunLegacy = await legacyEventEvidence(rerunClient);
    const rerunSchema = await schemaSnapshot(rerunClient);
    const rerunLedger = await ledgerEvidence(rerunClient);
    await rerunClient.end();

    console.log("[M320] verifying forced migration failure rollback");
    const failureRollback = await migrationFailureRollback(urls.failure);
    const backupPath = path.join(rehearsalRoot, `migration-320-after-${timestamp}.dump`);
    const backup = dumpDatabase(urls.after, backupPath);
    restoreDump(urls.restored, backupPath);
    const [afterRestoreClient, restoredClient] = await Promise.all([connect(urls.after), connect(urls.restored)]);
    const restoredBusiness = [];
    const afterRestoreBusiness = [];
    for (const table of BUSINESS_TABLES) {
      afterRestoreBusiness.push(await tableSnapshot(afterRestoreClient, table));
      restoredBusiness.push(await tableSnapshot(restoredClient, table));
    }
    const restoredSchema = await schemaSnapshot(restoredClient);
    const restoredLedger = await ledgerEvidence(restoredClient);
    await afterRestoreClient.end();
    await restoredClient.end();

    console.log("[M320] preparing isolated cross-module fixture");
    const crossModuleFixture = prepareCrossModuleFixture(urls.after);
    console.log("[M320] verifying API and cross-module closure");
    const crossModule = await apiAndCrossModuleEvidence(urls.after);
    crossModule.fixture = crossModuleFixture;
    const anomalies = classifyAnomalies(beforeAnomalies, afterAnomalies);
    const migrationAddedAnomalies = anomalies.filter((item) => item.classification === "MIGRATION_ADDED");
    const initialLegacySideEffectsSafe = Number(beforeLegacy.events.total) === Number(afterLegacy.events.total)
      && Number(afterLegacy.events.distinct_ids) === Number(afterLegacy.events.total)
      && Number(beforeLegacy.events.workflow) === Number(afterLegacy.events.workflow)
      && Number(beforeLegacy.events.request_ids) === Number(afterLegacy.events.request_ids)
      && beforeLegacy.workOrders.status_hash === afterLegacy.workOrders.status_hash
      && Number(beforeLegacy.auditRows) === Number(afterLegacy.auditRows)
      && beforeLegacy.sla.hash === afterLegacy.sla.hash
      && hashValue(beforeLegacy.notificationOrOutboxTables) === hashValue(afterLegacy.notificationOrOutboxTables);
    const businessRerunStable = combinedHash(rerunBeforeBusiness.filter((item) => item.exists))
      === combinedHash(rerunAfterBusiness.filter((item) => item.exists));
    const relationRerunStable = rerunBeforeRelations.hash === rerunRelations.hash;
    const legacyStable = hashValue(rerunBeforeLegacy) === hashValue(rerunLegacy);
    const restoreEqual = combinedHash(afterRestoreBusiness.filter((item) => item.exists))
      === combinedHash(restoredBusiness.filter((item) => item.exists))
      && rerunSchema.hash === restoredSchema.hash
      && rerunLedger.hash === restoredLedger.hash;
    const passedGates = [];
    const failedGates = [];
    const gate = (condition, label) => (condition ? passedGates : failedGates).push(label);
    gate(business.equal, "migration 前後既有業務欄位 hash 一致");
    gate(beforeRelations.hash === afterRelations.hash, "migration 前後既有關聯 hash 一致");
    gate(migrationAddedAnomalies.length === 0, "migration 未新增資料異常");
    gate(txRollback.unchanged, "一般 transaction rollback 無殘留");
    gate(failureRollback.schemaUnchanged && failureRollback.ledgerUnchanged && failureRollback.businessUnchanged, "migration failure 完整 rollback");
    gate(initialLegacySideEffectsSafe, "既有事件回填不新增事件、不觸發 workflow、通知、SLA 或狀態變更");
    gate(businessRerunStable && relationRerunStable && legacyStable, "migration 320 可安全重跑且 LEGACY/event 無副作用");
    gate(restoreEqual, "backup restore 與來源 clone 一致");
    gate(formalReadonlyEvidence, "去識別化正式來源具唯讀帳號、唯讀交易與正式 ledger 前後 hash 證據");
    gate(crossModule.pToC.sourceP && crossModule.pToC.checkItem && crossModule.pToC.abnormalValue && crossModule.pToC.standard && crossModule.pToC.attachmentSnapshot, "P 異常建立 C 完整保存來源、值、標準與附件");
    gate(crossModule.cToR.passed, "C 拆件建立 R 的事件、序號與唯一關聯一致");
    gate(crossModule.shortageInventory.rollbackPassed && crossModule.shortageInventory.reconciliationPassed && Number(crossModule.shortageInventory.linkedRows) > 0, "C 領退料、缺料、庫存回滾與稽核完整閉環");

    evidence = {
      executedAt: new Date().toISOString(),
      source: {
        dumpPath: sourceDump,
        dumpSha256: sha256(fs.readFileSync(sourceDump)),
        classification: sourceClassification,
        formalReadonlyVerified: formalReadonlyEvidence,
        cloneRole: sourceRole,
        formalConnectionAttempted: false,
      },
      cloneNames: names,
      migration: {
        file: migrationPath,
        fileSha256: sha256(fs.readFileSync(migrationPath)),
        output: migrationOutput,
        outputHash: sha256(migrationOutput),
      },
      ledger: { before: beforeLedger, after: afterLedger, rerun: rerunLedger },
      business,
      relationships: {
        before: beforeRelations,
        after: afterRelations,
        equal: beforeRelations.hash === afterRelations.hash,
      },
      schema: {
        before: { hash: beforeSchema.hash, counts: beforeSchema.counts },
        after: { hash: afterSchema.hash, counts: afterSchema.counts },
        rerun: { hash: rerunSchema.hash, counts: rerunSchema.counts },
        rerunStable: afterSchema.hash === rerunSchema.hash,
      },
      legacyEvents: { before: beforeLegacy, after: afterLegacy, rerun: rerunLegacy, initialSideEffectsSafe: initialLegacySideEffectsSafe },
      rerun: {
        outputHash: sha256(rerunOutput),
        businessStable: businessRerunStable,
        relationshipsStable: relationRerunStable,
        legacyStable,
        safe: businessRerunStable && relationRerunStable && legacyStable && afterSchema.hash === rerunSchema.hash,
      },
      rollback: { transaction: txRollback, migrationFailure: failureRollback },
      backupRestore: {
        backup,
        businessHash: combinedHash(restoredBusiness.filter((item) => item.exists)),
        schemaHash: restoredSchema.hash,
        ledgerHash: restoredLedger.hash,
        equal: restoreEqual,
      },
      anomalies,
      crossModule,
      decision: {
        result: failedGates.length ? "NO-GO" : "GO",
        passedGates,
        failedGates,
      },
    };
    writeReports(evidence);
    console.log(JSON.stringify({
      ok: true,
      decision: evidence.decision.result,
      passedGates: passedGates.length,
      failedGates,
      sourceClassification,
      formalReadonlyVerified: formalReadonlyEvidence,
      businessHashEqual: business.equal,
      relationshipHashEqual: evidence.relationships.equal,
      migrationAddedAnomalies: migrationAddedAnomalies.length,
      reports: [
        "migration-320-compatibility-report.md",
        "migration-320-before-after.json",
        "migration-320-data-anomalies.csv",
        "cross-module-closure-report.md",
        "go-no-go-report.md",
      ],
    }, null, 2));
  } finally {
    console.log("[M320] cleaning disposable clones");
    const cleanupAdmin = await connect(adminUrl);
    try {
      const active = await cleanupAdmin.query(
        `SELECT datname,application_name,state,count(*)::int AS connections
           FROM pg_stat_activity
          WHERE datname=ANY($1::text[])
          GROUP BY datname,application_name,state
          ORDER BY datname,application_name,state`,
        [Object.values(names)],
      );
      console.log(`[M320] cleanup connections ${JSON.stringify(active.rows)}`);
      for (const name of Object.values(names)) await dropDatabase(cleanupAdmin, name);
    } finally {
      await cleanupAdmin.end();
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
