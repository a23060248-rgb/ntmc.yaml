const VALID_RESULT_STATUSES = new Set(["正常", "異常", "N/A", "未填"]);

function valuePresent(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function evaluateCheckStatus(item, result) {
  if (!VALID_RESULT_STATUSES.has(result.resultStatus)) throw new Error("invalid result status");
  if (result.resultStatus === "N/A") return "N/A";
  const hasValue = valuePresent(result.resultValue);
  const numeric = hasValue ? Number(result.resultValue) : null;
  if (hasValue && Number.isFinite(numeric)) {
    if (item.min_value !== null && item.min_value !== undefined && numeric < Number(item.min_value)) return "異常";
    if (item.max_value !== null && item.max_value !== undefined && numeric > Number(item.max_value)) return "異常";
  }
  return result.resultStatus || (hasValue ? "正常" : item.default_status || "未填");
}

function evaluateAttachmentStatus(attachment, result) {
  if (!VALID_RESULT_STATUSES.has(result.resultStatus)) throw new Error("invalid result status");
  if (result.resultStatus === "N/A") return "N/A";
  if (attachment.attachment_type !== "MEASUREMENT_TABLE") return result.resultStatus;

  const values = result.resultValue || {};
  let incomplete = false;
  let abnormal = result.resultStatus === "異常";
  for (const field of attachment.schema_json?.fields || []) {
    const value = values[field.key];
    if (!valuePresent(value)) {
      if (field.required) incomplete = true;
      continue;
    }
    if (field.type === "status") {
      if (String(value).trim() === "異常") abnormal = true;
      continue;
    }
    if (field.min !== undefined || field.max !== undefined) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) throw new Error(`invalid numeric attachment value: ${field.key}`);
      if (field.min !== undefined && numeric < Number(field.min)) abnormal = true;
      if (field.max !== undefined && numeric > Number(field.max)) abnormal = true;
    }
  }
  if (abnormal) return "異常";
  if (incomplete) return "未填";
  return "正常";
}

function missingCheckResults(items) {
  return items.filter((item) => {
    const statusMissing = !item.result_id || item.result_status === "未填";
    if (item.check_type === "checkbox") return statusMissing;
    if (item.is_required || item.requires_value) {
      return statusMissing || (item.requires_value && !valuePresent(item.result_value));
    }
    return false;
  });
}

function expectedAttachmentKeys(attachment) {
  const schema = attachment.schema_json || {};
  if (attachment.attachment_type === "SEAT_MAP") {
    const keys = [];
    for (const module of schema.modules || []) {
      (module.rows || []).forEach((row, rowIndex) => {
        (row || []).forEach((seat, columnIndex) => {
          if (seat) keys.push(`${module.code}-R${rowIndex + 1}-C${columnIndex + 1}`);
        });
      });
    }
    return keys;
  }
  if (attachment.attachment_type === "MEASUREMENT_TABLE") {
    return (schema.points || []).map((point) => point.key);
  }
  return [];
}

function missingAttachmentResults(attachments, results) {
  const missing = [];
  for (const attachment of attachments) {
    const expected = expectedAttachmentKeys(attachment);
    const byKey = new Map(results.filter((result) => result.template_attachment_id === attachment.id).map((result) => [result.item_key, result]));
    for (const key of expected) {
      const result = byKey.get(key);
      if (!result || result.result_status === "未填") {
        missing.push({ attachment: attachment.attachment_name, itemKey: key, reason: "未回填" });
        continue;
      }
      if (attachment.attachment_type === "MEASUREMENT_TABLE") {
        const requiredFields = (attachment.schema_json?.fields || []).filter((field) => field.required).map((field) => field.key);
        const values = result.result_value || {};
        const emptyFields = requiredFields.filter((field) => !valuePresent(values[field]));
        if (emptyFields.length) missing.push({ attachment: attachment.attachment_name, itemKey: key, reason: `缺少 ${emptyFields.join(", ")}` });
      }
    }
  }
  return missing;
}

module.exports = {
  evaluateAttachmentStatus,
  evaluateCheckStatus,
  expectedAttachmentKeys,
  missingAttachmentResults,
  missingCheckResults,
  valuePresent,
};
