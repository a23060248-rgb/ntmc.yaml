const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";
process.env.ENV_FILE = process.env.ENV_FILE || ".env.test";
require("../src/config/loadEnvironment").loadEnvironment();
const { pool, query, withTransaction } = require("../src/db");

const apiBase = process.env.REHEARSAL_API_URL || "http://127.0.0.1:3102/api";
const baseHeaders = { "content-type": "application/json", "x-user-role": "warehouse_staff", "x-user-name": "Rehearsal Warehouse" };

async function requestResult(path, payload, key) {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { ...baseHeaders, ...(key ? { "Idempotency-Key": key } : {}) },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { text }; }
  return { status: response.status, body };
}

async function resetFixture() {
  await withTransaction(async (client) => {
    const fixture = await client.query(
      `SELECT m.id AS material_id,c.id AS center_id,r.id AS repair_id,cb.id AS center_bin_id,rb.id AS repair_bin_id
         FROM material m
         JOIN warehouse c ON c.warehouse_code='REH-CENTER'
         JOIN warehouse r ON r.warehouse_code='REH-REPAIR'
         JOIN warehouse_bin cb ON cb.warehouse_id=c.id AND cb.bin_code='REH-A01'
         JOIN warehouse_bin rb ON rb.warehouse_id=r.id AND rb.bin_code='REH-C01'
        WHERE m.part_no='REH-IDEM-001'`
    );
    assert.equal(fixture.rowCount, 1, "phase7 stock fixture is missing");
    const row = fixture.rows[0];
    await client.query(`DELETE FROM inventory_transaction WHERE material_id=$1 AND note LIKE 'PHASE7-%'`, [row.material_id]);
    await client.query(`DELETE FROM inventory_document_line WHERE material_id=$1 AND note LIKE 'PHASE7-%'`, [row.material_id]);
    await client.query(`DELETE FROM inventory_document WHERE note LIKE 'PHASE7-%'`);
    await client.query(`DELETE FROM inventory_posting_request WHERE idempotency_key LIKE 'PHASE7:%'`);
    await client.query(
      `UPDATE inventory_balance SET qty=CASE
         WHEN warehouse_id=$2 AND stock_status='AVAILABLE' THEN 100
         WHEN warehouse_id=$3 AND stock_status='ISSUED' THEN 20
         ELSE qty END, updated_at=now()
       WHERE material_id=$1 AND warehouse_id IN ($2,$3)`,
      [row.material_id, row.center_id, row.repair_id]
    );
    await client.query(
      `UPDATE inventory_bin_balance SET qty=CASE
         WHEN warehouse_bin_id=$2 AND stock_status='AVAILABLE' THEN 100
         WHEN warehouse_bin_id=$3 AND stock_status='ISSUED' THEN 20
         ELSE qty END, updated_at=now()
       WHERE material_id=$1 AND warehouse_bin_id IN ($2,$3)`,
      [row.material_id, row.center_bin_id, row.repair_bin_id]
    );
  });
}

async function balances() {
  const rows = await query(
    `SELECT w.warehouse_code,ib.stock_status,ib.qty
       FROM inventory_balance ib JOIN material m ON m.id=ib.material_id JOIN warehouse w ON w.id=ib.warehouse_id
      WHERE m.part_no='REH-IDEM-001' AND (
        (w.warehouse_code='REH-CENTER' AND ib.stock_status='AVAILABLE') OR
        (w.warehouse_code='REH-REPAIR' AND ib.stock_status='ISSUED')
      ) ORDER BY w.warehouse_code`
  );
  return Object.fromEntries(rows.rows.map((row) => [`${row.warehouse_code}:${row.stock_status}`, Number(row.qty)]));
}

async function main() {
  await resetFixture();
  const missingKey = await requestResult("/inventory/consume", {
    partNo: "REH-IDEM-001", qty: 1, warehouseCode: "REH-REPAIR", stockStatus: "ISSUED", note: "PHASE7-MISSING-KEY",
  });
  assert.equal(missingKey.status, 400);
  assert.match(missingKey.body.error.message, /Idempotency-Key/);

  const concurrentPayload = {
    partNo: "REH-IDEM-001", qty: 15, warehouseCode: "REH-REPAIR", binCode: "REH-C01",
    stockStatus: "ISSUED", custodianName: "Rehearsal Warehouse", note: "PHASE7-CONCURRENT",
  };
  const concurrent = await Promise.all([
    requestResult("/inventory/consume", concurrentPayload, "PHASE7:CONCURRENT:A"),
    requestResult("/inventory/consume", concurrentPayload, "PHASE7:CONCURRENT:B"),
  ]);
  assert.deepEqual(concurrent.map((item) => item.status).sort((a, b) => a - b), [201, 409]);
  assert.equal((await balances())["REH-REPAIR:ISSUED"], 5);

  const duplicatePayload = {
    partNo: "REH-IDEM-001", qty: 2, warehouseCode: "REH-REPAIR", binCode: "REH-C01",
    stockStatus: "ISSUED", custodianName: "Rehearsal Warehouse", note: "PHASE7-DUPLICATE",
  };
  const first = await requestResult("/inventory/consume", duplicatePayload, "PHASE7:DUPLICATE");
  const replay = await requestResult("/inventory/consume", duplicatePayload, "PHASE7:DUPLICATE");
  assert.equal(first.status, 201);
  assert.equal(first.body.consumption.idempotentReplay, false);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.consumption.idempotentReplay, true);
  assert.equal((await balances())["REH-REPAIR:ISSUED"], 3);
  const mismatched = await requestResult("/inventory/consume", { ...duplicatePayload, qty: 1 }, "PHASE7:DUPLICATE");
  assert.equal(mismatched.status, 409);
  assert.match(mismatched.body.error.message, /different inventory data/);

  const transferPayload = {
    movementType: "TRANSFER",
    partNo: "REH-IDEM-001",
    qty: 3,
    siteCode: "D",
    sourceWarehouseCode: "REH-CENTER",
    destinationWarehouseCode: "REH-REPAIR",
    sourceBinCode: "REH-A01",
    destinationBinCode: "REH-C01",
    sourceStockStatus: "AVAILABLE",
    destinationStockStatus: "ISSUED",
    custodianName: "Rehearsal Warehouse",
    note: "PHASE7-TRANSFER",
  };
  const transfer = await requestResult("/inventory/transfer", transferPayload, "PHASE7:TRANSFER");
  const transferReplay = await requestResult("/inventory/transfer", transferPayload, "PHASE7:TRANSFER");
  assert.equal(transfer.status, 201);
  assert.equal(transferReplay.status, 200);
  assert.equal(transfer.body.movement.document.document_no, transferReplay.body.movement.document.document_no);

  const beforeFailure = await balances();
  const failed = await requestResult("/inventory/transfer", { ...transferPayload, qty: 999, note: "PHASE7-ROLLBACK" }, "PHASE7:ROLLBACK");
  assert.equal(failed.status, 409);
  assert.deepEqual(await balances(), beforeFailure, "failed transaction changed balances");
  const failedClaim = await query(`SELECT count(*)::int AS count FROM inventory_posting_request WHERE idempotency_key='PHASE7:ROLLBACK'`);
  assert.equal(failedClaim.rows[0].count, 0, "failed posting kept an idempotency claim outside the rollback");

  const finalBalances = await balances();
  assert.deepEqual(finalBalances, { "REH-CENTER:AVAILABLE": 97, "REH-REPAIR:ISSUED": 6 });
  const ledger = await query(
    `SELECT w.warehouse_code,it.stock_status,sum(it.qty_change)::numeric AS qty
       FROM inventory_transaction it JOIN material m ON m.id=it.material_id JOIN warehouse w ON w.id=it.warehouse_id
      WHERE m.part_no='REH-IDEM-001'
      GROUP BY w.warehouse_code,it.stock_status ORDER BY w.warehouse_code,it.stock_status`
  );
  const recalculated = Object.fromEntries(ledger.rows.map((row) => [`${row.warehouse_code}:${row.stock_status}`, Number(row.qty)]));
  assert.equal(recalculated["REH-CENTER:AVAILABLE"], finalBalances["REH-CENTER:AVAILABLE"]);
  assert.equal(recalculated["REH-REPAIR:ISSUED"], finalBalances["REH-REPAIR:ISSUED"]);
  const phaseTransactions = await query(
    `SELECT transaction_type,count(*)::int AS count FROM inventory_transaction it
      JOIN material m ON m.id=it.material_id
     WHERE m.part_no='REH-IDEM-001' AND it.note LIKE 'PHASE7-%'
     GROUP BY transaction_type ORDER BY transaction_type`
  );

  console.log(JSON.stringify({
    ok: true,
    missingKeyStatus: missingKey.status,
    concurrentStatuses: concurrent.map((item) => item.status),
    duplicateStatuses: [first.status, replay.status],
    mismatchStatus: mismatched.status,
    transferStatuses: [transfer.status, transferReplay.status],
    rollbackStatus: failed.status,
    finalBalances,
    recalculated,
    transactions: phaseTransactions.rows,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
