const express = require("express");
const crypto = require("node:crypto");
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

function sectionCode(value) {
  const code = cleanText(value)?.toUpperCase();
  if (!code || !/^[A-Z0-9][A-Z0-9_-]{1,49}$/.test(code)) {
    throw httpError(400, "區段代碼只能使用 2-50 碼英數字、底線或連字號");
  }
  return code;
}

function generatedSectionCode(name) {
  return `SEC-${crypto.createHash("sha1").update(name).digest("hex").slice(0, 10).toUpperCase()}`;
}

async function resolveItemSection(client, templateId, item, fallbackSortOrder) {
  if (item.sectionId || item.section_id) {
    const result = await client.query(
      `SELECT id,section_code,section_name,sort_order
         FROM pm_template_section
        WHERE id=$1 AND pm_template_id=$2 AND is_active=true`,
      [item.sectionId || item.section_id, templateId],
    );
    if (!result.rowCount) throw httpError(400, "檢查項目的區段不存在或已停用");
    return result.rows[0];
  }

  const name = cleanText(item.section);
  if (!name) throw httpError(400, "檢查項目必須指定區段");
  const existing = await client.query(
    `SELECT id,section_code,section_name,sort_order
       FROM pm_template_section
      WHERE pm_template_id=$1 AND lower(section_name)=lower($2) AND is_active=true
      ORDER BY sort_order,section_code LIMIT 1`,
    [templateId, name],
  );
  if (existing.rowCount) return existing.rows[0];

  const created = await client.query(
    `INSERT INTO pm_template_section (pm_template_id,section_code,section_name,sort_order)
     VALUES ($1,$2,$3,$4)
     RETURNING id,section_code,section_name,sort_order`,
    [templateId, generatedSectionCode(name), name, fallbackSortOrder],
  );
  return created.rows[0];
}

async function cloneWordForms(client, sourceTemplateId, targetTemplateId, revisionNo, createdBy) {
  const sourceForms = await client.query(
    `SELECT * FROM form_template
      WHERE pm_template_id=$1 AND lifecycle_status='PUBLISHED' AND is_active=true
      ORDER BY version_no`,
    [sourceTemplateId],
  );
  for (const source of sourceForms.rows) {
    const copied = await client.query(
      `INSERT INTO form_template (
         template_code,template_name,pm_template_id,version_no,source_file_name,storage_path,
         file_hash,file_format,effective_from,effective_to,lifecycle_status,is_active,metadata,created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,NULL,'DRAFT',true,$9::jsonb,$10)
       RETURNING id`,
      [source.template_code, source.template_name, targetTemplateId,
        `${source.version_no}-R${revisionNo}`, source.source_file_name, source.storage_path,
        source.file_hash, source.file_format, JSON.stringify(source.metadata || {}), createdBy],
    );
    const targetFormId = copied.rows[0].id;
    await client.query(
      `INSERT INTO form_template_field_mapping (
         form_template_id,field_key,source_path,word_target_type,word_target,
         transform_code,default_value,is_required,sort_order
       ) SELECT $1,field_key,source_path,word_target_type,word_target,
                transform_code,default_value,is_required,sort_order
           FROM form_template_field_mapping WHERE form_template_id=$2`,
      [targetFormId, source.id],
    );
    await client.query(
      `INSERT INTO form_template_block_mapping (
         form_template_id,block_code,source_path,block_type,word_target_type,word_target,
         transform_code,config_json,is_required,is_verified,sort_order
       ) SELECT $1,block_code,source_path,block_type,word_target_type,word_target,
                transform_code,config_json,is_required,false,sort_order
           FROM form_template_block_mapping WHERE form_template_id=$2`,
      [targetFormId, source.id],
    );
  }
}

function importBatchSummary(batch, rows) {
  const summary = rows.reduce((result, row) => {
    result[row.validation_status] = (result[row.validation_status] || 0) + 1;
    return result;
  }, {});
  return { ...batch, summary };
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
  const [sections, checks, materials, instruments, wis, attachments, forms] = await Promise.all([
    client.query(
      `SELECT * FROM pm_template_section
        WHERE pm_template_id=$1
        ORDER BY sort_order,section_code`,
      [id]
    ),
    client.query(
      `SELECT ci.*,COALESCE(ps.section_code,'LEGACY') AS section_code,
              COALESCE(ps.section_name,ci.section) AS section_name,
              COALESCE(ps.sort_order,ci.section_sort_order) AS resolved_section_sort_order
         FROM pm_template_check_item ci
         LEFT JOIN pm_template_section ps ON ps.id=ci.section_id
        WHERE ci.pm_template_id=$1
        ORDER BY COALESCE(ps.sort_order,ci.section_sort_order),COALESCE(ps.section_name,ci.section),ci.sort_order,ci.item_no`,
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
      `SELECT pta.*,pad.attachment_code AS library_attachment_code,
              pad.attachment_name AS library_attachment_name,
              padv.version_no AS library_version_no,
              padv.lifecycle_status AS library_lifecycle_status
         FROM pm_template_attachment pta
         LEFT JOIN pm_attachment_definition_version padv ON padv.id=pta.attachment_definition_version_id
         LEFT JOIN pm_attachment_definition pad ON pad.id=padv.attachment_definition_id
        WHERE pta.pm_template_id=$1 ORDER BY pta.sort_order,pta.attachment_code`,
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
    sections: sections.rows,
    checks: checks.rows,
    materials: materials.rows,
    instruments: instruments.rows,
    wiDocuments: wis.rows,
    attachments: attachments.rows,
    formTemplates: forms.rows,
  };
}

router.use(resolveAuth);

async function attachmentLibraryDetail(client, id) {
  const definition = await client.query(
    `SELECT * FROM pm_attachment_definition WHERE id=$1`,
    [id],
  );
  if (!definition.rowCount) throw httpError(404, "附件模板不存在");
  const versions = await client.query(
    `SELECT version.*,creator.display_name AS created_by_name,publisher.display_name AS published_by_name
       FROM pm_attachment_definition_version version
       LEFT JOIN app_user creator ON creator.id=version.created_by
       LEFT JOIN app_user publisher ON publisher.id=version.published_by
      WHERE version.attachment_definition_id=$1
      ORDER BY version.created_at DESC,version.version_no DESC`,
    [id],
  );
  return { item: definition.rows[0], versions: versions.rows };
}

router.get("/attachment-library", asyncHandler(async (req, res) => {
  const search = cleanText(req.query.search);
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const values = [];
  let where = "";
  if (search) {
    values.push(`%${search}%`);
    where = `WHERE (definition.attachment_code ILIKE $1 OR definition.attachment_name ILIKE $1)`;
  }
  values.push(limit, offset);
  const limitIndex = values.length - 1;
  const offsetIndex = values.length;
  const result = await query(
    `SELECT definition.*,
            count(*) OVER()::int AS total_count,
            published.id AS published_version_id,published.version_no AS published_version_no,
            published.schema_version AS published_schema_version,
            published.render_strategy AS published_render_strategy,
            published.published_at,
            (SELECT count(*)::int FROM pm_attachment_definition_version version
              WHERE version.attachment_definition_id=definition.id) AS version_count
       FROM pm_attachment_definition definition
       LEFT JOIN LATERAL (
         SELECT * FROM pm_attachment_definition_version version
          WHERE version.attachment_definition_id=definition.id
            AND version.lifecycle_status='PUBLISHED' AND version.is_active=true
          ORDER BY version.published_at DESC NULLS LAST,version.created_at DESC LIMIT 1
       ) published ON true
       ${where}
      ORDER BY definition.is_active DESC,definition.attachment_code
      LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values,
  );
  res.json({ items: result.rows, total: result.rows[0]?.total_count || 0, limit, offset });
}));

router.get("/attachment-library/published", asyncHandler(async (_req, res) => {
  const result = await query(
    `SELECT version.id AS attachment_definition_version_id,version.version_no,version.schema_version,
            version.schema_json,version.render_strategy,definition.id AS attachment_definition_id,
            definition.attachment_code,definition.attachment_name,definition.attachment_type,
            definition.description
       FROM pm_attachment_definition_version version
       JOIN pm_attachment_definition definition ON definition.id=version.attachment_definition_id
      WHERE version.lifecycle_status='PUBLISHED' AND version.is_active=true AND definition.is_active=true
      ORDER BY definition.attachment_code,version.published_at DESC NULLS LAST`,
  );
  res.json({ items: result.rows });
}));

router.get("/attachment-library/:id", asyncHandler(async (req, res) => {
  res.json(await attachmentLibraryDetail({ query }, req.params.id));
}));

router.post("/attachment-library", requireRoles(...EDIT_ROLES), asyncHandler(async (req, res) => {
  const normalized = normalizeAttachmentList([req.body])[0];
  const versionNo = cleanText(req.body?.versionNo) || "1";
  const result = await withTransaction(async (client) => {
    const definition = await client.query(
      `INSERT INTO pm_attachment_definition (
         attachment_code,attachment_name,attachment_type,description,is_active
       ) VALUES ($1,$2,$3,$4,true) RETURNING *`,
      [normalized.attachmentCode, normalized.attachmentName, normalized.attachmentType, cleanText(req.body?.description)],
    );
    await client.query(
      `INSERT INTO pm_attachment_definition_version (
         attachment_definition_id,version_no,schema_version,lifecycle_status,schema_json,
         render_strategy,source_asset_path,source_asset_hash,created_by
       ) VALUES ($1,$2,$3,'DRAFT',$4::jsonb,$5,$6,$7,$8)`,
      [definition.rows[0].id, versionNo, normalized.schemaVersion, JSON.stringify(normalized.schemaJson),
        normalized.renderStrategy, cleanText(req.body?.sourceAssetPath), cleanText(req.body?.sourceAssetHash), actorId(req)],
    );
    return attachmentLibraryDetail(client, definition.rows[0].id);
  });
  res.status(201).json(result);
}));

router.post("/attachment-library/:id/revisions", requireRoles(...EDIT_ROLES), asyncHandler(async (req, res) => {
  const versionNo = cleanText(req.body?.versionNo);
  if (!versionNo) throw httpError(400, "請輸入新附件版號");
  const result = await withTransaction(async (client) => {
    const definition = await client.query(`SELECT * FROM pm_attachment_definition WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!definition.rowCount || !definition.rows[0].is_active) throw httpError(404, "附件模板不存在或已停用");
    const source = await client.query(
      `SELECT * FROM pm_attachment_definition_version
        WHERE attachment_definition_id=$1 AND is_active=true
        ORDER BY CASE lifecycle_status WHEN 'PUBLISHED' THEN 0 WHEN 'DRAFT' THEN 1 ELSE 2 END,
                 published_at DESC NULLS LAST,created_at DESC LIMIT 1`,
      [req.params.id],
    );
    if (!source.rowCount) throw httpError(409, "附件模板尚無可複製版本");
    await client.query(
      `INSERT INTO pm_attachment_definition_version (
         attachment_definition_id,version_no,schema_version,lifecycle_status,schema_json,
         render_strategy,source_asset_path,source_asset_hash,created_by
       ) VALUES ($1,$2,$3,'DRAFT',$4::jsonb,$5,$6,$7,$8)`,
      [req.params.id, versionNo, source.rows[0].schema_version + 1, JSON.stringify(source.rows[0].schema_json),
        source.rows[0].render_strategy, source.rows[0].source_asset_path, source.rows[0].source_asset_hash, actorId(req)],
    );
    return attachmentLibraryDetail(client, req.params.id);
  });
  res.status(201).json(result);
}));

router.patch("/attachment-library/versions/:versionId", requireRoles(...EDIT_ROLES), asyncHandler(async (req, res) => {
  const result = await withTransaction(async (client) => {
    const current = await client.query(
      `SELECT version.*,definition.attachment_code,definition.attachment_name,definition.attachment_type
         FROM pm_attachment_definition_version version
         JOIN pm_attachment_definition definition ON definition.id=version.attachment_definition_id
        WHERE version.id=$1 FOR UPDATE`,
      [req.params.versionId],
    );
    if (!current.rowCount) throw httpError(404, "附件版本不存在");
    if (current.rows[0].lifecycle_status !== "DRAFT") throw httpError(409, "已發布附件不可直接修改，請建立新修訂");
    const normalized = normalizeAttachmentList([{
      attachmentCode: current.rows[0].attachment_code,
      attachmentName: req.body?.attachmentName ?? current.rows[0].attachment_name,
      attachmentType: current.rows[0].attachment_type,
      schemaJson: req.body?.schemaJson ?? current.rows[0].schema_json,
      schemaVersion: req.body?.schemaVersion ?? current.rows[0].schema_version,
      renderStrategy: req.body?.renderStrategy ?? current.rows[0].render_strategy,
    }])[0];
    await client.query(
      `UPDATE pm_attachment_definition_version
          SET schema_json=$2::jsonb,schema_version=$3,render_strategy=$4,
              source_asset_path=$5,source_asset_hash=$6,updated_at=now()
        WHERE id=$1`,
      [req.params.versionId, JSON.stringify(normalized.schemaJson), normalized.schemaVersion,
        normalized.renderStrategy, cleanText(req.body?.sourceAssetPath) ?? current.rows[0].source_asset_path,
        cleanText(req.body?.sourceAssetHash) ?? current.rows[0].source_asset_hash],
    );
    await client.query(
      `UPDATE pm_attachment_definition
          SET attachment_name=$2,description=COALESCE($3,description),updated_at=now()
        WHERE id=$1`,
      [current.rows[0].attachment_definition_id, normalized.attachmentName,
        cleanText(req.body?.description)],
    );
    return attachmentLibraryDetail(client, current.rows[0].attachment_definition_id);
  });
  res.json(result);
}));

router.post("/attachment-library/versions/:versionId/publish", requireRoles(...EDIT_ROLES), asyncHandler(async (req, res) => {
  const result = await withTransaction(async (client) => {
    const current = await client.query(
      `SELECT * FROM pm_attachment_definition_version WHERE id=$1 FOR UPDATE`,
      [req.params.versionId],
    );
    if (!current.rowCount) throw httpError(404, "附件版本不存在");
    if (current.rows[0].lifecycle_status !== "DRAFT") throw httpError(409, "只有草稿附件可以發布");
    await client.query(
      `UPDATE pm_attachment_definition_version
          SET lifecycle_status='RETIRED',effective_to=CURRENT_DATE,updated_at=now()
        WHERE attachment_definition_id=$1 AND lifecycle_status='PUBLISHED' AND id<>$2`,
      [current.rows[0].attachment_definition_id, req.params.versionId],
    );
    await client.query(
      `UPDATE pm_attachment_definition_version
          SET lifecycle_status='PUBLISHED',effective_from=COALESCE($2::date,CURRENT_DATE),
              effective_to=NULL,published_by=$3,published_at=now(),updated_at=now()
        WHERE id=$1`,
      [req.params.versionId, cleanText(req.body?.effectiveFrom), actorId(req)],
    );
    return attachmentLibraryDetail(client, current.rows[0].attachment_definition_id);
  });
  res.json(result);
}));

router.get("/import-batches", asyncHandler(async (req, res) => {
  const pmCode = cleanText(req.query.pmCode)?.toUpperCase();
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const values = [];
  const filters = [];
  if (pmCode) {
    values.push(pmCode);
    filters.push(`upper(batch.source_profile_code)= $${values.length}`);
  }
  if (cleanText(req.query.status)) {
    values.push(cleanText(req.query.status)?.toUpperCase());
    filters.push(`batch.import_status=$${values.length}`);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = await query(
    `SELECT batch.*,
            count(item.id)::int AS row_count,
            count(*) FILTER (WHERE item.validation_status='APPROVED')::int AS approved_count,
            count(*) FILTER (WHERE item.validation_status='REJECTED')::int AS rejected_count,
            count(*) FILTER (WHERE item.validation_status IN ('VALID','PENDING','INVALID'))::int AS pending_review_count
       FROM pm_template_check_item_import_batch batch
       LEFT JOIN pm_template_check_item_import_row item ON item.batch_id=batch.id
       ${where}
      GROUP BY batch.id
      ORDER BY batch.created_at DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset],
  );
  const total = await query(
    `SELECT count(*)::int AS total FROM pm_template_check_item_import_batch batch ${where}`,
    values,
  );
  res.json({ items: rows.rows, total: total.rows[0].total, limit, offset });
}));

router.get("/import-batches/:batchId", asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 250, 1), 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const batch = await query(`SELECT * FROM pm_template_check_item_import_batch WHERE id=$1`, [req.params.batchId]);
  if (!batch.rowCount) throw httpError(404, "Import batch not found");
  const rows = await query(
    `SELECT * FROM pm_template_check_item_import_row
      WHERE batch_id=$1
      ORDER BY sort_order,source_row_no
      LIMIT $2 OFFSET $3`,
    [req.params.batchId, limit, offset],
  );
  const allRows = await query(
    `SELECT validation_status FROM pm_template_check_item_import_row WHERE batch_id=$1`,
    [req.params.batchId],
  );
  res.json({ item: importBatchSummary(batch.rows[0], allRows.rows), rows: rows.rows, limit, offset });
}));

router.patch("/import-batches/:batchId/rows/:rowId", requireRoles(...EDIT_ROLES), asyncHandler(async (req, res) => {
  const body = req.body || {};
  const updated = await withTransaction(async (client) => {
    const batch = await client.query(
      `SELECT * FROM pm_template_check_item_import_batch WHERE id=$1 FOR UPDATE`,
      [req.params.batchId],
    );
    if (!batch.rowCount) throw httpError(404, "Import batch not found");
    if (["APPLIED", "REJECTED"].includes(batch.rows[0].import_status)) {
      throw httpError(409, "Closed import batches cannot be edited");
    }
    const existing = await client.query(
      `SELECT * FROM pm_template_check_item_import_row WHERE id=$1 AND batch_id=$2 FOR UPDATE`,
      [req.params.rowId, req.params.batchId],
    );
    if (!existing.rowCount) throw httpError(404, "Import row not found");
    const row = existing.rows[0];
    const fieldChanged = ["sectionCode", "sectionName", "itemNo", "itemDescription", "checkType", "standardValue", "unit", "requiresValue", "isRequired", "minValue", "maxValue", "sortOrder"]
      .some((key) => Object.prototype.hasOwnProperty.call(body, key));
    const status = cleanText(body.validationStatus)?.toUpperCase() || (fieldChanged ? "VALID" : row.validation_status);
    if (!["VALID", "APPROVED", "REJECTED"].includes(status)) {
      throw httpError(400, "Review status must be VALID, APPROVED, or REJECTED");
    }
    const checkType = body.checkType || row.check_type;
    if (!["checkbox", "value", "text"].includes(checkType)) throw httpError(400, "Unsupported check type");
    const sectionName = cleanText(body.sectionName) ?? row.section_name;
    const itemNo = cleanText(body.itemNo) ?? row.item_no;
    const description = cleanText(body.itemDescription) ?? row.item_description;
    if (!sectionName || !itemNo || !description) throw httpError(400, "Section, item number, and description are required");
    const note = cleanText(body.reviewNote);
    const result = await client.query(
      `UPDATE pm_template_check_item_import_row SET
         section_code=$3,section_name=$4,item_no=$5,item_description=$6,check_type=$7,
         standard_value=$8,unit=$9,requires_value=$10,is_required=$11,min_value=$12,max_value=$13,
         sort_order=$14,validation_status=$15,validation_messages=$16::jsonb,
         reviewed_by=$17,reviewed_at=CASE WHEN $15 IN ('APPROVED','REJECTED') THEN now() ELSE NULL END,
         updated_at=now()
       WHERE id=$1 AND batch_id=$2 RETURNING *`,
      [row.id, req.params.batchId, cleanText(body.sectionCode) || row.section_code || generatedSectionCode(sectionName),
        sectionName, itemNo, description, checkType, cleanText(body.standardValue) ?? row.standard_value,
        cleanText(body.unit) ?? row.unit, body.requiresValue ?? row.requires_value,
        body.isRequired ?? row.is_required, numeric(body.minValue) ?? row.min_value,
        numeric(body.maxValue) ?? row.max_value, numeric(body.sortOrder) ?? row.sort_order,
        status, JSON.stringify(note ? [note] : row.validation_messages || []), actorId(req)],
    );
    return result.rows[0];
  });
  res.json({ item: updated });
}));

router.post("/import-batches/:batchId/approve-all", requireRoles(...EDIT_ROLES), asyncHandler(async (req, res) => {
  const result = await withTransaction(async (client) => {
    const batch = await client.query(`SELECT * FROM pm_template_check_item_import_batch WHERE id=$1 FOR UPDATE`, [req.params.batchId]);
    if (!batch.rowCount) throw httpError(404, "Import batch not found");
    if (batch.rows[0].import_status !== "VALIDATED") throw httpError(409, "Only validated batches can be bulk approved");
    const rows = await client.query(
      `UPDATE pm_template_check_item_import_row SET validation_status='APPROVED',reviewed_by=$2,reviewed_at=now(),updated_at=now()
        WHERE batch_id=$1 AND validation_status='VALID'
        RETURNING id`,
      [req.params.batchId, actorId(req)],
    );
    return rows.rowCount;
  });
  res.json({ approved: result });
}));

router.post("/import-batches/:batchId/approve", requireRoles(...EDIT_ROLES), asyncHandler(async (req, res) => {
  const batch = await withTransaction(async (client) => {
    const locked = await client.query(`SELECT * FROM pm_template_check_item_import_batch WHERE id=$1 FOR UPDATE`, [req.params.batchId]);
    if (!locked.rowCount) throw httpError(404, "Import batch not found");
    const counts = await client.query(
      `SELECT count(*) FILTER (WHERE validation_status='APPROVED')::int AS approved,
              count(*) FILTER (WHERE validation_status IN ('VALID','PENDING','INVALID'))::int AS unresolved
         FROM pm_template_check_item_import_row WHERE batch_id=$1`,
      [req.params.batchId],
    );
    if (!counts.rows[0].approved || counts.rows[0].unresolved) {
      throw httpError(409, "All rows must be approved or rejected before the batch can be approved", counts.rows[0]);
    }
    const updated = await client.query(
      `UPDATE pm_template_check_item_import_batch
          SET import_status='APPROVED',approved_by=$2,approved_at=now(),notes=COALESCE($3,notes)
        WHERE id=$1 RETURNING *`,
      [req.params.batchId, actorId(req), cleanText(req.body?.note)],
    );
    return updated.rows[0];
  });
  res.json({ item: batch });
}));

router.post("/import-batches/:batchId/apply", requireRoles(...EDIT_ROLES), asyncHandler(async (req, res) => {
  const draft = await withTransaction(async (client) => {
    const batchResult = await client.query(`SELECT * FROM pm_template_check_item_import_batch WHERE id=$1 FOR UPDATE`, [req.params.batchId]);
    if (!batchResult.rowCount) throw httpError(404, "Import batch not found");
    const batch = batchResult.rows[0];
    if (batch.import_status !== "APPROVED") throw httpError(409, "Only approved batches can be applied");
    if (batch.pm_template_id) throw httpError(409, "This import batch has already been applied");
    const source = await client.query(
      `SELECT * FROM pm_template
        WHERE pm_code=$1 AND lifecycle_status='PUBLISHED' AND is_active=true
        ORDER BY revision_no DESC LIMIT 1 FOR UPDATE`,
      [batch.source_profile_code],
    );
    if (!source.rowCount) throw httpError(409, "No published source template matches this import batch");
    const approvedRows = await client.query(
      `SELECT * FROM pm_template_check_item_import_row
        WHERE batch_id=$1 AND validation_status='APPROVED'
        ORDER BY sort_order,source_row_no`,
      [batch.id],
    );
    if (!approvedRows.rowCount) throw httpError(409, "The import batch has no approved items");
    const sourceTemplate = source.rows[0];
    const next = await client.query(`SELECT COALESCE(max(revision_no),0)::int AS value FROM pm_template WHERE pm_code=$1`, [sourceTemplate.pm_code]);
    const revisionNo = next.rows[0].value + 1;
    const versionNo = cleanText(req.body?.versionNo) || `${sourceTemplate.version_no}-R${revisionNo}`;
    const inserted = await client.query(
      `INSERT INTO pm_template (
         pm_code,pm_label,version_no,revision_no,lifecycle_status,maintenance_period,latest_offset_days,
         job_description,default_corrective_action,default_danger_start,default_danger_end,
         default_danger_total_hours,is_active
       ) VALUES ($1,$2,$3,$4,'DRAFT',$5,$6,$7,$8,$9,$10,$11,false) RETURNING *`,
      [sourceTemplate.pm_code, sourceTemplate.pm_label, versionNo, revisionNo, sourceTemplate.maintenance_period,
        sourceTemplate.latest_offset_days, sourceTemplate.job_description, sourceTemplate.default_corrective_action,
        sourceTemplate.default_danger_start, sourceTemplate.default_danger_end, sourceTemplate.default_danger_total_hours],
    );
    const target = inserted.rows[0];
    await client.query(
      `INSERT INTO pm_template_material (pm_template_id,material_id,default_qty,default_unit,display_note,sort_order,condition_code,condition_options,is_required,is_active)
       SELECT $1,material_id,default_qty,default_unit,display_note,sort_order,condition_code,condition_options,is_required,is_active
         FROM pm_template_material WHERE pm_template_id=$2`, [target.id, sourceTemplate.id],
    );
    await client.query(
      `INSERT INTO pm_template_instrument (pm_template_id,instrument_id,sort_order,is_required,is_active)
       SELECT $1,instrument_id,sort_order,is_required,is_active FROM pm_template_instrument WHERE pm_template_id=$2`, [target.id, sourceTemplate.id],
    );
    await client.query(
      `INSERT INTO pm_template_wi (pm_template_id,wi_document_id,sort_order,is_required,is_active)
       SELECT $1,wi_document_id,sort_order,is_required,is_active FROM pm_template_wi WHERE pm_template_id=$2`, [target.id, sourceTemplate.id],
    );
    await client.query(
      `INSERT INTO pm_template_attachment (pm_template_id,attachment_code,attachment_name,attachment_type,schema_json,sort_order,is_active,is_required,condition_code,schema_version,render_strategy,attachment_definition_version_id)
       SELECT $1,attachment_code,attachment_name,attachment_type,schema_json,sort_order,is_active,is_required,condition_code,schema_version,render_strategy,attachment_definition_version_id
         FROM pm_template_attachment WHERE pm_template_id=$2`, [target.id, sourceTemplate.id],
    );
    const sectionIds = new Map();
    for (const row of approvedRows.rows) {
      const code = sectionCode(row.section_code || generatedSectionCode(row.section_name));
      if (!sectionIds.has(code)) {
        const section = await client.query(
          `INSERT INTO pm_template_section (pm_template_id,section_code,section_name,sort_order)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [target.id, code, row.section_name, row.sort_order],
        );
        sectionIds.set(code, section.rows[0].id);
      }
      await client.query(
        `INSERT INTO pm_template_check_item (
           pm_template_id,section_id,section,item_no,item_description,check_type,standard_value,unit,
           default_status,requires_value,sort_order,is_active,is_required,min_value,max_value,section_sort_order
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'未填',$9,$10,true,$11,$12,$13,$14)`,
        [target.id, sectionIds.get(code), row.section_name, row.item_no, row.item_description,
          row.check_type, row.standard_value, row.unit, row.requires_value, row.sort_order,
          row.is_required, row.min_value, row.max_value, row.sort_order],
      );
    }
    await cloneWordForms(client, sourceTemplate.id, target.id, revisionNo, actorId(req));
    await client.query(
      `UPDATE pm_template_check_item_import_batch
          SET import_status='APPLIED',pm_template_id=$2,applied_by=$3,applied_at=now()
        WHERE id=$1`,
      [batch.id, target.id, actorId(req)],
    );
    return target;
  });
  res.status(201).json({ item: draft });
}));

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
      `INSERT INTO pm_template_section (
         pm_template_id,section_code,section_name,description,sort_order,display_config,is_active
       ) SELECT $1,section_code,section_name,description,sort_order,display_config,is_active
           FROM pm_template_section WHERE pm_template_id=$2`,
      [newId, source.id]
    );
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
         pm_template_id,section_id,section,item_no,item_description,check_type,standard_value,unit,
         default_status,requires_value,sort_order,is_active,is_required,min_value,max_value,
         validation_rule,section_sort_order
       ) SELECT $1,new_section.id,item.section,item_no,item_description,check_type,standard_value,unit,
                default_status,requires_value,sort_order,is_active,is_required,min_value,max_value,
                validation_rule,section_sort_order
           FROM pm_template_check_item item
           JOIN pm_template_section source_section ON source_section.id=item.section_id
           JOIN pm_template_section new_section
             ON new_section.pm_template_id=$1 AND new_section.section_code=source_section.section_code
          WHERE item.pm_template_id=$2`,
      [newId, source.id]
    );
    await client.query(
      `INSERT INTO pm_template_attachment (
         pm_template_id,attachment_code,attachment_name,attachment_type,schema_json,sort_order,is_active,
         is_required,condition_code,schema_version,render_strategy,attachment_definition_version_id
       ) SELECT $1,attachment_code,attachment_name,attachment_type,schema_json,sort_order,is_active,
                is_required,condition_code,schema_version,render_strategy,attachment_definition_version_id
           FROM pm_template_attachment WHERE pm_template_id=$2`,
      [newId, source.id]
    );
    await cloneWordForms(client, source.id, newId, revisionNo, actorId(req));
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

router.put("/:id/sections", requireRoles(...EDIT_ROLES), asyncHandler(async (req, res) => {
  const sections = Array.isArray(req.body?.sections) ? req.body.sections : [];
  await withTransaction(async (client) => {
    await ensureDraft(client, req.params.id, true);
    const kept = [];
    for (const [index, item] of sections.entries()) {
      const name = cleanText(item.sectionName ?? item.section_name ?? item.name);
      if (!name) throw httpError(400, `第 ${index + 1} 筆區段缺少名稱`);
      const code = item.sectionCode || item.section_code
        ? sectionCode(item.sectionCode || item.section_code)
        : generatedSectionCode(name);
      const result = await client.query(
        `INSERT INTO pm_template_section (
           pm_template_id,section_code,section_name,description,sort_order,display_config,is_active
         ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,true)
         ON CONFLICT (pm_template_id,section_code) DO UPDATE SET
           section_name=EXCLUDED.section_name,description=EXCLUDED.description,
           sort_order=EXCLUDED.sort_order,display_config=EXCLUDED.display_config,is_active=true,
           updated_at=now()
         RETURNING id`,
        [req.params.id, code, name, cleanText(item.description), numeric(item.sortOrder) ?? index + 1,
          JSON.stringify(item.displayConfig || item.display_config || {})],
      );
      kept.push(result.rows[0].id);
    }

    const activeCheckCount = await client.query(
      `SELECT section_id,count(*)::int AS total
         FROM pm_template_check_item
        WHERE pm_template_id=$1 AND is_active=true AND section_id <> ALL($2::uuid[])
        GROUP BY section_id`,
      [req.params.id, kept],
    );
    if (activeCheckCount.rowCount) {
      throw httpError(409, "仍有啟用檢查項目的區段不可停用；請先調整檢查項目");
    }
    await client.query(
      `UPDATE pm_template_section SET is_active=false,updated_at=now()
        WHERE pm_template_id=$1 AND NOT (id=ANY($2::uuid[]))`,
      [req.params.id, kept],
    );
  });
  res.json(await detail({ query }, req.params.id));
}));

router.put("/:id/check-items", requireRoles(...EDIT_ROLES), asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  await withTransaction(async (client) => {
    await ensureDraft(client, req.params.id, true);
    const kept = [];
    for (const [index, item] of items.entries()) {
      const itemNo = cleanText(item.itemNo);
      const description = cleanText(item.itemDescription);
      if (!itemNo || !description) throw httpError(400, `第 ${index + 1} 筆檢查項目不完整`);
      const section = await resolveItemSection(
        client,
        req.params.id,
        item,
        numeric(item.sectionSortOrder) ?? index + 1,
      );
      const result = await client.query(
        `INSERT INTO pm_template_check_item (
           pm_template_id,section_id,section,item_no,item_description,check_type,standard_value,unit,
           default_status,requires_value,sort_order,is_active,is_required,min_value,max_value,
           validation_rule,section_sort_order
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12,$13,$14,$15,$16)
         ON CONFLICT (pm_template_id,item_no) DO UPDATE SET
           section_id=EXCLUDED.section_id,section=EXCLUDED.section,item_description=EXCLUDED.item_description,
           check_type=EXCLUDED.check_type,standard_value=EXCLUDED.standard_value,unit=EXCLUDED.unit,
           default_status=EXCLUDED.default_status,requires_value=EXCLUDED.requires_value,
           sort_order=EXCLUDED.sort_order,is_active=true,is_required=EXCLUDED.is_required,
           min_value=EXCLUDED.min_value,max_value=EXCLUDED.max_value,
           validation_rule=EXCLUDED.validation_rule,section_sort_order=EXCLUDED.section_sort_order,
           updated_at=now()
         RETURNING id`,
        [req.params.id, section.id, section.section_name, itemNo, description, item.checkType || "checkbox",
          cleanText(item.standardValue), cleanText(item.unit), item.defaultStatus || "未填",
          item.requiresValue === true, numeric(item.sortOrder) ?? index + 1, item.isRequired === true,
          numeric(item.minValue), numeric(item.maxValue), cleanText(item.validationRule),
          section.sort_order]
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
    for (const sourceItem of items) {
      let item = sourceItem;
      if (sourceItem.definitionVersionId) {
        const libraryVersion = await client.query(
          `SELECT version.id,version.version_no,version.schema_version,version.schema_json,version.render_strategy,
                  definition.attachment_code,definition.attachment_name,definition.attachment_type
             FROM pm_attachment_definition_version version
             JOIN pm_attachment_definition definition ON definition.id=version.attachment_definition_id
            WHERE version.id=$1 AND version.lifecycle_status='PUBLISHED'
              AND version.is_active=true AND definition.is_active=true`,
          [sourceItem.definitionVersionId],
        );
        if (!libraryVersion.rowCount) throw httpError(400, `附件 ${sourceItem.attachmentCode} 未選擇有效的已發布附件版本`);
        const library = libraryVersion.rows[0];
        item = {
          ...sourceItem,
          attachmentCode: library.attachment_code,
          attachmentName: library.attachment_name,
          attachmentType: library.attachment_type,
          schemaJson: library.schema_json,
          schemaVersion: library.schema_version,
          renderStrategy: library.render_strategy,
        };
      }
      const result = await client.query(
        `INSERT INTO pm_template_attachment (
           pm_template_id,attachment_code,attachment_name,attachment_type,schema_json,sort_order,is_active,
           is_required,condition_code,schema_version,render_strategy,attachment_definition_version_id
         ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,true,$7,$8,$9,$10,$11)
         ON CONFLICT (pm_template_id,attachment_code) DO UPDATE SET
           attachment_name=EXCLUDED.attachment_name,attachment_type=EXCLUDED.attachment_type,
           schema_json=EXCLUDED.schema_json,sort_order=EXCLUDED.sort_order,is_active=true,
           is_required=EXCLUDED.is_required,condition_code=EXCLUDED.condition_code,
           schema_version=EXCLUDED.schema_version,render_strategy=EXCLUDED.render_strategy,
           attachment_definition_version_id=EXCLUDED.attachment_definition_version_id,
           updated_at=now()
         RETURNING id`,
        [req.params.id, item.attachmentCode, item.attachmentName, item.attachmentType,
          JSON.stringify(item.schemaJson), item.sortOrder, Boolean(item.isRequired), item.conditionCode,
          item.schemaVersion, item.renderStrategy, item.definitionVersionId]
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
