const ExcelJS = require("exceljs");

const MATERIAL_SHEET = "物料匯入";
const MATERIAL_HEADERS = Object.freeze([
  "系統碼 *",
  "類別碼 *",
  "流水號 *",
  "型式碼 *",
  "料號（自動）",
  "物料名稱 *",
  "規格",
  "單位 *",
  "物料屬性（自動）",
  "系統名稱（自動）",
  "子系統（選填）",
  "類別名稱（選填）",
  "安全等級",
  "可修件",
  "序號管理",
  "請購點",
  "交期天數",
  "預估單價",
  "市售品",
  "檢討說明",
]);

const SOURCE_FIELDS = Object.freeze([
  "system_code",
  "category_code",
  "sequence_no",
  "type_code",
  "part_no",
  "material_name",
  "spec",
  "unit",
  "material_property",
  "system_name",
  "source_subsystem_code",
  "category_name",
  "safety_level",
  "repairable",
  "is_serialized",
  "reorder_point",
  "lead_time_days",
  "estimated_unit_price",
  "market_available",
  "review_note",
]);

const OWNED_MATERIAL_FIELDS = Object.freeze([
  "part_no",
  "material_name",
  "spec",
  "unit",
  "system_code",
  "system_name",
  "category_code",
  "category_name",
  "sequence_no",
  "type_code",
  "material_property",
  "repairable",
  "is_serialized",
  "safety_level",
  "lead_time_days",
  "reorder_point",
  "estimated_unit_price",
  "market_available",
  "review_note",
]);

function scalarCellValue(cell) {
  const value = cell?.value;
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "result")) return value.result ?? null;
    if (Array.isArray(value.richText)) return value.richText.map((item) => item.text).join("");
    if (value.text !== undefined) return value.text;
  }
  return value;
}

function text(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized === "" ? null : normalized;
}

function code(value) {
  const normalized = text(value);
  return normalized ? normalized.toUpperCase() : null;
}

function usableLookupText(value) {
  const normalized = text(value);
  return normalized && normalized !== "[object Object]" ? normalized : null;
}

function decimal(value, field, messages, { integer = false, minimum = null } = {}) {
  const normalized = text(value);
  if (normalized === null) return null;
  const parsed = Number(String(normalized).replaceAll(",", ""));
  if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed))) {
    messages.push(error("INVALID_NUMBER", field, `${field} 必須是${integer ? "整數" : "數字"}`));
    return null;
  }
  if (minimum !== null && parsed < minimum) {
    messages.push(error("NUMBER_BELOW_MINIMUM", field, `${field} 不可小於 ${minimum}`));
  }
  return parsed;
}

function booleanValue(value, field, messages, { blankValue = false } = {}) {
  if (value === null || value === undefined || text(value) === null) return blankValue;
  if (value === true || value === false) return value;
  const normalized = String(value).trim().toLowerCase();
  if (["是", "true", "1", "y", "yes"].includes(normalized)) return true;
  if (["否", "false", "0", "n", "no"].includes(normalized)) return false;
  messages.push(warning("UNKNOWN_BOOLEAN", field, `${field} 的值「${value}」無法判斷，暫按否處理`));
  return false;
}

function error(codeValue, field, message) {
  return { severity: "ERROR", code: codeValue, field, message };
}

function warning(codeValue, field, message) {
  return { severity: "WARNING", code: codeValue, field, message };
}

function readLookupSheet(workbook, sheetName, columns) {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) throw new Error(`Workbook is missing required sheet: ${sheetName}`);
  const rows = [];
  for (let rowNo = 2; rowNo <= sheet.rowCount; rowNo += 1) {
    const values = columns.map((columnNo) => text(scalarCellValue(sheet.getCell(rowNo, columnNo))));
    if (values.some((value) => value !== null)) rows.push(values);
  }
  return rows;
}

function buildLookups(workbook) {
  const systems = new Map(readLookupSheet(workbook, "系統碼表", [1, 2, 3])
    .map(([systemCode, systemName, property]) => [code(systemCode), { systemName, property }]));
  const categories = new Map(readLookupSheet(workbook, "類別碼表", [1, 3, 4])
    .map(([systemCode, categoryCode, categoryName]) => [
      `${code(systemCode)}|${code(categoryCode)}`,
      { categoryName: usableLookupText(categoryName), rawCategoryName: categoryName },
    ]));
  const subsystems = new Map(readLookupSheet(workbook, "子系統清單", [1, 2])
    .map(([subsystemCode, subsystemName]) => [code(subsystemCode), subsystemName]));
  const units = new Set(readLookupSheet(workbook, "單位表", [1]).map(([unit]) => code(unit)));
  return { systems, categories, subsystems, units };
}

function validateHeaders(sheet) {
  const actual = MATERIAL_HEADERS.map((_, index) => text(scalarCellValue(sheet.getCell(1, index + 1))));
  const mismatches = MATERIAL_HEADERS.flatMap((expected, index) => (
    expected === actual[index] ? [] : [{ column: index + 1, expected, actual: actual[index] }]
  ));
  if (mismatches.length) {
    throw new Error(`Material workbook headers do not match: ${JSON.stringify(mismatches)}`);
  }
}

function normalizeMaterialRow(rawPayload, lookups) {
  const messages = [];
  const systemCode = code(rawPayload.system_code);
  const categoryCode = code(rawPayload.category_code);
  const sequenceText = text(rawPayload.sequence_no);
  const sequenceNo = sequenceText && /^\d+$/.test(sequenceText)
    ? sequenceText.padStart(4, "0")
    : sequenceText;
  const typeCode = code(rawPayload.type_code);
  const sourcePartNo = code(rawPayload.part_no);
  const computedPartNo = [systemCode, categoryCode, sequenceNo, typeCode].every(Boolean)
    ? `${systemCode}.${categoryCode}.${sequenceNo}.${typeCode}`
    : null;

  for (const [field, value] of Object.entries({
    system_code: systemCode,
    category_code: categoryCode,
    sequence_no: sequenceNo,
    type_code: typeCode,
    material_name: text(rawPayload.material_name),
    unit: code(rawPayload.unit),
  })) {
    if (!value) messages.push(error("REQUIRED", field, `${field} 為必填`));
  }
  if (sequenceNo && !/^\d{4}$/.test(sequenceNo)) {
    messages.push(error("INVALID_SEQUENCE", "sequence_no", "流水號必須是可格式化為 4 碼的數字"));
  }
  if (!sourcePartNo) {
    messages.push(error("REQUIRED", "part_no", "自動料號不可空白"));
  } else if (computedPartNo && sourcePartNo !== computedPartNo) {
    messages.push(error(
      "PART_NO_MISMATCH",
      "part_no",
      `料號 ${sourcePartNo} 與欄位計算結果 ${computedPartNo} 不一致`,
    ));
  }

  const system = systemCode ? lookups.systems.get(systemCode) : null;
  if (systemCode && !system) {
    messages.push(error("UNKNOWN_SYSTEM", "system_code", `系統碼 ${systemCode} 不在系統碼表`));
  }
  const category = systemCode && categoryCode
    ? lookups.categories.get(`${systemCode}|${categoryCode}`)
    : null;
  if (systemCode && categoryCode && !category) {
    messages.push(error("UNKNOWN_CATEGORY", "category_code", `類別 ${systemCode}/${categoryCode} 不在類別碼表`));
  }
  const normalizedUnit = code(rawPayload.unit);
  if (normalizedUnit && !lookups.units.has(normalizedUnit)) {
    messages.push(warning("UNKNOWN_UNIT", "unit", `單位 ${normalizedUnit} 不在單位表`));
  }

  const subsystemCode = code(rawPayload.source_subsystem_code);
  if (subsystemCode && !lookups.subsystems.has(subsystemCode)) {
    messages.push(warning("UNKNOWN_SUBSYSTEM", "source_subsystem_code", `子系統 ${subsystemCode} 不在子系統清單；僅保留來源值`));
  }
  const sourceSystemName = text(rawPayload.system_name);
  if (system?.systemName && sourceSystemName && system.systemName !== sourceSystemName) {
    messages.push(warning("SYSTEM_NAME_MISMATCH", "system_name", `系統名稱應為「${system.systemName}」`));
  }
  const sourceCategoryName = text(rawPayload.category_name);
  if (category && !category.categoryName) {
    messages.push(warning(
      "INVALID_CATEGORY_LOOKUP_NAME",
      "category_name",
      `類別 ${systemCode}/${categoryCode} 的碼表名稱無效，暫保留物料列名稱`,
    ));
  } else if (category?.categoryName && sourceCategoryName && category.categoryName !== sourceCategoryName) {
    messages.push(warning("CATEGORY_NAME_MISMATCH", "category_name", `類別名稱應為「${category.categoryName}」`));
  }

  let safetyLevel = text(rawPayload.safety_level);
  if (safetyLevel && !["1", "2", "3", "4", "未分類"].includes(safetyLevel)) {
    messages.push(warning("UNKNOWN_SAFETY_LEVEL", "safety_level", `安全等級「${safetyLevel}」不在允許值，暫不匯入`));
    safetyLevel = null;
  }

  const normalized = {
    part_no: computedPartNo || sourcePartNo,
    material_name: text(rawPayload.material_name),
    spec: text(rawPayload.spec),
    unit: normalizedUnit,
    system_code: systemCode,
    system_name: system?.systemName || sourceSystemName,
    category_code: categoryCode,
    category_name: category?.categoryName || sourceCategoryName,
    sequence_no: sequenceNo,
    type_code: typeCode,
    material_property: system?.property || text(rawPayload.material_property),
    repairable: booleanValue(rawPayload.repairable, "repairable", messages),
    is_serialized: booleanValue(rawPayload.is_serialized, "is_serialized", messages),
    safety_level: safetyLevel,
    lead_time_days: decimal(rawPayload.lead_time_days, "lead_time_days", messages, { integer: true, minimum: 0 }),
    reorder_point: decimal(rawPayload.reorder_point, "reorder_point", messages, { minimum: 0 }) ?? 0,
    estimated_unit_price: decimal(rawPayload.estimated_unit_price, "estimated_unit_price", messages, { minimum: 0 }),
    market_available: booleanValue(
      rawPayload.market_available,
      "market_available",
      messages,
      { blankValue: null },
    ),
    review_note: text(rawPayload.review_note),
    source_subsystem_code: subsystemCode,
    source_subsystem_name: subsystemCode ? lookups.subsystems.get(subsystemCode) || null : null,
  };
  return {
    naturalKey: normalized.part_no || null,
    normalized,
    messages,
    validationStatus: messages.some((item) => item.severity === "ERROR")
      ? "INVALID"
      : messages.some((item) => item.severity === "WARNING") ? "WARNING" : "VALID",
  };
}

async function readMaterialWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet(MATERIAL_SHEET);
  if (!sheet) throw new Error(`Workbook is missing required sheet: ${MATERIAL_SHEET}`);
  validateHeaders(sheet);
  const lookups = buildLookups(workbook);
  const rows = [];
  for (let rowNo = 2; rowNo <= sheet.rowCount; rowNo += 1) {
    const rawPayload = Object.fromEntries(SOURCE_FIELDS.map((field, index) => [
      field,
      scalarCellValue(sheet.getCell(rowNo, index + 1)),
    ]));
    if (Object.values(rawPayload).every((value) => text(value) === null)) continue;
    rows.push({ sourceRowNo: rowNo, rawPayload, ...normalizeMaterialRow(rawPayload, lookups) });
  }
  markDuplicateNaturalKeys(rows);
  return { rows, lookups };
}

function markDuplicateNaturalKeys(rows) {
  const occurrences = new Map();
  for (const row of rows) {
    if (!row.naturalKey) continue;
    const matchingRows = occurrences.get(row.naturalKey) || [];
    matchingRows.push(row);
    occurrences.set(row.naturalKey, matchingRows);
  }
  for (const [naturalKey, matchingRows] of occurrences) {
    if (matchingRows.length < 2) continue;
    for (const row of matchingRows) {
      row.messages.push(error(
        "DUPLICATE_NATURAL_KEY",
        "part_no",
        `料號 ${naturalKey} 在來源列 ${matchingRows.map((item) => item.sourceRowNo).join(", ")} 重複`,
      ));
      row.validationStatus = "INVALID";
    }
  }
  return rows;
}

function comparable(field, value) {
  if (value === null || value === undefined || value === "") return null;
  if (["repairable", "is_serialized", "market_available"].includes(field)) return Boolean(value);
  if (["lead_time_days", "reorder_point", "estimated_unit_price"].includes(field)) return Number(value);
  return String(value).trim();
}

function compareMaterialRow(row, existingByPartNo) {
  if (row.validationStatus === "INVALID") {
    return { proposedAction: "REJECT", targetId: null, differences: [] };
  }
  const existing = row.naturalKey ? existingByPartNo.get(row.naturalKey) : null;
  if (!existing) return { proposedAction: "INSERT", targetId: null, differences: [] };
  const differences = OWNED_MATERIAL_FIELDS.flatMap((field) => {
    const sourceValue = comparable(field, row.normalized[field]);
    const targetValue = comparable(field, existing[field]);
    return sourceValue === targetValue ? [] : [{ field, sourceValue, targetValue }];
  });
  return {
    proposedAction: differences.length ? "UPDATE" : "NO_CHANGE",
    targetId: existing.id,
    differences,
  };
}

module.exports = {
  MATERIAL_HEADERS,
  OWNED_MATERIAL_FIELDS,
  SOURCE_FIELDS,
  compareMaterialRow,
  markDuplicateNaturalKeys,
  normalizeMaterialRow,
  readMaterialWorkbook,
};
