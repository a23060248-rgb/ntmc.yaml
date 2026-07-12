const ATTACHMENT_TYPES = new Set(["SEAT_MAP", "MEASUREMENT_TABLE", "OTHER"]);
const RENDER_STRATEGIES = new Set(["WORD_BLOCK", "WORD_TABLE", "WORD_OVERLAY", "DATA_ONLY"]);

function definitionError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function attachmentCode(value) {
  const code = cleanText(value)?.toUpperCase();
  if (!code || !/^[A-Z0-9][A-Z0-9_-]{1,49}$/.test(code)) {
    throw definitionError("附件代碼只能使用 2-50 碼英數字、底線或連字號");
  }
  return code;
}

function objectSchema(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw definitionError("附件結構必須是 JSON 物件");
  }
  return value;
}

function uniqueCodes(items, label) {
  const seen = new Set();
  for (const item of items) {
    const code = cleanText(item?.code ?? item?.key);
    if (!code) throw definitionError(`${label}代碼不可空白`);
    if (seen.has(code)) throw definitionError(`${label}代碼重複：${code}`);
    seen.add(code);
  }
}

function validateSeatMap(schema) {
  if (!Array.isArray(schema.modules) || !schema.modules.length) {
    throw definitionError("座椅圖至少需要一個模組");
  }
  uniqueCodes(schema.modules, "座椅模組");
  for (const module of schema.modules) {
    if (!Array.isArray(module.rows) || !module.rows.length) {
      throw definitionError(`座椅模組 ${module.code} 至少需要一列`);
    }
    for (const row of module.rows) {
      if (!Array.isArray(row) || !row.length) throw definitionError(`座椅模組 ${module.code} 包含空白列`);
      if (row.some((cell) => cell !== null && cell !== "S" && cell !== "P")) {
        throw definitionError(`座椅模組 ${module.code} 只能使用 S、P 或空位`);
      }
    }
  }
}

function validateMeasurementTable(schema) {
  if (!Array.isArray(schema.points) || !schema.points.length) {
    throw definitionError("量測附件至少需要一個量測點");
  }
  if (!Array.isArray(schema.fields) || !schema.fields.length) {
    throw definitionError("量測附件至少需要一個欄位");
  }
  uniqueCodes(schema.points, "量測點");
  uniqueCodes(schema.fields, "量測欄位");
  for (const field of schema.fields) {
    if (!cleanText(field.label)) throw definitionError(`量測欄位 ${field.key} 缺少名稱`);
    const min = field.min === "" || field.min === null || field.min === undefined ? null : Number(field.min);
    const max = field.max === "" || field.max === null || field.max === undefined ? null : Number(field.max);
    if (min !== null && !Number.isFinite(min)) throw definitionError(`量測欄位 ${field.key} 最小值格式不正確`);
    if (max !== null && !Number.isFinite(max)) throw definitionError(`量測欄位 ${field.key} 最大值格式不正確`);
    if (min !== null && max !== null && min > max) throw definitionError(`量測欄位 ${field.key} 最小值不可大於最大值`);
  }
}

function normalizeAttachmentInput(item, index = 0) {
  const code = attachmentCode(item?.attachmentCode ?? item?.attachment_code);
  const name = cleanText(item?.attachmentName ?? item?.attachment_name);
  if (!name) throw definitionError(`第 ${index + 1} 筆附件缺少名稱`);
  const type = String(item?.attachmentType ?? item?.attachment_type ?? "OTHER").toUpperCase();
  if (!ATTACHMENT_TYPES.has(type)) throw definitionError(`附件 ${code} 類型不支援`);
  const schema = objectSchema(item?.schemaJson ?? item?.schema_json ?? {});
  if (type === "SEAT_MAP") validateSeatMap(schema);
  if (type === "MEASUREMENT_TABLE") validateMeasurementTable(schema);
  const renderStrategy = String(item?.renderStrategy ?? item?.render_strategy ?? "WORD_BLOCK").toUpperCase();
  if (!RENDER_STRATEGIES.has(renderStrategy)) throw definitionError(`附件 ${code} 的 Word 輸出策略不支援`);
  const schemaVersion = Number(item?.schemaVersion ?? item?.schema_version ?? 1);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) throw definitionError(`附件 ${code} 的結構版號必須為正整數`);
  return {
    attachmentCode: code,
    attachmentName: name,
    attachmentType: type,
    schemaJson: schema,
    sortOrder: Number(item?.sortOrder ?? item?.sort_order ?? index + 1),
    isRequired: item?.isRequired ?? item?.is_required ?? true,
    conditionCode: cleanText(item?.conditionCode ?? item?.condition_code) || "ALWAYS",
    schemaVersion,
    renderStrategy,
  };
}

function normalizeAttachmentList(items) {
  if (!Array.isArray(items)) throw definitionError("附件清單格式不正確");
  const normalized = items.map(normalizeAttachmentInput);
  const codes = new Set();
  for (const item of normalized) {
    if (codes.has(item.attachmentCode)) throw definitionError(`附件代碼重複：${item.attachmentCode}`);
    codes.add(item.attachmentCode);
  }
  return normalized;
}

module.exports = {
  normalizeAttachmentInput,
  normalizeAttachmentList,
  validateMeasurementTable,
  validateSeatMap,
};
