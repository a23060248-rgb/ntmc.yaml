const crypto = require("node:crypto");

const VOLATILE_COLUMNS = new Set([
  "updated_at",
  "last_seen_at",
  "execution_ms",
]);

function normalizeScalar(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString("hex").toUpperCase();
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return String(value);
    return Number.isInteger(value) ? value : Number(value.toString());
  }
  return value;
}

function canonicalize(value) {
  const scalar = normalizeScalar(value);
  if (scalar !== value) return scalar;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right, "en"))
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
}

function hashValue(value) {
  return sha256(canonicalStringify(value));
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function tableMetadata(client, tableName) {
  const columns = await client.query(
    `SELECT column_name,data_type,udt_name,ordinal_position
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1
      ORDER BY ordinal_position`,
    [tableName],
  );
  if (!columns.rowCount) return null;
  const primaryKey = await client.query(
    `SELECT a.attname AS column_name
       FROM pg_index i
       JOIN pg_class c ON c.oid=i.indrelid
       JOIN pg_namespace n ON n.oid=c.relnamespace
       JOIN unnest(i.indkey) WITH ORDINALITY AS k(attnum,ord) ON true
       JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum
      WHERE n.nspname='public' AND c.relname=$1 AND i.indisprimary
      ORDER BY k.ord`,
    [tableName],
  );
  return {
    columns: columns.rows.map((item) => item.column_name),
    columnDefinitions: columns.rows,
    primaryKey: primaryKey.rows.map((item) => item.column_name),
  };
}

async function tableSnapshot(client, tableName, requestedColumns = null) {
  const metadata = await tableMetadata(client, tableName);
  if (!metadata) return { exists: false, table: tableName, rows: 0, hash: null, columns: [] };
  const columns = (requestedColumns || metadata.columns).filter((column) => metadata.columns.includes(column));
  const orderColumns = metadata.primaryKey.length ? metadata.primaryKey : columns;
  const selected = columns.map(quoteIdentifier).join(",");
  const order = orderColumns.length ? ` ORDER BY ${orderColumns.map(quoteIdentifier).join(",")}` : "";
  const result = await client.query(`SELECT ${selected} FROM ${quoteIdentifier(tableName)}${order}`);
  const rows = result.rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])));
  return {
    exists: true,
    table: tableName,
    rows: rows.length,
    hash: hashValue(rows),
    columns,
  };
}

async function commonTableSnapshot(beforeClient, afterClient, tableName) {
  const [beforeMeta, afterMeta] = await Promise.all([
    tableMetadata(beforeClient, tableName),
    tableMetadata(afterClient, tableName),
  ]);
  if (!beforeMeta || !afterMeta) {
    return {
      table: tableName,
      before: { exists: Boolean(beforeMeta) },
      after: { exists: Boolean(afterMeta) },
      equal: Boolean(beforeMeta) === Boolean(afterMeta),
    };
  }
  const columns = beforeMeta.columns.filter(
    (column) => afterMeta.columns.includes(column) && !VOLATILE_COLUMNS.has(column),
  );
  const [before, after] = await Promise.all([
    tableSnapshot(beforeClient, tableName, columns),
    tableSnapshot(afterClient, tableName, columns),
  ]);
  return { table: tableName, columns, before, after, equal: before.hash === after.hash };
}

async function schemaSnapshot(client) {
  const [columns, constraints, indexes] = await Promise.all([
    client.query(
      `SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default
         FROM information_schema.columns
        WHERE table_schema='public'
        ORDER BY table_name,ordinal_position`,
    ),
    client.query(
      `SELECT conrelid::regclass::text AS table_name,conname,contype,pg_get_constraintdef(oid,true) AS definition
         FROM pg_constraint
        WHERE connamespace='public'::regnamespace
        ORDER BY conrelid::regclass::text,conname`,
    ),
    client.query(
      `SELECT tablename,indexname,indexdef
         FROM pg_indexes
        WHERE schemaname='public'
        ORDER BY tablename,indexname`,
    ),
  ]);
  const payload = {
    columns: columns.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
  };
  return {
    hash: hashValue(payload),
    counts: {
      columns: columns.rowCount,
      constraints: constraints.rowCount,
      indexes: indexes.rowCount,
    },
    payload,
  };
}

function combinedHash(entries) {
  return hashValue(entries.map((entry) => ({
    table: entry.table,
    rows: entry.rows,
    hash: entry.hash,
  })));
}

module.exports = {
  canonicalize,
  canonicalStringify,
  combinedHash,
  commonTableSnapshot,
  hashValue,
  quoteIdentifier,
  schemaSnapshot,
  sha256,
  tableMetadata,
  tableSnapshot,
};
