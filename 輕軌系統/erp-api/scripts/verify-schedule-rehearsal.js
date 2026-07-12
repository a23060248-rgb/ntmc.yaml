const assert = require("node:assert/strict");

const apiBase = process.env.REHEARSAL_API_URL || "http://127.0.0.1:3102/api";
const adminHeaders = {
  "content-type": "application/json",
  "x-user-role": "scheduler",
  "x-user-name": "Rehearsal Scheduler"
};

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { ...adminHeaders, ...(options.headers || {}) }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(`${options.method || "GET"} ${path} returned ${response.status}: ${body?.error?.message || text}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function expectStatus(path, options, expected) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { ...adminHeaders, ...(options.headers || {}) }
  });
  assert.equal(response.status, expected, `${options.method || "GET"} ${path}`);
}

function dateKey(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function daysBetween(start, end) {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000);
}

function addDays(key, days) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isWeekend(key) {
  const day = new Date(`${key}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function annualLevels() {
  return Object.fromEntries(Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    if (month === 12) return [String(month), "1Y"];
    if (month === 6) return [String(month), "6M"];
    if ([3, 9].includes(month)) return [String(month), "3M"];
    return [String(month), "1M"];
  }));
}

async function importYear(year, latestActualFinishDate) {
  const preview = await request("/precheck/imports/preview", {
    method: "POST",
    body: JSON.stringify({
      sourceFile: `rehearsal-24-month-${year}.json`,
      sourceYear: year,
      siteCode: "D",
      targetType: "VEHICLE",
      rows: [{
        trainNo: "101車",
        levels: annualLevels(),
        latestActualFinishDate
      }]
    })
  });
  assert.equal(preview.preview.errors.length, 0);
  assert.equal(preview.preview.rows.length, 12);
  return request(`/precheck/imports/${preview.batch.id}/apply`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

async function listYear(year) {
  return request(`/precheck/schedules?year=${year}&search=101&limit=100`);
}

async function main() {
  const startYear = 2170;
  await importYear(startYear, `${startYear - 1}-12-10`);
  await importYear(startYear + 1, `${startYear}-12-10`);

  const generated = await request("/precheck/schedules/generate", {
    method: "POST",
    body: JSON.stringify({ startDate: `${startYear}-01-01` })
  });
  assert.equal(generated.generated, 24, "24-month generator did not persist every item");

  const before = [...(await listYear(startYear)).items, ...(await listYear(startYear + 1)).items]
    .sort((a, b) => new Date(a.plannedStartDate) - new Date(b.plannedStartDate));
  assert.equal(before.length, 24);
  assert.equal(before.filter((item) => !item.plannedStartDate).length, 0, "a schedule item disappeared");

  for (const item of before) {
    const interval = daysBetween(item.latestActualFinishDate, item.plannedStartDate);
    assert.ok(interval >= 24 && interval <= 36, `${item.id} interval ${interval} is outside 24-36 days`);
    assert.equal(isWeekend(dateKey(item.plannedStartDate)), false, `${item.id} was auto-scheduled on a weekend`);
    if (["3M", "6M", "1Y", "5Y/1Y"].includes(item.pmLevel)) {
      assert.ok(item.latheStartDate && item.latheEndDate, `${item.pmLevel} has no lathe block`);
      assert.ok(new Date(item.latheEndDate) < new Date(item.plannedStartDate), `${item.pmLevel} lathe is not before maintenance`);
    }
  }

  const latheDays = before.flatMap((item) => [item.latheStartDate, item.latheEndDate].filter(Boolean).map(dateKey));
  assert.equal(new Set(latheDays).size, latheDays.length, "more than one lathe task occupies a day");

  const affected = before[0];
  const holiday = dateKey(affected.plannedStartDate);
  await request("/precheck/calendar-exceptions", {
    method: "POST",
    body: JSON.stringify({ date: holiday, dayType: "HOLIDAY", siteCode: "D", name: "Rehearsal temporary holiday", source: "REHEARSAL" })
  });
  const replanned = await request("/precheck/schedules/replan", {
    method: "POST",
    body: JSON.stringify({ startDate: `${startYear}-01-01`, reason: "Rehearsal temporary-holiday cascade" })
  });
  assert.equal(replanned.generated, 24);

  const after = [...(await listYear(startYear)).items, ...(await listYear(startYear + 1)).items];
  const affectedAfter = after.find((item) => item.id === affected.id);
  assert.notEqual(dateKey(affectedAfter.plannedStartDate), holiday, "holiday item did not move");
  assert.equal(after.some((item) => dateKey(item.plannedStartDate) === holiday), false, "automatic schedule still uses the holiday");
  assert.equal(after.length, 24, "holiday cascade dropped a schedule item");

  const manualTarget = [...after].sort((a, b) => new Date(b.plannedStartDate) - new Date(a.plannedStartDate))[0];
  const manualDate = addDays(dateKey(manualTarget.plannedStartDate), 1);
  await request(`/precheck/schedules/${manualTarget.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      plannedStartDate: manualDate,
      plannedEndDate: manualDate,
      reason: "Rehearsal manual override",
      isForced: true,
      needsReview: true,
      reviewReason: "REHEARSAL_MANUAL_OVERRIDE"
    })
  });
  const manualDetail = await request(`/precheck/schedules/${manualTarget.id}`);
  assert.equal(manualDetail.item.isManual, true);
  assert.ok(manualDetail.changes.some((change) => change.change_type === "MANUAL_RESCHEDULE"));

  await expectStatus("/precheck/schedules/generate", {
    method: "POST",
    headers: { "x-user-role": "technician" },
    body: JSON.stringify({ startDate: `${startYear}-01-01` })
  }, 403);

  console.log(JSON.stringify({
    ok: true,
    range: `${startYear}-${startYear + 1}`,
    scheduleItems: after.length,
    highLevelItems: after.filter((item) => item.pmLevel !== "1M").length,
    latheDays: new Set(latheDays).size,
    temporaryHoliday: holiday,
    movedTo: dateKey(affectedAfter.plannedStartDate),
    manualScheduleId: manualTarget.id,
    technicianGenerateStatus: 403
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
