const REVIEWABLE_ISSUE_CODES = new Set([
  "INVALID_CATEGORY_LOOKUP_NAME",
  "UNKNOWN_CATEGORY",
  "UNKNOWN_UNIT",
]);

function issueKey(message, normalized) {
  if (message.code === "UNKNOWN_UNIT") return normalized.unit || "(blank)";
  if (["UNKNOWN_CATEGORY", "INVALID_CATEGORY_LOOKUP_NAME"].includes(message.code)) {
    return `${normalized.system_code || "?"}|${normalized.category_code || "?"}`;
  }
  return message.field || message.code;
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))]
    .sort((left, right) => String(left).localeCompare(String(right)));
}

function proposedResolution(code, key, canonicalValues) {
  if (code === "UNKNOWN_UNIT") {
    const canonicalAgreement = canonicalValues.length === 1 && canonicalValues[0] === key;
    return {
      action: canonicalAgreement ? "ADD_UNIT_LOOKUP" : "MAP_OR_ADD_UNIT",
      source_value: key,
      proposed_value: canonicalAgreement ? key : null,
      evidence_level: canonicalAgreement ? "CANONICAL_AGREES" : "NEEDS_OWNER_DECISION",
      auto_apply: false,
    };
  }
  const [systemCode, categoryCode] = key.split("|");
  if (code === "INVALID_CATEGORY_LOOKUP_NAME") {
    return {
      action: "REPAIR_CATEGORY_LOOKUP_NAME",
      system_code: systemCode,
      category_code: categoryCode,
      proposed_name: canonicalValues.length === 1 ? canonicalValues[0] : null,
      evidence_level: canonicalValues.length === 1 ? "CANONICAL_CANDIDATE" : "NEEDS_OWNER_DECISION",
      auto_apply: false,
    };
  }
  return {
    action: "ADD_CATEGORY_OR_CORRECT_SOURCE",
    system_code: systemCode,
    category_code: categoryCode,
    proposed_name: canonicalValues.length === 1 ? canonicalValues[0] : null,
    evidence_level: canonicalValues.length === 1 ? "CANONICAL_CANDIDATE" : "NEEDS_OWNER_DECISION",
    auto_apply: false,
  };
}

function buildMaterialIssueGroups(stagedRows, canonicalRows) {
  const canonicalByPartNo = new Map(canonicalRows.map((row) => [String(row.part_no).toUpperCase(), row]));
  const groups = new Map();
  for (const row of stagedRows) {
    const normalized = row.normalized_payload || row.normalizedPayload || {};
    const messages = row.validation_messages || row.validationMessages || [];
    for (const message of messages) {
      if (!REVIEWABLE_ISSUE_CODES.has(message.code)) continue;
      const key = issueKey(message, normalized);
      const groupId = `${message.code}|${key}`;
      const group = groups.get(groupId) || {
        issueCode: message.code,
        issueKey: key,
        rows: [],
        sourceValues: [],
        canonicalValues: [],
      };
      const canonical = row.natural_key ? canonicalByPartNo.get(String(row.natural_key).toUpperCase()) : null;
      group.rows.push({
        sourceRowNo: row.source_row_no ?? row.sourceRowNo,
        partNo: row.natural_key ?? row.naturalKey,
        materialName: normalized.material_name || null,
        message: message.message,
      });
      group.sourceValues.push(message.code === "UNKNOWN_UNIT" ? normalized.unit : normalized.category_name);
      group.canonicalValues.push(message.code === "UNKNOWN_UNIT" ? canonical?.unit : canonical?.category_name);
      groups.set(groupId, group);
    }
  }
  return [...groups.values()].map((group) => {
    const sourceValues = unique(group.sourceValues);
    const canonicalValues = unique(group.canonicalValues);
    return {
      issueCode: group.issueCode,
      issueKey: group.issueKey,
      affectedRows: group.rows.length,
      evidence: {
        source_values: sourceValues,
        canonical_values: canonicalValues,
        canonical_agreement_rows: group.rows.filter((row) => {
          const canonical = canonicalByPartNo.get(String(row.partNo || "").toUpperCase());
          if (!canonical) return false;
          return group.issueCode === "UNKNOWN_UNIT"
            ? canonical.unit === group.issueKey
            : canonical.category_name && sourceValues.includes(canonical.category_name);
        }).length,
        examples: group.rows.slice(0, 5),
      },
      proposedResolution: proposedResolution(group.issueCode, group.issueKey, canonicalValues),
    };
  }).sort((left, right) => (
    left.issueCode.localeCompare(right.issueCode) || left.issueKey.localeCompare(right.issueKey)
  ));
}

module.exports = { REVIEWABLE_ISSUE_CODES, buildMaterialIssueGroups, issueKey };
