const DEFAULT_PRINT_STAGES = ["POST_COMPLETION"];

function resolvePath(object, sourcePath) {
  return String(sourcePath || "")
    .split(".")
    .filter(Boolean)
    .reduce((value, key) => value == null ? undefined : value[key], object);
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mappingConfig(mapping) {
  return asObject(mapping.config_json || mapping.configJson);
}

function printStages(mapping) {
  const configured = mappingConfig(mapping).printStages;
  if (!Array.isArray(configured) || configured.length === 0) return DEFAULT_PRINT_STAGES;
  return configured.map((stage) => String(stage).toUpperCase());
}

function appliesToPrintStage(mapping, printStage) {
  return printStages(mapping).includes(String(printStage || "").toUpperCase());
}

function normalizeCheck(item) {
  return {
    itemKey: item.item_no,
    itemNo: item.item_no,
    section: item.section,
    sectionSortOrder: item.section_sort_order,
    sortOrder: item.sort_order,
    description: item.item_description,
    checkType: item.check_type,
    standardValue: item.standard_value,
    unit: item.unit,
    minValue: item.min_value,
    maxValue: item.max_value,
    required: Boolean(item.is_required || item.requires_value),
    status: item.result_status,
    value: item.result_value,
    remark: item.result_remark,
    abnormalAction: item.abnormal_action,
    abnormalReason: item.abnormal_reason,
    linkedFaultWorkOrderNo: item.linked_fault_work_order_no,
  };
}

function normalizeMaterial(item) {
  return {
    itemKey: item.part_no,
    materialId: item.material_id,
    partNo: item.part_no,
    name: item.material_name,
    spec: item.spec,
    plannedQty: item.planned_qty,
    actualQty: item.actual_qty,
    unit: item.unit,
    note: item.note,
    conditionCode: item.condition_code,
  };
}

function normalizeAttachmentResult(item) {
  return {
    itemKey: item.item_key,
    status: item.result_status,
    value: asObject(item.result_value),
    remark: item.remark,
    abnormalAction: item.abnormal_action,
    abnormalReason: item.abnormal_reason,
    linkedFaultWorkOrderNo: item.linked_fault_work_order_no,
  };
}

function buildCompletionSnapshot(backfillData) {
  const item = backfillData?.item || {};
  const workOrder = backfillData?.workOrder || {};
  const savedSnapshot = asObject(workOrder.backfill_snapshot);
  const resultGroups = new Map();
  for (const result of backfillData?.attachmentResults || []) {
    const key = String(result.template_attachment_id);
    if (!resultGroups.has(key)) resultGroups.set(key, []);
    resultGroups.get(key).push(normalizeAttachmentResult(result));
  }

  const attachments = {};
  for (const attachment of backfillData?.attachments || []) {
    attachments[attachment.attachment_code] = {
      attachmentId: attachment.id,
      attachmentCode: attachment.attachment_code,
      attachmentName: attachment.attachment_name,
      attachmentType: attachment.attachment_type,
      schemaVersion: attachment.schema_version,
      schema: attachment.schema_json || {},
      required: Boolean(attachment.is_required),
      conditionCode: attachment.condition_code,
      renderStrategy: attachment.render_strategy,
      records: resultGroups.get(String(attachment.id)) || [],
    };
  }

  return {
    ...item,
    actualWorkDate: workOrder.actual_work_date ?? item.actualWorkDate,
    actualStartAt: workOrder.actual_start_at ?? item.actualStartAt,
    actualFinishAt: workOrder.actual_finish_at ?? item.actualFinishAt,
    maintenanceResult: workOrder.maintenance_result ?? "",
    actualMaterialNote: workOrder.actual_material_note ?? "",
    accumulatedMileage: savedSnapshot.accumulatedMileage ?? "",
    backfill: {
      status: item.backfillStatus,
      snapshot: savedSnapshot,
      accumulatedMileage: savedSnapshot.accumulatedMileage ?? "",
      checks: (backfillData?.checks || []).map(normalizeCheck),
      materials: (item.materials || []).map(normalizeMaterial),
      attachments,
      dangerPeriods: (backfillData?.dangerPeriods || []).map((period) => ({
        startAt: period.start_at,
        endAt: period.end_at,
        hours: period.hours,
        note: period.note,
      })),
    },
  };
}

function recordsFromValue(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.records)) return value.records;
  return [];
}

function normalizeBlockValue(blockType, value) {
  const type = String(blockType || "OTHER").toUpperCase();
  if (type === "CHECK_TABLE" || type === "MATERIAL_TABLE") {
    return { records: recordsFromValue(value) };
  }
  if (type === "SEAT_MAP" || type === "MEASUREMENT_TABLE") {
    const source = asObject(value);
    return {
      attachmentCode: source.attachmentCode,
      attachmentName: source.attachmentName,
      schemaVersion: source.schemaVersion,
      schema: asObject(source.schema),
      records: recordsFromValue(source),
    };
  }
  return value;
}

function missingBlockValue(value) {
  return value === undefined || value === null || value === "";
}

function validateRequiredBlockMappings(snapshot, mappings, printStage) {
  return mappings
    .filter((mapping) => mapping.is_required && appliesToPrintStage(mapping, printStage))
    .filter((mapping) => missingBlockValue(resolvePath(snapshot, mapping.source_path)))
    .map((mapping) => mapping.block_code);
}

function mappedCheckKeys(mapping) {
  const config = mappingConfig(mapping);
  const keys = new Set();
  for (const cell of Array.isArray(config.cellMappings) ? config.cellMappings : []) {
    if (cell?.itemKey) keys.add(String(cell.itemKey));
  }
  for (const aggregate of Array.isArray(config.aggregateMappings) ? config.aggregateMappings : []) {
    for (const itemKey of Array.isArray(aggregate?.itemKeys) ? aggregate.itemKeys : []) {
      if (itemKey) keys.add(String(itemKey));
    }
  }
  for (const composite of Array.isArray(config.compositeMappings) ? config.compositeMappings : []) {
    for (const field of Array.isArray(composite?.fields) ? composite.fields : []) {
      if (field?.itemKey) keys.add(String(field.itemKey));
    }
  }
  return keys;
}

function validateCheckMappingCoverage(checkItems, mappings) {
  const activeKeys = new Set(
    (checkItems || [])
      .filter((item) => item.is_active !== false)
      .map((item) => String(item.item_no || item.itemNo || "").trim())
      .filter(Boolean)
  );

  return (mappings || [])
    .filter((mapping) => String(mapping.block_type || mapping.blockType || "").toUpperCase() === "CHECK_TABLE")
    .filter((mapping) => mappingConfig(mapping).coverAllActiveChecks === true)
    .map((mapping) => {
      const mappedKeys = mappedCheckKeys(mapping);
      return {
        blockCode: mapping.block_code || mapping.blockCode,
        missing: [...activeKeys].filter((itemKey) => !mappedKeys.has(itemKey)).sort(),
        unknown: [...mappedKeys].filter((itemKey) => !activeKeys.has(itemKey)).sort(),
      };
    })
    .filter((issue) => issue.missing.length > 0 || issue.unknown.length > 0);
}

function buildBlockMappings(snapshot, mappings, printStage) {
  return mappings
    .filter((mapping) => appliesToPrintStage(mapping, printStage))
    .map((mapping) => ({
      kind: "BLOCK",
      blockCode: mapping.block_code,
      blockType: mapping.block_type,
      targetType: mapping.word_target_type,
      target: mapping.word_target,
      required: Boolean(mapping.is_required),
      config: mappingConfig(mapping),
      value: normalizeBlockValue(mapping.block_type, resolvePath(snapshot, mapping.source_path)),
    }));
}

module.exports = {
  appliesToPrintStage,
  buildBlockMappings,
  buildCompletionSnapshot,
  normalizeBlockValue,
  resolvePath,
  validateCheckMappingCoverage,
  validateRequiredBlockMappings,
};
