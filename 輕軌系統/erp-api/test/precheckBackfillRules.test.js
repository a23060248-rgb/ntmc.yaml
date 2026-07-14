const test = require("node:test");
const assert = require("node:assert/strict");
const {
  evaluateAttachmentStatus,
  evaluateCheckStatus,
  expectedAttachmentKeys,
  missingAttachmentResults,
  missingCheckResults,
} = require("../src/services/precheckBackfillRules");

test("numeric check is automatically abnormal outside its range", () => {
  const item = { min_value: 6, max_value: 9, default_status: "未填" };
  assert.equal(evaluateCheckStatus(item, { resultStatus: "正常", resultValue: "5.9" }), "異常");
  assert.equal(evaluateCheckStatus(item, { resultStatus: "正常", resultValue: "7.2" }), "正常");
});

test("every checkbox and required measurement must be completed", () => {
  const missing = missingCheckResults([
    { item_no: "A-01", check_type: "checkbox", result_id: "1", result_status: "未填" },
    { item_no: "M-01", check_type: "value", is_required: true, requires_value: true, result_id: "2", result_status: "正常", result_value: "" },
    { item_no: "T-01", check_type: "text", is_required: false, result_status: "未填" },
  ]);
  assert.deepEqual(missing.map((item) => item.item_no), ["A-01", "M-01"]);
});

test("seat attachment keys follow the official M5 to M1 layout", () => {
  const keys = expectedAttachmentKeys({
    attachment_type: "SEAT_MAP",
    schema_json: { modules: [{ code: "M5", rows: [["P", "S", null], ["P", "S", null]] }] },
  });
  assert.deepEqual(keys, ["M5-R1-C1", "M5-R1-C2", "M5-R2-C1", "M5-R2-C2"]);
});

test("official M4 lower row keeps three standard and two priority seats", () => {
  const keys = expectedAttachmentKeys({
    attachment_type: "SEAT_MAP",
    schema_json: {
      modules: [{
        code: "M4",
        rows: [
          ["S", "S", null, null, null],
          [null, null, null, null, null],
          ["S", "S", "S", "P", "P"],
        ],
      }],
    },
  });
  assert.deepEqual(keys, [
    "M4-R1-C1", "M4-R1-C2",
    "M4-R3-C1", "M4-R3-C2", "M4-R3-C3", "M4-R3-C4", "M4-R3-C5",
  ]);
});

test("measurement attachments require every configured field", () => {
  const attachment = {
    id: "a1",
    attachment_name: "煞車量測",
    attachment_type: "MEASUREMENT_TABLE",
    schema_json: {
      points: [{ key: "M1-1" }],
      fields: [{ key: "airGapMm", required: true }, { key: "surfaceStatus", required: true }],
    },
  };
  assert.equal(missingAttachmentResults([attachment], [{ template_attachment_id: "a1", item_key: "M1-1", result_status: "正常", result_value: { airGapMm: 7 } }]).length, 1);
});

test("brake attachment values are evaluated by the API instead of trusting the client status", () => {
  const attachment = {
    attachment_type: "MEASUREMENT_TABLE",
    schema_json: {
      fields: [
        { key: "airGapMm", min: 6, max: 9, required: true },
        { key: "wearDistanceMm", required: true },
        { key: "surfaceStatus", type: "status", required: true },
      ],
    },
  };
  assert.equal(evaluateAttachmentStatus(attachment, {
    resultStatus: "正常",
    resultValue: { airGapMm: 5.9, wearDistanceMm: 8.1, surfaceStatus: "正常" },
  }), "異常");
  assert.equal(evaluateAttachmentStatus(attachment, {
    resultStatus: "正常",
    resultValue: { airGapMm: 7.2, wearDistanceMm: 8.1, surfaceStatus: "異常" },
  }), "異常");
  assert.equal(evaluateAttachmentStatus(attachment, {
    resultStatus: "正常",
    resultValue: { airGapMm: 7.2, wearDistanceMm: 8.1, surfaceStatus: "正常" },
  }), "正常");
});
