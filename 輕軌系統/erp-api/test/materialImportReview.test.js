const test = require("node:test");
const assert = require("node:assert/strict");

const { buildMaterialIssueGroups } = require("../src/services/materialImportReview");

test("groups repeated import warnings into one review decision", () => {
  const staged = [2, 3].map((sourceRowNo) => ({
    source_row_no: sourceRowNo,
    natural_key: `50.94.000${sourceRowNo}.LO`,
    normalized_payload: { unit: "CN", material_name: `物料${sourceRowNo}` },
    validation_messages: [{ code: "UNKNOWN_UNIT", message: "單位未登錄" }],
  }));
  const canonical = staged.map((row) => ({ part_no: row.natural_key, unit: "CN" }));
  const groups = buildMaterialIssueGroups(staged, canonical);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].affectedRows, 2);
  assert.equal(groups[0].proposedResolution.action, "ADD_UNIT_LOOKUP");
  assert.equal(groups[0].proposedResolution.auto_apply, false);
});

test("keeps missing category resolution pending without authoritative evidence", () => {
  const groups = buildMaterialIssueGroups([{
    source_row_no: 246,
    natural_key: "50.EV.0002.AM",
    normalized_payload: { system_code: "50", category_code: "EV", material_name: "攝影機" },
    validation_messages: [{ code: "UNKNOWN_CATEGORY", message: "類別不存在" }],
  }], [{ part_no: "50.EV.0002.AM", category_name: null }]);
  assert.equal(groups[0].issueKey, "50|EV");
  assert.equal(groups[0].proposedResolution.action, "ADD_CATEGORY_OR_CORRECT_SOURCE");
  assert.equal(groups[0].proposedResolution.proposed_name, null);
  assert.equal(groups[0].proposedResolution.evidence_level, "NEEDS_OWNER_DECISION");
});
