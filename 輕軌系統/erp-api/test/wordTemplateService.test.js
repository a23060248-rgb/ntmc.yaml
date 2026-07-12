const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildMappings,
  buildPrintSnapshot,
  isInstrumentReadyForDate,
  transformValue,
  validateRequiredMappings,
} = require("../src/services/wordTemplateService");

test("Word mappings resolve nested snapshot fields and preserve target type", () => {
  const mappings = buildMappings(
    { workOrderNo: "P-1150710-D-TS-001", item: { date: "2026-07-10" } },
    [
      { word_target_type: "BOOKMARK", word_target: "WorkOrderNo", source_path: "workOrderNo" },
      { word_target_type: "PLACEHOLDER", word_target: "{{ROC_DATE}}", source_path: "item.date", transform_code: "ROC_DATE" },
    ]
  );
  assert.deepEqual(mappings, [
    { targetType: "BOOKMARK", target: "WorkOrderNo", value: "P-1150710-D-TS-001" },
    { targetType: "PLACEHOLDER", target: "{{ROC_DATE}}", value: "1150710" },
  ]);
});

test("required Word mappings report missing actual values", () => {
  const mappings = [
    { field_key: "train", source_path: "trainNo", is_required: true },
    { field_key: "remark", source_path: "remark", default_value: "N/A", is_required: true },
    { field_key: "optional", source_path: "optional", is_required: false },
  ];
  assert.deepEqual(validateRequiredMappings({ trainNo: "" }, mappings), ["train"]);
});

test("date transform keeps invalid legacy text instead of throwing", () => {
  assert.equal(transformValue("待確認", "DATE"), "待確認");
  assert.equal(transformValue(true, "CHECK"), "■");
  assert.equal(transformValue(false, "CHECK"), "□");
});

test("official Word date text keeps date-only values stable", () => {
  assert.equal(transformValue("2026-05-15", "ROC_DATE_TEXT"), "115年05月15日");
  assert.equal(transformValue("2026-05-15", "ROC_DATE"), "1150515");
});

test("official Word work-order number uses the fixed compact print format", () => {
  assert.equal(transformValue("P-1870108-D-TS-001", "COMPACT_WORK_ORDER_NO"), "P1870108001");
  assert.equal(transformValue("P1150515001", "COMPACT_WORK_ORDER_NO"), "P1150515001");
});

test("print snapshot uses planned dates before work and actual dates after completion", () => {
  const source = {
    planStartDate: "2026-05-15",
    actualWorkDate: "2026-05-16",
    actualStartAt: "2026-05-16T01:00:00.000Z",
    actualFinishAt: "2026-05-17T06:00:00.000Z",
  };
  assert.deepEqual(buildPrintSnapshot(source, "PRE_WORK").print, {
    stage: "PRE_WORK",
    startDate: "2026-05-15",
    finishDate: "2026-05-15",
  });
  assert.deepEqual(buildPrintSnapshot(source, "POST_COMPLETION").print, {
    stage: "POST_COMPLETION",
    startDate: source.actualStartAt,
    finishDate: source.actualFinishAt,
  });
});

test("print readiness accepts canonical and legacy available instrument statuses", () => {
  assert.equal(isInstrumentReadyForDate({ status: "AVAILABLE", calibration_due_date: "2026-12-31" }, "2026-05-15"), true);
  assert.equal(isInstrumentReadyForDate({ status: "可使用", calibration_due_date: "2026-12-31" }, "2026-05-15"), true);
  assert.equal(isInstrumentReadyForDate({ status: "AVAILABLE", calibration_due_date: "2026-05-14" }, "2026-05-15"), false);
  assert.equal(isInstrumentReadyForDate({ status: "SUSPENDED", calibration_due_date: "2026-12-31" }, "2026-05-15"), false);
});
