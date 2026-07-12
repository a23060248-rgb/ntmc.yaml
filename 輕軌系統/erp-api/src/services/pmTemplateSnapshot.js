const crypto = require("node:crypto");

function canonicalValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonicalValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

function canonicalStringify(value) {
  return JSON.stringify(canonicalValue(value));
}

function hashTemplateSnapshot(snapshot) {
  return crypto.createHash("sha256").update(canonicalStringify(snapshot)).digest("hex");
}

async function buildPmTemplateSnapshot(client, templateId, requestedFormTemplateId = null) {
  const template = await client.query(
    `SELECT id,pm_code,pm_label,version_no,revision_no,lifecycle_status,maintenance_period,
            latest_offset_days,job_description,default_corrective_action,effective_from,effective_to
       FROM pm_template WHERE id=$1`,
    [templateId]
  );
  if (!template.rowCount) {
    const error = new Error("預檢模板版本不存在");
    error.status = 404;
    throw error;
  }
  const [checks, materials, instruments, wis, attachments] = await Promise.all([
    client.query(
      `SELECT id,section,item_no,item_description,check_type,standard_value,unit,default_status,
              requires_value,is_required,min_value,max_value,validation_rule,section_sort_order,sort_order
         FROM pm_template_check_item WHERE pm_template_id=$1 AND is_active=true
        ORDER BY section_sort_order,section,sort_order,item_no`, [templateId]
    ),
    client.query(
      `SELECT ptm.material_id,m.part_no,m.material_name,m.spec,ptm.default_qty,
              COALESCE(ptm.default_unit,m.unit) AS unit,ptm.display_note,ptm.condition_code,
              ptm.condition_options,ptm.is_required,ptm.sort_order
         FROM pm_template_material ptm JOIN material m ON m.id=ptm.material_id
        WHERE ptm.pm_template_id=$1 AND ptm.is_active=true ORDER BY ptm.sort_order,m.part_no`, [templateId]
    ),
    client.query(
      `SELECT pti.instrument_id,i.instrument_no,i.instrument_name,i.instrument_type,
              i.calibration_due_date,i.status,pti.is_required,pti.sort_order
         FROM pm_template_instrument pti JOIN instrument i ON i.id=pti.instrument_id
        WHERE pti.pm_template_id=$1 AND pti.is_active=true ORDER BY pti.sort_order,i.instrument_no`, [templateId]
    ),
    client.query(
      `SELECT ptw.wi_document_id,wi.wi_no,wi.wi_name,wi.version_no,wi.status,
              ptw.is_required,ptw.sort_order
         FROM pm_template_wi ptw JOIN wi_document wi ON wi.id=ptw.wi_document_id
        WHERE ptw.pm_template_id=$1 AND ptw.is_active=true ORDER BY ptw.sort_order,wi.wi_no`, [templateId]
    ),
    client.query(
      `SELECT id,attachment_code,attachment_name,attachment_type,schema_json,is_required,
              condition_code,schema_version,render_strategy,sort_order
         FROM pm_template_attachment WHERE pm_template_id=$1 AND is_active=true
        ORDER BY sort_order,attachment_code`, [templateId]
    ),
  ]);
  const formValues = [templateId];
  let formWhere = `ft.pm_template_id=$1 AND ft.lifecycle_status='PUBLISHED' AND ft.is_active=true`;
  if (requestedFormTemplateId) {
    formValues.push(requestedFormTemplateId);
    formWhere = `ft.pm_template_id=$1 AND ft.id=$2 AND ft.lifecycle_status='PUBLISHED'`;
  }
  const form = await client.query(
    `SELECT ft.id,ft.template_code,ft.template_name,ft.version_no,ft.source_file_name,
            ft.storage_path,ft.file_hash,ft.file_format,ft.effective_from,ft.effective_to
       FROM form_template ft WHERE ${formWhere}
      ORDER BY ft.effective_from DESC NULLS LAST,ft.version_no DESC LIMIT 1`,
    formValues
  );
  if (requestedFormTemplateId && !form.rowCount) {
    const error = new Error("指定的 Word 範本不是此預檢模板的已發布版本");
    error.status = 409;
    throw error;
  }
  const formId = form.rows[0]?.id || null;
  const [fieldMappings, blockMappings] = formId ? await Promise.all([
    client.query(
      `SELECT field_key,source_path,word_target_type,word_target,transform_code,default_value,is_required,sort_order
         FROM form_template_field_mapping WHERE form_template_id=$1 ORDER BY sort_order,field_key`, [formId]
    ),
    client.query(
      `SELECT block_code,source_path,block_type,word_target_type,word_target,transform_code,
              config_json,is_required,sort_order
         FROM form_template_block_mapping WHERE form_template_id=$1 ORDER BY sort_order,block_code`, [formId]
    ),
  ]) : [{ rows: [] }, { rows: [] }];
  return {
    schemaVersion: 1,
    template: template.rows[0],
    checks: checks.rows,
    materials: materials.rows,
    instruments: instruments.rows,
    wiDocuments: wis.rows,
    attachments: attachments.rows,
    formTemplate: form.rows[0] || null,
    fieldMappings: fieldMappings.rows,
    blockMappings: blockMappings.rows,
  };
}

module.exports = {
  buildPmTemplateSnapshot,
  canonicalStringify,
  hashTemplateSnapshot,
};
