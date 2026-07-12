const crypto = require("crypto");
const { httpError } = require("../middleware/errorHandler");

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((output, key) => {
      if (value[key] !== undefined) output[key] = canonicalize(value[key]);
      return output;
    }, {});
  }
  return value;
}

function requestHash(operationCode, payload) {
  return crypto.createHash("sha256")
    .update(JSON.stringify({ operationCode, payload: canonicalize(payload) }))
    .digest("hex");
}

function validateKey(value) {
  const key = String(value || "").trim();
  if (!key) throw httpError(400, "Idempotency-Key is required for inventory posting");
  if (key.length > 160) throw httpError(400, "Idempotency-Key is too long");
  return key;
}

async function claimIdempotency(client, { key: rawKey, operationCode, payload, actorId }) {
  const key = validateKey(rawKey);
  const hash = requestHash(operationCode, payload);
  const inserted = await client.query(
    `INSERT INTO inventory_posting_request (
       idempotency_key,operation_code,request_hash,request_payload,request_status,created_by
     ) VALUES ($1,$2,$3,$4::jsonb,'PROCESSING',$5)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING idempotency_key`,
    [key, operationCode, hash, JSON.stringify(canonicalize(payload)), actorId || null]
  );
  if (inserted.rowCount) return { key, hash, replay: false };

  const existing = await client.query(
    `SELECT * FROM inventory_posting_request WHERE idempotency_key=$1 FOR UPDATE`,
    [key]
  );
  if (!existing.rowCount) throw httpError(409, "Idempotency request is not available; retry later");
  const row = existing.rows[0];
  if (row.operation_code !== operationCode || row.request_hash !== hash) {
    throw httpError(409, "Idempotency-Key was already used with different inventory data");
  }
  if (row.request_status !== "COMPLETED" || !row.response_payload) {
    throw httpError(409, "Inventory posting with this Idempotency-Key is still processing");
  }
  return { key, hash, replay: true, response: row.response_payload };
}

async function completeIdempotency(client, claim, response) {
  await client.query(
    `UPDATE inventory_posting_request
        SET request_status='COMPLETED',response_payload=$2::jsonb,completed_at=now()
      WHERE idempotency_key=$1`,
    [claim.key, JSON.stringify(response)]
  );
}

module.exports = {
  canonicalize,
  claimIdempotency,
  completeIdempotency,
  requestHash,
  validateKey,
};
