const test = require("node:test");
const assert = require("node:assert/strict");
const {
  appliesToPrintStage,
  buildBlockMappings,
  buildCompletionSnapshot,
  validateCheckMappingCoverage,
  validateRequiredBlockMappings,
} = require("../src/services/wordBlockService");
const { buildRendererMappings } = require("../src/services/wordTemplateService");

function completedBackfill() {
  return {
    item: {
      workOrderNo: "P-1150713-D-TS-001",
      backfillStatus: "COMPLETED",
      materials: [{
        material_id: "material-1",
        part_no: "MAT-001",
        material_name: "Test material",
        spec: "10 ml",
        planned_qty: 2,
        actual_qty: 1,
        unit: "bottle",
        note: "used on site",
        condition_code: "NORMAL",
      }],
    },
    workOrder: {
      actual_work_date: "2026-07-13",
      actual_start_at: "2026-07-13T09:00:00+08:00",
      actual_finish_at: "2026-07-13T16:00:00+08:00",
      maintenance_result: "完工測試",
      actual_material_note: "實際耗用一件",
      backfill_snapshot: { accumulatedMileage: "123456" },
    },
    checks: [{
      item_no: "A-01",
      section: "Body",
      section_sort_order: 1,
      sort_order: 1,
      item_description: "Visual check",
      check_type: "checkbox",
      standard_value: "normal",
      unit: null,
      min_value: null,
      max_value: null,
      is_required: true,
      result_status: "NORMAL",
      result_value: "",
      result_remark: "ok",
      abnormal_action: null,
      abnormal_reason: null,
      linked_fault_work_order_no: null,
    }],
    attachments: [{
      id: "attachment-seat",
      attachment_code: "P1-SEAT",
      attachment_name: "Seat map",
      attachment_type: "SEAT_MAP",
      schema_version: 2,
      schema_json: { seats: [{ key: "M1-R1-C1" }] },
      is_required: true,
      condition_code: "P1",
      render_strategy: "WORD_OVERLAY",
    }],
    attachmentResults: [{
      template_attachment_id: "attachment-seat",
      item_key: "M1-R1-C1",
      result_status: "ABNORMAL",
      result_value: { markedX: true },
      remark: "seat damaged",
      abnormal_action: "CREATE_C",
      abnormal_reason: "crack",
      linked_fault_work_order_no: "C-1150713-D-TS-001",
    }],
    dangerPeriods: [{ start_at: "2026-07-13T10:00:00+08:00", end_at: "2026-07-13T10:30:00+08:00", hours: 0.5, note: "test" }],
  };
}

test("completion snapshot keeps checks, actual materials, attachments, and danger periods together", () => {
  const snapshot = buildCompletionSnapshot(completedBackfill());
  assert.equal(snapshot.backfill.status, "COMPLETED");
  assert.equal(snapshot.backfill.checks[0].itemNo, "A-01");
  assert.equal(snapshot.backfill.materials[0].actualQty, 1);
  assert.equal(snapshot.backfill.attachments["P1-SEAT"].records[0].value.markedX, true);
  assert.equal(snapshot.accumulatedMileage, "123456");
  assert.equal(snapshot.backfill.accumulatedMileage, "123456");
  assert.equal(snapshot.maintenanceResult, "完工測試");
  assert.equal(snapshot.backfill.dangerPeriods[0].hours, 0.5);
});

test("dynamic Word blocks default to post-completion and keep renderer metadata", () => {
  const snapshot = buildCompletionSnapshot(completedBackfill());
  const mappings = [{
    block_code: "P1-SEAT",
    source_path: "backfill.attachments.P1-SEAT",
    block_type: "SEAT_MAP",
    word_target_type: "SHAPE_COORDINATES",
    word_target: "SEAT_MAP",
    config_json: { coordinates: { "M1-R1-C1": { left: 10, top: 20 } } },
    is_required: true,
  }];
  assert.equal(appliesToPrintStage(mappings[0], "PRE_WORK"), false);
  assert.equal(buildBlockMappings(snapshot, mappings, "PRE_WORK").length, 0);
  const post = buildBlockMappings(snapshot, mappings, "POST_COMPLETION");
  assert.equal(post[0].kind, "BLOCK");
  assert.equal(post[0].value.records[0].itemKey, "M1-R1-C1");
  assert.deepEqual(post[0].config.coordinates["M1-R1-C1"], { left: 10, top: 20 });
});

test("required block validation only reports applicable missing sources", () => {
  const mappings = [
    { block_code: "CHECKS", source_path: "backfill.checks", is_required: true, config_json: { printStages: ["POST_COMPLETION"] } },
    { block_code: "PRE_ONLY", source_path: "missing.pre", is_required: true, config_json: { printStages: ["PRE_WORK"] } },
  ];
  assert.deepEqual(validateRequiredBlockMappings({ backfill: { checks: [] } }, mappings, "POST_COMPLETION"), []);
  assert.deepEqual(validateRequiredBlockMappings({}, mappings, "POST_COMPLETION"), ["CHECKS"]);
});

test("renderer payload combines scalar fields and dynamic blocks", () => {
  const snapshot = buildCompletionSnapshot(completedBackfill());
  const payload = buildRendererMappings(
    snapshot,
    [{ word_target_type: "BOOKMARK", word_target: "WORK_ORDER_NO", source_path: "workOrderNo" }],
    [{ block_code: "MATERIALS", source_path: "backfill.materials", block_type: "MATERIAL_TABLE", word_target_type: "TABLE", word_target: "3", is_required: true }],
    "POST_COMPLETION"
  );
  assert.equal(payload.length, 2);
  assert.equal(payload[0].value, "P-1150713-D-TS-001");
  assert.equal(payload[1].value.records[0].partNo, "MAT-001");
});

test("publish coverage catches active checks missing from the Word layout", () => {
  const checkItems = [
    { item_no: "A-01", is_active: true },
    { item_no: "M-01", is_active: true },
    { item_no: "OLD-01", is_active: false },
  ];
  const complete = [{
    block_code: "P1-CHECKS",
    block_type: "CHECK_TABLE",
    config_json: {
      coverAllActiveChecks: true,
      cellMappings: [{ itemKey: "A-01" }],
      aggregateMappings: [{ itemKeys: ["M-01"] }],
      compositeMappings: [{ fields: [{ itemKey: "M-01" }] }],
    },
  }];
  assert.deepEqual(validateCheckMappingCoverage(checkItems, complete), []);

  const mismatched = [{
    ...complete[0],
    config_json: {
      coverAllActiveChecks: true,
      cellMappings: [{ itemKey: "A-01" }, { itemKey: "UNKNOWN-01" }],
    },
  }];
  assert.deepEqual(validateCheckMappingCoverage(checkItems, mismatched), [{
    blockCode: "P1-CHECKS",
    missing: ["M-01"],
    unknown: ["UNKNOWN-01"],
  }]);
});
