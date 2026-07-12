const express = require("express");
const { query, withTransaction } = require("../db");
const { asyncHandler, httpError } = require("../middleware/errorHandler");
const { resolveAuth, requireRoles } = require("../middleware/auth");
const { ROLE_POLICIES } = require("../config/rolePolicy");

const router = express.Router();
router.use(resolveAuth, requireRoles(...ROLE_POLICIES.DATABASE_ADMIN));

// ---------------------------------------------------------------------
// 通用資料管理 API(本機管理用):瀏覽 / 編輯 / 新增 / 刪除 / 匯入
// 安全防線:表名與欄名一律先比對 information_schema 白名單,再以雙引號帶入
// ---------------------------------------------------------------------

const IDENT_RE = /^[a-z_][a-z0-9_]*$/;

async function tableMeta(tableName) {
  if (!IDENT_RE.test(tableName)) {
    throw httpError(400, "不合法的資料表名稱");
  }
  const tab = await query(
    `SELECT table_name, table_type FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  if (!tab.rows.length) {
    throw httpError(404, `資料表不存在:${tableName}`);
  }
  const cols = await query(
    `SELECT column_name, data_type, is_nullable = 'YES' AS nullable,
            column_default IS NOT NULL AS has_default,
            is_identity = 'YES' AS is_identity
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName]
  );
  const pk = await query(
    `SELECT a.attname AS column_name
     FROM pg_index i
     JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
     WHERE i.indrelid = $1::regclass AND i.indisprimary`,
    [tableName]
  );
  return {
    name: tableName,
    isView: tab.rows[0].table_type === "VIEW",
    columns: cols.rows,
    pk: pk.rows.map((r) => r.column_name)
  };
}

function q(ident) {
  return `"${ident}"`;
}

function assertColumns(meta, names) {
  const valid = new Set(meta.columns.map((c) => c.column_name));
  for (const n of names) {
    if (!valid.has(n)) throw httpError(400, `欄位不存在:${n}`);
  }
}

function normalizeValues(meta, values) {
  const byName = Object.fromEntries(meta.columns.map((c) => [c.column_name, c]));
  const out = {};
  for (const [k, v] of Object.entries(values)) {
    const col = byName[k];
    if (v === "" && col && col.data_type !== "text" && col.data_type !== "character varying") {
      out[k] = null;
    } else {
      out[k] = v;
    }
  }
  return out;
}

// 資料表清單(含筆數與主鍵)
router.get(
  "/tables",
  asyncHandler(async (req, res) => {
    const tabs = await query(
      `SELECT t.table_name AS name, t.table_type = 'VIEW' AS is_view
       FROM information_schema.tables t
       WHERE t.table_schema = 'public'
       ORDER BY t.table_name`
    );
    const counts = await query(
      `SELECT relname AS name, n_live_tup AS rows FROM pg_stat_user_tables`
    );
    const countMap = Object.fromEntries(counts.rows.map((r) => [r.name, Number(r.rows)]));
    const pks = await query(
      `SELECT i.indrelid::regclass::text AS name, a.attname AS col
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
       WHERE i.indisprimary`
    );
    const pkMap = {};
    for (const r of pks.rows) {
      (pkMap[r.name] = pkMap[r.name] || []).push(r.col);
    }
    res.json({
      items: tabs.rows.map((t) => ({
        name: t.name,
        isView: t.is_view,
        rows: countMap[t.name] ?? null,
        pk: pkMap[t.name] || []
      }))
    });
  })
);

// 讀取資料列(分頁 + 全文搜尋)
router.get(
  "/:table/rows",
  asyncHandler(async (req, res) => {
    const meta = await tableMeta(req.params.table);
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const search = String(req.query.search || "").trim();
    const orderBy = meta.pk.length
      ? `ORDER BY ${meta.pk.map(q).join(", ")}`
      : `ORDER BY 1`;
    const where = search ? `WHERE ${q(meta.name)}::text ILIKE $3` : "";
    const params = search ? [limit, offset, `%${search}%`] : [limit, offset];
    const rows = await query(
      `SELECT * FROM ${q(meta.name)} ${where} ${orderBy} LIMIT $1 OFFSET $2`,
      params
    );
    const total = await query(
      `SELECT count(*)::int AS n FROM ${q(meta.name)} ${where ? `WHERE ${q(meta.name)}::text ILIKE $1` : ""}`,
      search ? [`%${search}%`] : []
    );
    res.json({
      table: meta.name,
      isView: meta.isView,
      pk: meta.pk,
      columns: meta.columns,
      total: total.rows[0].n,
      rows: rows.rows
    });
  })
);

// 修改單列:{ pk: {col: val}, set: {col: val} }
router.patch(
  "/:table/row",
  asyncHandler(async (req, res) => {
    const meta = await tableMeta(req.params.table);
    if (meta.isView) throw httpError(400, "VIEW 不可修改");
    const { pk, set } = req.body || {};
    if (!pk || !set || !Object.keys(pk).length || !Object.keys(set).length) {
      throw httpError(400, "需要 pk 與 set");
    }
    assertColumns(meta, [...Object.keys(pk), ...Object.keys(set)]);
    const setNorm = normalizeValues(meta, set);
    const setCols = Object.keys(setNorm);
    const pkCols = Object.keys(pk);
    const params = [...setCols.map((c) => setNorm[c]), ...pkCols.map((c) => pk[c])];
    const setSql = setCols.map((c, i) => `${q(c)} = $${i + 1}`).join(", ");
    const whereSql = pkCols.map((c, i) => `${q(c)} = $${setCols.length + i + 1}`).join(" AND ");
    const result = await query(
      `UPDATE ${q(meta.name)} SET ${setSql} WHERE ${whereSql} RETURNING *`,
      params
    );
    if (!result.rows.length) throw httpError(404, "找不到該筆資料");
    res.json({ ok: true, row: result.rows[0] });
  })
);

// 新增單列:{ values: {col: val} }
router.post(
  "/:table/row",
  asyncHandler(async (req, res) => {
    const meta = await tableMeta(req.params.table);
    if (meta.isView) throw httpError(400, "VIEW 不可新增");
    const values = normalizeValues(meta, (req.body || {}).values || {});
    const cols = Object.keys(values).filter((c) => values[c] !== null && values[c] !== undefined);
    if (!cols.length) throw httpError(400, "沒有可寫入的欄位");
    assertColumns(meta, cols);
    const params = cols.map((c) => values[c]);
    const result = await query(
      `INSERT INTO ${q(meta.name)} (${cols.map(q).join(", ")})
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`,
      params
    );
    res.json({ ok: true, row: result.rows[0] });
  })
);

// 刪除單列:{ pk: {col: val} }
router.delete(
  "/:table/row",
  asyncHandler(async (req, res) => {
    const meta = await tableMeta(req.params.table);
    if (meta.isView) throw httpError(400, "VIEW 不可刪除");
    const pk = (req.body || {}).pk || {};
    if (!Object.keys(pk).length) throw httpError(400, "需要 pk");
    assertColumns(meta, Object.keys(pk));
    const pkCols = Object.keys(pk);
    const whereSql = pkCols.map((c, i) => `${q(c)} = $${i + 1}`).join(" AND ");
    const result = await query(
      `DELETE FROM ${q(meta.name)} WHERE ${whereSql} RETURNING *`,
      pkCols.map((c) => pk[c])
    );
    if (!result.rows.length) throw httpError(404, "找不到該筆資料");
    res.json({ ok: true, deleted: result.rows.length });
  })
);

// 批次刪除:{ pks: [{col: val}, ...] }
router.post(
  "/:table/rows/delete",
  asyncHandler(async (req, res) => {
    const meta = await tableMeta(req.params.table);
    if (meta.isView) throw httpError(400, "VIEW 不可刪除");
    const pks = (req.body || {}).pks;
    if (!Array.isArray(pks) || !pks.length) throw httpError(400, "pks 不可為空");
    if (pks.length > 1000) throw httpError(400, "單次最多刪除 1000 列");
    let deleted = 0;
    await withTransaction(async (client) => {
      for (const pk of pks) {
        const pkCols = Object.keys(pk);
        assertColumns(meta, pkCols);
        const whereSql = pkCols.map((c, i) => `${q(c)} = $${i + 1}`).join(" AND ");
        const result = await client.query(
          `DELETE FROM ${q(meta.name)} WHERE ${whereSql}`,
          pkCols.map((c) => pk[c])
        );
        deleted += result.rowCount;
      }
    });
    res.json({ ok: true, deleted });
  })
);

// 批次匯入:{ rows: [{col: val}], mode: "skip" | "error" }
router.post(
  "/:table/import",
  asyncHandler(async (req, res) => {
    const meta = await tableMeta(req.params.table);
    if (meta.isView) throw httpError(400, "VIEW 不可匯入");
    const { rows, mode } = req.body || {};
    if (!Array.isArray(rows) || !rows.length) throw httpError(400, "rows 不可為空");
    if (rows.length > 5000) throw httpError(400, "單次最多 5000 列");
    const allCols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    assertColumns(meta, allCols);
    const conflict = mode === "skip" && meta.pk.length ? `ON CONFLICT DO NOTHING` : "";
    let inserted = 0;
    await withTransaction(async (client) => {
      for (const raw of rows) {
        const values = normalizeValues(meta, raw);
        const cols = Object.keys(values).filter((c) => values[c] !== null && values[c] !== undefined);
        if (!cols.length) continue;
        const result = await client.query(
          `INSERT INTO ${q(meta.name)} (${cols.map(q).join(", ")})
           VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) ${conflict}`,
          cols.map((c) => values[c])
        );
        inserted += result.rowCount;
      }
    });
    res.json({ ok: true, received: rows.length, inserted, skipped: rows.length - inserted });
  })
);

module.exports = router;
