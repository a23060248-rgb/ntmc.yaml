const fs = require("node:fs");
const path = require("node:path");
const pg = require("pg");

const systemRoot = path.resolve(__dirname, "../..");
const outputDir = path.join(systemRoot, ".local-rehearsal");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
});

const expectedViews = [
  "fault_dispatch_catalog",
  "v_asset_current_status",
  "v_equipment_alias",
  "v_master_data_import_batch_summary",
  "v_master_data_import_issue_resolution_summary",
  "v_material_location_balance",
  "v_material_stock_summary",
  "v_open_repair_work_orders"
];

const requiredTables = [
  "app_user", "asset", "asset_event", "document_sequence", "equipment_alias",
  "equipment_group", "fault_dispatch_node", "fault_work_order", "form_template",
  "instrument", "inventory_balance", "inventory_bin_balance", "inventory_transaction",
  "material", "operating_site", "operation_audit_log", "pm_attachment_definition",
  "master_data_import_batch", "master_data_import_issue_resolution", "master_data_import_row",
  "pm_schedule_item", "pm_template", "pm_template_check_item", "pm_work_order",
  "repair_work_order", "schema_migration", "train", "user_session", "vehicle_position",
  "warehouse", "warehouse_bin", "wi_document", "work_order", "work_order_event"
];

const mergeCandidates = [
  {
    objects: ["fault_dispatch_catalog", "fault_dispatch_node"],
    decision: "KEEP_NODE_AND_VIEW",
    reason: "fault_dispatch_node is canonical; fault_dispatch_catalog is an API compatibility view"
  },
  {
    objects: ["inventory_balance", "inventory_bin_balance"],
    decision: "RECONCILE_THEN_AGGREGATE_VIEW",
    reason: "bin balance should be canonical; warehouse balance can later become an aggregate view"
  },
  {
    objects: ["asset_task", "work_order", "work_order_event"],
    decision: "REVIEW_DEPRECATION",
    reason: "asset_task may duplicate formal work-order task tracking"
  },
  {
    objects: ["material_usage_history", "inventory_transaction"],
    decision: "KEEP_HISTORY_READ_ONLY",
    reason: "legacy aggregates remain evidence; new usage derives from immutable transactions"
  }
];

async function query(sql, values = []) {
  return (await client.query(sql, values)).rows;
}

async function main() {
  await client.connect();
  const database = (await query(
    `SELECT current_database() AS name, current_user AS role,
            current_setting('server_version') AS version,
            inet_server_addr()::text AS host,
            inet_server_port() AS port`
  ))[0];

  const objects = await query(
    `SELECT c.relname AS name,
            CASE c.relkind WHEN 'r' THEN 'TABLE' WHEN 'p' THEN 'PARTITIONED_TABLE'
              WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED_VIEW' END AS kind
       FROM pg_class c
       JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m')
      ORDER BY kind, name`
  );

  for (const object of objects) {
    if (object.kind === "TABLE" || object.kind === "PARTITIONED_TABLE") {
      const result = await query(`SELECT count(*)::bigint AS count FROM public.${quoteIdentifier(object.name)}`);
      object.rowCount = Number(result[0].count);
    } else {
      object.rowCount = null;
    }
  }

  const primaryKeys = await query(
    `SELECT tc.table_name, string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position) AS columns
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name=tc.constraint_name AND kcu.constraint_schema=tc.constraint_schema
      WHERE tc.table_schema='public' AND tc.constraint_type='PRIMARY KEY'
      GROUP BY tc.table_name ORDER BY tc.table_name`
  );
  const pkByTable = new Map(primaryKeys.map((item) => [item.table_name, item.columns]));

  const foreignKeys = await query(
    `SELECT tc.table_name, count(*)::int AS count
       FROM information_schema.table_constraints tc
      WHERE tc.table_schema='public' AND tc.constraint_type='FOREIGN KEY'
      GROUP BY tc.table_name ORDER BY tc.table_name`
  );
  const fkByTable = new Map(foreignKeys.map((item) => [item.table_name, item.count]));

  for (const object of objects) {
    object.primaryKey = pkByTable.get(object.name) || null;
    object.foreignKeyCount = fkByTable.get(object.name) || 0;
  }

  const objectNames = new Set(objects.map((item) => item.name));
  const missingTables = requiredTables.filter((name) => !objectNames.has(name));
  const missingViews = expectedViews.filter((name) => !objectNames.has(name));

  const inventoryReconciliation = objectNames.has("inventory_balance") && objectNames.has("inventory_bin_balance")
    ? await query(
        `SELECT count(*)::int AS mismatches
           FROM (
             SELECT COALESCE(b.material_id, bb.material_id) AS material_id,
                    COALESCE(b.warehouse_id, bb.warehouse_id) AS warehouse_id,
                    COALESCE(b.qty, 0) AS warehouse_qty,
                    COALESCE(bb.qty, 0) AS bin_qty
               FROM inventory_balance b
               FULL JOIN (
                 SELECT material_id, warehouse_id, sum(qty) AS qty
                   FROM inventory_bin_balance
                  GROUP BY material_id, warehouse_id
               ) bb USING (material_id, warehouse_id)
           ) x
          WHERE warehouse_qty <> bin_qty`
      )
    : [{ mismatches: null }];

  const report = {
    generatedAt: new Date().toISOString(),
    database,
    summary: {
      tables: objects.filter((item) => item.kind.includes("TABLE")).length,
      views: objects.filter((item) => item.kind.includes("VIEW")).length,
      foreignKeys: objects.reduce((sum, item) => sum + item.foreignKeyCount, 0),
      missingTables,
      missingViews,
      inventoryBalanceMismatches: inventoryReconciliation[0].mismatches,
      studentsPresent: objectNames.has("students")
    },
    objects,
    mergeCandidates
  };

  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(outputDir, `data-migration-readiness-${stamp}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    database: database.name,
    tables: report.summary.tables,
    views: report.summary.views,
    foreignKeys: report.summary.foreignKeys,
    missingTables,
    missingViews,
    inventoryBalanceMismatches: report.summary.inventoryBalanceMismatches,
    studentsPresent: report.summary.studentsPresent,
    outputPath
  }, null, 2));

  if (missingTables.length || missingViews.length) {
    process.exitCode = 1;
  }
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

main()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
