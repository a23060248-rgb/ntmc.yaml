const express = require("express");
const { query, withTransaction } = require("../db");
const { asyncHandler, httpError } = require("../middleware/errorHandler");
const { resolveAuth, requireRoles } = require("../middleware/auth");
const { ROLE_POLICIES } = require("../config/rolePolicy");
const { normalizeAttachmentList } = require("../services/pmTemplateDefinition");

const router = express.Router();
const EDIT_ROLES = ROLE_POLICIES.MASTER_WRITE;

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function actorId(req) {
  return req.user?.id === "preview-user" ? null : req.user?.id || null;
}

function numeric(value) {
  if (value === "" || value === undefined || value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw httpError(400, "數值格式不正確");
  return parsed;
}

async function ensureDraft(client, id, lock = false) {
  const result = await client.query(
    `SELECT * FROM pm_template WHERE id=$1 ${lock ? "FOR UPDATE" : ""}`,
    [id]
  );
  if (!result.rowCount) throw httpError(404, "預檢模板版本不存在");
  if (result.rows[0].lifecycle_status !== "DRAFT") {
    throw httpError(409, "已發布模板不可直接修改，請先建立新修訂版本");
  }
  return result.rows[0];
}

async function detail(client, id) {
  const template = await client.query(
    `SELECT pt.*,u.display_name AS published_by_name
       FROM pm_template pt
       LEFT JOIN app_user u ON u.id=pt.published_by
      WHERE pt.id=$1`,
    [id]
  );
  if (!template.rowCount) throw httpError(404, "預檢模板版本不存在");
  const [checks, materials, instruments, wis, attachments, forms] = await Promise.all([
    client.query(
      `SELECT * FROM pm_template_check_item
        WHERE pm_template_id=$1
        ORDER BY section_sort_order,section,sort_order,item_no`,
      [id]
    ),
    client.query(
      `SELECT ptm.*,m.part_no,m.material_name,m.spec,m.unit AS base_unit
         FROM pm_template_material ptm
         JOIN material m ON m.id=ptm.material_id
        WHERE ptm.pm_template_id=$1
        ORDER BY ptm.sort_order,m.part_no`,
      [id]
    ),
    client.query(
      `SELECT pti.*,i.instrument_no,i.instrument_name,i.instrument_type,
              i.calibration_due_date,i.status
         FROM pm_template_instrument pti
         JOIN instrument i ON i.id=pti.instrument_id
        WHERE pti.pm_template_id=$1
        ORDER BY pti.sort_order,i.instrument_no`,
      [id]
    ),
    client.query(
      `SELECT ptw.*,wi.wi_no,wi.wi_name,wi.version_no,wi.status
         FROM pm_template_wi ptw
         JOIN wi_document wi ON wi.id=ptw.wi_document_id
        WHERE ptw.pm_template_id=$1
        ORDER BY ptw.sort_order,wi.wi_no`,
      [id]
    ),
    client.query(
      `SELECT * FROM pm_template_attachment
        WHERE pm_template_id=$1 ORDER BY sort_order,attachment_code`,
      [id]
    ),
    client.query(
      `SELECT ft.*,
              (SELECT count(*)::int FROM form_template_field_mapping fm WHERE fm.form_template_id=ft.id) AS mapping_count,
              (SELECT count(*)::int FROM form_template_block_mapping bm WHERE bm.form_template_id=ft.id) AS block_mapping_count
         FROM form_template ft
        WHERE ft.pm_template_id=$1
        ORDER BY ft.version_no DESC`,
      [id]
    ),
  ]);
  return {
    item: template.rows[0],
    checks: checks.rows,
    materials: materials.rows,
    instruments: instruments.rows,
    wiDocuments: wis.rows,
    attachments: attachments.rows,
    formTemplates: forms.rows,
  };
}

router.use(resolveAuth);

router.get("/", asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const search = cleanText(req.query.search);
  const values = [];
  const filters = [];
  if (search) {
    values.push(`%${search}%`);
    filters.push(`concat_ws(' ',pt.pm_code,pt.pm_label,pt.version_no,pt.maintenance_period) ILIKE $${values.length}`);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = await query(
    `SELECT pt.*,
            count(DISTINCT ci.id) FILTER (WHERE ci.is_active=true)::int AS check_count,
            count(DISTINCT ptm.material_id) FILTER (WHERE ptm.is_active=true)::int AS material_count,
            count(DISTINCT pti.instrument_id) FILTER (WHERE pti.is_active=true)::int AS instrument_count,
            count(DISTINCT ptw.wi_document_id) FILTER (WHERE ptw.is_active=true)::int AS wi_count,
            (SELECT count(*)::int FROM pm_template_attachment pta WHERE pta.pm_template_id=pt.id AND pta.is_active=true) AS attachment_count
       FROM pm_template pt
       LEFT JOIN pm_template_check_item ci ON ci.pm_template_id=pt.id
       LEFT JOIN pm_template_material ptm ON ptm.pm_template_id=pt.id
       LEFT JOIN pm_template_instrument pti ON pti.pm_template_id=pt.id
       LEFT JOIN pm_template_wi ptw ON ptw.pm_template_id=pt.id
       ${where}
      GROUP BY pt.id
      ORDER BY pt.pm_code,pt.revision_no DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );
  const count = await query(`SELECT count(*)::int AS total FROM pm_template pt ${where}`, values);
  res.json({ items: rows.rows, total: count.rows[0].total, limit, offset });
}));

router.get("/:id", asyncHandler(async (req, res) => {
  res.json(await detail({ query }, req.params.id));
}));

router.post("/", requireRoles(...EDIT_ROLES), asyncHandler(async (req, res) => {
  const body = req.body || {};
  const pmCode = cleanText(body.pmCode)?.toUpperCase();
  const pmLabel = cleanText(body.pmLabel);
  const versionNo = cleanText(body.versionNo) || "1";
  if (!pmCode || !pmLabel) throw httpError(400, "模板代碼與名稱為必填");
  const created = await query(
    `INSERT INTO pm_template (
       pm_code,pm_label,version_no,revision_no,lifecycle_status,maintenance_period,
       latest_offset_days,job_description,default_corrective_action,is_active
     ) VALUES ($1,$2,$3,1,'DRAFT',$4,$5,$6,$7,false)
     RETURNING *`,
    [pmCode, pmLabel, versionNo, cleanText(body.maintenancePeriod), numeric(body.latestOffsetDays) || 0,
      cleanText(body.jobDescription), cleanText(body.defaultCorrectiveAction)]
  );
  res.status(201).json({ item: created.rows[0] });
}));

router.post("/:id/revisions", requireRoles(...EDIT_ROLES), asyncHandler(async (req, res) => {
  const result = await withTransaction(async (client) => {
    const sourceResult = await client.query(`SELECT * FROM pm_template WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!sourceResult.rowCount) throw httpError(404, "來源模板不存在");
    const source = sourceResult.rows[0];
    const maxRevision = await client.query(`SELECT COALESCE(max(revision_no),0)::int AS value FROM pm_template WHERE pm_code=$1`, [source.pm_code]);
    const revisionNo = maxRevision.rows[0].value + 1;
    const versionNo = cleanText(req.body?.versionNo) || String(revisionNo);
    const inserted = await client.query(
      `INSERT INTO pm_template (
         pm_code,pm_label,version_no,revision_no,lifecycle_status,maintenance_period,
         latest_offset_days,job_description,default_corrective_action,default_danger_start,
         default_danger_end,default_danger_total_hours,is_active
       ) VALUES ($1,$2,$3,$4,'DRAFT',$5,$6,$7,$8,$9,$10,$11,false)
       RETURNING *`,
      [source.pm_code, source.pm_label, versionNo, revisionNo, source.maintenance_period,
        source.latest_offset_days, source.job_description, source.default_corrective_action,
        source.default_danger_start, source.default_danger_end, source.default_danger_total_hours]
    );
    const newId = inserted.rows[0].id;
    await client.query(
      `INSERT INTO pm_template_material (
         pm_template_id,material_id,default_qty,default_unit,display_note,sort_order,
         condition_code,condition_options,is_required,is_active
       ) SELECT $1,material_id,default_qty,default_unit,display_note,sort_order,
                condition_code,condition_options,is_required,is_active
           FROM pm_template_material WHERE pm_template_id=$2`,
      [newId, source.id]
    );
    await client.query(
      `INSERT INTO pm_template_instrument (pm_template_id,instrument_id,sort_order,is_required,is_active)
       SELECT $1,instrument_id,sort_order,is_required,is_active
         FROM pm_template_instrument WHERE pm_template_id=$2`,
      [newId, source.id]
    );
    await client.query(
      `INSERT INTO pm_template_wi (pm_template_id,wi_document_id,sort_order,is_required,is_active)
       SELECT $1,wi_document_id,sort_order,is_required,is_active
         FROM pm_template_wi WHERE pm_template_id=$2`,
      [newId, source.id]
    );
    await client.query(
      `INSERT INTO pm_template_check_item (
         pm_template_id,section,item_no,item_description,check_type,standard_value,unit,
         default_status,requires_value,sort_order,is_active,is_required,min_value,max_value,
         validation_rule,section_sort_order
       ) SELECT $1,section,item_no,item_description,check_type,standard_value,unit,
                default_status,requires_value,sort_order,is_active,is_required,min_value,max_value,
                validation_rule,section_sort_order
           FROM pm_template_check_item WHERE pm_template_id=$2`,
      [newId, source.id]
    );
    await client.query(
      `INSERT INTO pm_template_attachment (
         pm_template_id,attachment_code,attachment_name,attachment_type,schema_json,sort_order,is_active,
         is_required,condition_code,schema_version,render_strategy
       ) SELECT $1,attachment_code,attachment_name,attachment_type,schema_json,sort_order,is_active,
                is_required,condition_code,schema_version,render_strategy
           FROM pm_template_attachment WHERE pm_template_id=$2`,
      [newId, source.id]
    );
    return inserted.rows[0];
  });
  res.status(201).json({ item: result });
}));

router.patch("/:id", requireRoles(...EDIT_ROLES), asyncHandler(async (req, res) => {
  const body = req.body || {};
  const result = await withTransaction(async (client) => {
    await ensureDraft(client, req.params.id, true);
    const updated = await client.query(
      `UPDATE pm_template SET
         pm_label=COALESCE($2,pm_label),version_no=COALESCE($3,version_no),
         maintenance_period=$4,latest_offset_days=COALESCE($5,latest_offset_days),
         job_description=$6,default_corrective_action=$7,effective_from=$8,effective_to=$9,
         updated_at=now()
       WHERE id=$1 RETURNING *`,
      [req.params.id, cleanText(body.pmLabel), cleanText(body.versionNo), cleanText(body.maintenancePeriod),
        numeric(body.latestOffsetDays), cleanText(body.jobDescription), cleanText(body.defaultCorrectiveAction),
        cleanText(body.effectiveFrom), cleanText(body.effectiveTo)]
    );
    return updated.rows[0];
  });
  res.json({ item: result });
}));

router.put("/:id/check-items", requireRoles(...EDIT_ROLES), asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  await withTransaction(async (client) => {
    await ensureDraft(client, req.params.id, true);
    const kept = [];
    for (const [index, item] of items.entries()) {
      const section = cleanText(item.section);
      const itemNo = cleanText(item.itemNo);
      const description = cleanText(item.itemDescription);
      if (!section || !itemNo || !description) throw httpError(400, `第 ${index + 1} 筆檢查項目不完整`);
      const result = await client.query(
        `INSERT INTO pm_template_check_item (
           pm_template_id,section,item_no,item_description,check_type,standard_value,unit,
           default_status,requires_value,sort_order,is_active,is_required,min_value,max_value,
           validation_rule,section_sort_order
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12,$13,$14,$15)
         ON CONFLICT (pm_template_id,item_no) DO UPDATE SET
           section=EXCLUDED.section,item_description=EXCLUDED.item_description,
           check_type=EXCLUDED.check_type,standard_value=EXCLUDED.standard_value,unit=EXCLUDED.unit,
           default_status=EXCLUDED.default_status,requires_value=EXCLUDED.requires_value,
           sort_order=EXCLUDED.sort_order,is_active=true,is_required=EXCLUDED.is_required,
           min_value=EXCLUDED.min_value,max_value=EXCLUDED.max_value,
           validation_rule=EXCLUDED.validation_rule,section_sort_order=EXCLUDED.section_sort_order,
           updated_at=now()
         RETURNING id`,
        [req.params.id, section, itemNo, description, item.checkType || "checkbox",
          cleanText(item.standardValue), cleanText(item.unit), item.defaultStatus || "未填",
          item.requiresValue === true, numeric(item.sortOrder) ?? index + 1, item.isRequired === true,
          numeric(item.minValue), numeric(item.maxValue), cleanText(item.validationRule),
          numeric(item.sectionSortOrder) ?? 0]
      );
      kept.push(result.rows[0].id);
    }
    await client.query(
      `UPDATE pm_template_check_item SET is_active=false,updated_at=now()
        WHERE pm_template_id=$1 AND NOT (id=ANY($2::uuid[]))`,
      [req.params.id, kept]
    );
  });
  res.json(await detail({ query }, req.params.id));
}));

router.put("/:id/materials", requireRoles(...EDIT_ROLES), asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  await withTransaction(async (client) => {
    await ensureDraft(client, req.params.id, true);
    const kept = [];
    for (const [index, item] of items.entries()) {
      if (!item.materialId) throw httpError(400, `第 ${index + 1} 筆用料未選擇物料`);
      await client.query(
        `INSERT INTO pm_template_material (
           pm_template_id,material_id,default_qty,default_unit,display_note,sort_order,
           condition_code,condition_options,is_required,is_active
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,true)
         ON CONFLICT (pm_template_id,material_id) DO UPDATE SET
           default_qty=EXCLUDED.default_qty,default_unit=EXCLUDED.default_unit,
           display_note=EXCLUDED.display_note,sort_order=EXCLUDED.sort_order,
           condition_code=EXCLUDED.condition_code,condition_options=EXCLUDED.condition_options,
           is_required=EXCLUDED.is_required,is_active=true`,
        [req.params.id, item.materialId, numeric(item.defaultQty), cleanText(item.defaultUnit),
          cleanText(item.displayNote), numeric(item.sortOrder) ?? index + 1,
          cleanText(item.conditionCode) || "ALWAYS", JSON.stringify(item.conditionOptions || []),
          item.isRequired === true]
      );
      kept.push(item.materialId);
    }
    await client.query(
      `UPDATE pm_template_material SET is_active=false
        WHERE pm_template_id=$1 AND NOT (material_id=ANY($2::uuid[]))`,
      [req.params.id, kept]
    );
  });
  res.json(await detail({ query }, req.params.id));
}));

router.put("/:id/attachments", requireRoles(...EDIT_ROLES), asyncHandler(async (req, res) => {
  const items = normalizeAttachmentList(req.body?.items || []);
  await withTransaction(async (client) => {
    await ensureDraft(client, req.params.id, true);
    const kept = [];
    for (const item of items) {
      const result = await client.query(
        `INSERT INTO pm_template_attachment (
           pm_template_id,attachment_code,attachment_name,attachment_type,schema_json,sort_order,is_active,
           is_required,condition_code,schema_version,render_strategy
         ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,true,$7,$8,$9,$10)
         ON CONFLICT (pm_template_id,attachment_code) DO UPDATE SET
           attachment_name=EXCLUDED.attachment_name,attachment_type=EXCLUDED.attachment_type,
           schema_json=EXCLUDED.schema_json,sort_order=EXCLUDED.sort_order,is_active=true,
           is_required=EXCLUDED.is_required,condition_code=EXCLUDED.condition_code,
           schema_version=EXCLUDED.schema_version,render_strategy=EXCLUDED.render_strategy,
           updated_at=now()
         RETURNING id`,
        [req.params.id, item.attachmentCode, item.attachmentName, item.attachmentType,
          JSON.stringify(item.schemaJson), item.sortOrder, Boolean(item.isRequired), item.conditionCode,
          item.schemaVersion, item.renderStrategy]
      );
      kept.push(result.rows[0].id);
    }
    await client.query(
      `UPDATE pm_template_attachment SET is_active=false,updated_at=now()
        WHERE pm_template_id=$1 AND NOT (id=ANY($2::uuid[]))`,
      [req.params.id, kept]
    );
  });
  res.json(await detail({ query }, req.params.id));
}));

async function replaceLinks(req, res, config) {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  await withTransaction(async (client) => {
    await ensureDraft(client, req.params.id, true);
    const kept = [];
    for (const [index, item] of items.entries()) {
      const linkedId = item[config.inputKey];
      if (!linkedId) throw httpError(400, `第 ${index + 1} 筆關聯資料未選擇`);
      await client.query(
        `INSERT INTO ${config.table} (pm_template_id,${config.idColumn},sort_order,is_required,is_active)
         VALUES ($1,$2,$3,$4,true)
         ON CONFLICT (pm_template_id,${config.idColumn}) DO UPDATE SET
           sort_order=EXCLUDED.sort_order,is_required=EXCLUDED.is_required,is_active=true`,
        [req.params.id, linkedId, numeric(item.sortOrder) ?? index + 1, item.isRequired !== false]
      );
      kept.push(linkedId);
    }
    await client.query(
      `UPDATE ${config.table} SET is_active=false
        WHERE pm_template_id=$1 AND NOT (${config.idColumn}=ANY($2::uuid[]))`,
      [req.params.id, kept]
    );
  });
  res.json(await detail({ query }, req.params.id));
}

router.put("/:id/instruments", requireRoles(...EDIT_ROLES), asyncHandler((req, res) =>
  replaceLinks(req, res, { table: "pm_template_instrument", idColumn: "instrument_id", inputKey: "instrumentId" })
));

router.put("/:id/wi-documents", requireRoles(...EDIT_ROLES), asyncHandler((req, res) =>
  replaceLinks(req, res, { table: "pm_template_wi", idColumn: "wi_document_id", inputKey: "wiDocumentId" })
));

router.post("/:id/publish", requireRoles(...EDIT_ROLES), asyncHandler(async (req, res) => {
  const published = await withTransaction(async (client) => {
    const draft = await ensureDraft(client, req.params.id, true);
    const readiness = await client.query(
      `SELECT
         (SELECT count(*) FROM pm_template_check_item WHERE pm_template_id=$1 AND is_active=true)::int AS checks,
         (SELECT count(*) FROM pm_template_wi WHERE pm_template_id=$1 AND is_active=true)::int AS wis,
         (SELECT count(*) FROM form_template WHERE pm_template_id=$1 AND lifecycle_status='PUBLISHED' AND is_active=true)::int AS forms`,
      [draft.id]
    );
    if (!readiness.rows[0].checks) throw httpError(409, "發布前至少需要一筆啟用的檢查項目");
    if (!readiness.rows[0].wis) throw httpError(409, "發布前至少需要一筆啟用的 W.I.No");
    if (!readiness.rows[0].forms) throw httpError(409, "發布前至少需要一份已發布的 Word 範本版本");
    await client.query(
      `UPDATE pm_template SET lifecycle_status='RETIRED',is_active=false,
              effective_to=COALESCE(effective_to,CURRENT_DATE-1),updated_at=now()
        WHERE pm_code=$1 AND lifecycle_status='PUBLISHED' AND is_active=true`,
      [draft.pm_code]
    );
    const result = await client.query(
      `UPDATE pm_template SET lifecycle_status='PUBLISHED',is_active=true,
              effective_from=COALESCE($2::date,effective_from,CURRENT_DATE),
              effective_to=NULL,published_at=now(),published_by=$3,updated_at=now()
        WHERE id=$1 RETURNING *`,
      [draft.id, cleanText(req.body?.effectiveFrom), actorId(req)]
    );
    return result.rows[0];
  });
  res.json({ item: published });
}));

module.exports = router;
