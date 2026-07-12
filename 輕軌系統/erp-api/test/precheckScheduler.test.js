const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedCycleFromLevels, generateSchedule } = require("../src/services/precheckScheduler");

test("vehicle maintenance stays in the legal 24-36 day window", () => {
  const result = generateSchedule({ items: [
    { targetType: "VEHICLE", targetKey: "101", pmLevel: "1M", scheduleYear: 2026, scheduleMonth: 6, latestActualFinishDate: "2026-05-01" },
    { targetType: "VEHICLE", targetKey: "101", pmLevel: "1M", scheduleYear: 2026, scheduleMonth: 7 },
  ] });
  assert.equal(result.items.length, 2);
  result.items.forEach((item) => assert.ok(item.intervalDays >= 24 && item.intervalDays <= 36));
});

test("high maintenance gets two lathe workdays before maintenance and can cross month", () => {
  const result = generateSchedule({ items: [
    { targetType: "VEHICLE", targetKey: "102", pmLevel: "3M", scheduleYear: 2026, scheduleMonth: 3, latestActualFinishDate: "2026-01-31" },
  ] });
  const item = result.items[0];
  assert.ok(item.latheStartDate);
  assert.ok(item.latheEndDate < item.plannedStartDate);
  assert.equal(new Set([item.latheStartDate, item.latheEndDate]).size, 2);
});

test("temporary holiday cascades the affected item without dropping it", () => {
  const base = { targetType: "VEHICLE", targetKey: "103", pmLevel: "1M", scheduleYear: 2026, scheduleMonth: 6, latestActualFinishDate: "2026-05-04" };
  const first = generateSchedule({ items: [base] }).items[0];
  const shifted = generateSchedule({ items: [base], calendarExceptions: [{ date: first.plannedStartDate, dayType: "HOLIDAY" }] }).items[0];
  assert.ok(shifted.plannedStartDate);
  assert.notEqual(shifted.plannedStartDate, first.plannedStartDate);
});

test("calendar accepts the Date shape previously returned by PostgreSQL", () => {
  const base = { targetType: "VEHICLE", targetKey: "104", pmLevel: "1M", scheduleYear: 2026, scheduleMonth: 6, latestActualFinishDate: "2026-05-04" };
  const first = generateSchedule({ items: [base] }).items[0];
  const shifted = generateSchedule({
    items: [base],
    calendarExceptions: [{ date: new Date(`${first.plannedStartDate}T00:00:00.000Z`), dayType: "HOLIDAY" }]
  }).items[0];
  assert.notEqual(shifted.plannedStartDate, first.plannedStartDate);
});

test("depot equipment uses the shortest annual cycle", () => {
  assert.equal(fixedCycleFromLevels(["3M", "3M", "1Y"]), 3);
  const result = generateSchedule({ items: [
    { targetType: "DEPOT_EQUIPMENT", targetKey: "WASH", targetName: "自動洗車設備", pmLevel: "3M", scheduleYear: 2026, scheduleMonth: 6, latestActualFinishDate: "2026-03-02" },
    { targetType: "DEPOT_EQUIPMENT", targetKey: "WASH", targetName: "自動洗車設備", pmLevel: "1Y", scheduleYear: 2026, scheduleMonth: 9 },
  ] });
  assert.equal(result.items[0].fixedCycleMonths, 3);
  assert.equal(result.items[1].fixedCycleMonths, 3);
});

test("impossible capacity still produces every schedule item with review reasons", () => {
  const items = Array.from({ length: 30 }, (_, index) => ({
    targetType: "VEHICLE",
    targetKey: `T${String(index + 1).padStart(2, "0")}`,
    pmLevel: "3M",
    scheduleYear: 2026,
    scheduleMonth: 6,
    latestActualFinishDate: "2026-05-01",
  }));
  const result = generateSchedule({ items });
  assert.equal(result.items.length, items.length);
  assert.ok(result.items.every((item) => item.plannedStartDate));
  assert.ok(result.items.some((item) => item.needsReview));
});
