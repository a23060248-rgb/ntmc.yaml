const DAY_MS = 24 * 60 * 60 * 1000;
const HIGH_LEVELS = new Set(["3M", "6M", "1Y", "5Y/1Y"]);

function parseDate(value) {
  if (value instanceof Date) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function addMonths(date, months) {
  const result = new Date(date.getTime());
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}

function daysBetween(start, end) {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / DAY_MS);
}

function cycleMonthsForLevel(level) {
  return { "1M": 1, "3M": 3, "6M": 6, "1Y": 12, "5Y/1Y": 12 }[level] || 1;
}

function fixedCycleFromLevels(levels) {
  const cycles = [...new Set((levels || []).map(cycleMonthsForLevel))].sort((a, b) => a - b);
  return cycles[0] || 12;
}

function maintenanceDuration(level) {
  if (level === "1M") return 1;
  if (level === "1Y" || level === "5Y/1Y") return 3;
  return 2;
}

function priorityOf(item) {
  if (item.targetType === "VEHICLE" && HIGH_LEVELS.has(item.pmLevel)) return 0;
  if (item.targetType === "VEHICLE" && item.pmLevel === "1M") return 1;
  return 2;
}

function createCalendar(exceptions = []) {
  const overrides = new Map(exceptions.map((item) => {
    const parsed = parseDate(item.date || item.calendarDate);
    return parsed ? [formatDate(parsed), item.dayType] : null;
  }).filter(Boolean));
  return {
    isWorkday(date) {
      const key = formatDate(date);
      if (overrides.get(key) === "WORKDAY") return true;
      if (overrides.get(key) === "HOLIDAY") return false;
      const day = date.getUTCDay();
      return day !== 0 && day !== 6;
    },
  };
}

function workdaysBetween(calendar, start, end) {
  const rows = [];
  for (let cursor = parseDate(start); cursor <= parseDate(end); cursor = addDays(cursor, 1)) {
    if (calendar.isWorkday(cursor)) rows.push(cursor);
  }
  return rows;
}

function nextWorkdays(calendar, start, count, direction = 1, maxScan = 120) {
  const rows = [];
  let cursor = parseDate(start);
  for (let scanned = 0; scanned < maxScan && rows.length < count; scanned += 1) {
    cursor = addDays(cursor, direction);
    if (calendar.isWorkday(cursor)) rows.push(cursor);
  }
  return rows;
}

function createOccupancy() {
  const days = new Map();
  function get(date) {
    const key = typeof date === "string" ? date : formatDate(date);
    if (!days.has(key)) days.set(key, { vehicle: [], lathe: [], depot: [] });
    return days.get(key);
  }
  return { days, get };
}

function totalCount(day) {
  return day.vehicle.length + day.lathe.length + day.depot.length;
}

function vehicleKind(item, dayIndex) {
  if (item.pmLevel === "1M") return "MONTH";
  if (item.pmLevel === "3M" && dayIndex === 1) return "HIGH_SECOND";
  return "HIGH_EXCLUSIVE";
}

function vehiclePairAllowed(kinds) {
  if (kinds.length <= 1) return true;
  if (kinds.length > 2) return false;
  const values = [...kinds].sort().join("+");
  return ["MONTH+MONTH", "HIGH_SECOND+MONTH", "HIGH_SECOND+LATHE", "LATHE+MONTH"].includes(values);
}

function canPlaceVehicleBlock(occupancy, dates, item) {
  return dates.every((date, index) => {
    const day = occupancy.get(date);
    const kinds = [...day.vehicle.map((row) => row.kind), ...day.lathe.map(() => "LATHE"), vehicleKind(item, index)];
    return totalCount(day) < 3 && vehiclePairAllowed(kinds);
  });
}

function placeVehicleBlock(occupancy, dates, item) {
  dates.forEach((date, index) => occupancy.get(date).vehicle.push({ targetKey: item.targetKey, kind: vehicleKind(item, index) }));
}

function blockWorkdays(calendar, start, duration) {
  const rows = [parseDate(start)];
  let cursor = parseDate(start);
  while (rows.length < duration) {
    cursor = addDays(cursor, 1);
    if (calendar.isWorkday(cursor)) rows.push(cursor);
  }
  return rows;
}

function sortedCandidates(calendar, minDate, maxDate, dueDate, occupancy, item, duration) {
  return workdaysBetween(calendar, minDate, maxDate)
    .map((date) => {
      const block = blockWorkdays(calendar, date, duration);
      const pairBonus = block.some((value) => {
        const day = occupancy.get(value);
        return day.vehicle.length + day.lathe.length > 0;
      }) ? -100 : 0;
      return { date, block, score: Math.abs(daysBetween(dueDate, date)) * 10 + pairBonus + date.getTime() / 1e12 };
    })
    .filter((row) => canPlaceVehicleBlock(occupancy, row.block, item))
    .sort((a, b) => a.score - b.score);
}

function nearestForcedBlock(calendar, dueDate, occupancy, item, duration) {
  const candidates = workdaysBetween(calendar, addDays(dueDate, -90), addDays(dueDate, 90))
    .map((date) => ({ date, block: blockWorkdays(calendar, date, duration), distance: Math.abs(daysBetween(dueDate, date)) }))
    .sort((a, b) => a.distance - b.distance || a.date - b.date);
  const legalCapacity = candidates.find((row) => canPlaceVehicleBlock(occupancy, row.block, item));
  return legalCapacity ? { ...legalCapacity, capacityForced: false } : { ...candidates[0], capacityForced: true };
}

function canPlaceLathe(occupancy, date) {
  const day = occupancy.get(date);
  const kinds = [...day.vehicle.map((row) => row.kind), "LATHE"];
  return day.lathe.length === 0 && totalCount(day) < 3 && vehiclePairAllowed(kinds);
}

function placeLathePair(occupancy, dates, targetKey) {
  dates.forEach((date) => occupancy.get(date).lathe.push({ targetKey }));
}

function findLathePair(calendar, occupancy, maintenanceStart, maintenanceEnd) {
  const before = nextWorkdays(calendar, maintenanceStart, 30, -1);
  for (let index = 0; index + 1 < before.length; index += 1) {
    const pair = [before[index + 1], before[index]].sort((a, b) => a - b);
    if (pair.every((date) => canPlaceLathe(occupancy, date))) return { dates: pair, after: false, forced: false };
  }
  const after = nextWorkdays(calendar, maintenanceEnd, 30, 1);
  for (let index = 0; index + 1 < after.length; index += 1) {
    const pair = [after[index], after[index + 1]];
    if (pair.every((date) => canPlaceLathe(occupancy, date))) return { dates: pair, after: true, forced: false };
  }
  const forcedDates = before.slice(0, 2).sort((a, b) => a - b);
  return { dates: forcedDates, after: false, forced: true };
}

function scheduleVehicle(item, baseline, calendar, occupancy) {
  const due = addDays(baseline, 30);
  const min = addDays(baseline, 24);
  const max = addDays(baseline, 36);
  const duration = maintenanceDuration(item.pmLevel);
  const candidates = sortedCandidates(calendar, min, max, due, occupancy, item, duration);
  const reasons = [];
  let chosen;
  let forced = false;
  if (candidates.length) {
    chosen = candidates[0];
  } else {
    chosen = nearestForcedBlock(calendar, due, occupancy, item, duration);
    reasons.push("INTERVAL_OUT_OF_RANGE");
    if (chosen.capacityForced) reasons.push("CAPACITY_FORCED");
    forced = true;
  }
  placeVehicleBlock(occupancy, chosen.block, item);

  const output = {
    ...item,
    latestActualFinishDate: formatDate(baseline),
    plannedStartDate: formatDate(chosen.block[0]),
    plannedEndDate: formatDate(chosen.block[chosen.block.length - 1]),
    intervalDays: daysBetween(baseline, chosen.block[0]),
    isForced: forced,
    needsReview: reasons.length > 0,
    reviewReasons: reasons,
  };

  if (HIGH_LEVELS.has(item.pmLevel)) {
    const lathe = findLathePair(calendar, occupancy, chosen.block[0], chosen.block[chosen.block.length - 1]);
    if (lathe.dates.length === 2) {
      placeLathePair(occupancy, lathe.dates, item.targetKey);
      output.latheStartDate = formatDate(lathe.dates[0]);
      output.latheEndDate = formatDate(lathe.dates[1]);
    } else {
      output.reviewReasons.push("LATHE_NOT_SCHEDULED");
    }
    if (lathe.after) output.reviewReasons.push("LATHE_AFTER_MAINTENANCE");
    if (lathe.forced) output.reviewReasons.push("LATHE_CAPACITY_FORCED");
    output.needsReview = output.reviewReasons.length > 0;
    output.isForced = output.isForced || lathe.forced;
  }
  return output;
}

function canPlaceDepot(occupancy, date) {
  return totalCount(occupancy.get(date)) < 3;
}

function scheduleDepot(item, baseline, fixedCycleMonths, calendar, occupancy) {
  const due = addMonths(baseline, fixedCycleMonths);
  const cycleDays = Math.max(1, daysBetween(baseline, due));
  const min = addDays(baseline, Math.floor(cycleDays * 0.8));
  const max = addDays(baseline, Math.ceil(cycleDays * 1.2));
  const legal = workdaysBetween(calendar, min, max).filter((date) => canPlaceDepot(occupancy, date));
  const deferrable = item.deferToMonthEnd === true || item.targetName === "拉線車兼高空維修作業車";
  legal.sort((a, b) => deferrable ? b - a : Math.abs(daysBetween(due, a)) - Math.abs(daysBetween(due, b)) || a - b);
  const reasons = [];
  let chosen = legal[0];
  let forced = false;
  if (!chosen) {
    const candidates = workdaysBetween(calendar, addDays(due, -90), addDays(due, 90)).sort((a, b) => Math.abs(daysBetween(due, a)) - Math.abs(daysBetween(due, b)) || a - b);
    chosen = candidates.find((date) => canPlaceDepot(occupancy, date)) || candidates[0];
    reasons.push("EQUIPMENT_CYCLE_OUT_OF_RANGE");
    if (!canPlaceDepot(occupancy, chosen)) reasons.push("CAPACITY_FORCED");
    forced = true;
  }
  occupancy.get(chosen).depot.push({ targetKey: item.targetKey });
  return {
    ...item,
    fixedCycleMonths,
    latestActualFinishDate: formatDate(baseline),
    plannedStartDate: formatDate(chosen),
    plannedEndDate: formatDate(chosen),
    intervalDays: daysBetween(baseline, chosen),
    isForced: forced,
    needsReview: reasons.length > 0,
    reviewReasons: reasons,
  };
}

function normalizeItem(item) {
  return {
    ...item,
    targetType: item.targetType || "VEHICLE",
    targetKey: String(item.targetKey),
    targetName: item.targetName || String(item.targetKey),
    pmLevel: item.pmLevel || "1M",
    scheduleYear: Number(item.scheduleYear),
    scheduleMonth: Number(item.scheduleMonth),
  };
}

function generateSchedule(input) {
  const calendar = createCalendar(input.calendarExceptions || []);
  const occupancy = createOccupancy();
  const normalized = (input.items || []).map(normalizeItem);
  const levelMap = new Map();
  normalized.filter((item) => item.targetType === "DEPOT_EQUIPMENT").forEach((item) => {
    levelMap.set(item.targetKey, [...(levelMap.get(item.targetKey) || []), item.pmLevel]);
  });
  const lastFinish = new Map();
  normalized.forEach((item) => {
    if (item.latestActualFinishDate && !lastFinish.has(item.targetKey)) lastFinish.set(item.targetKey, parseDate(item.latestActualFinishDate));
  });

  const items = [...normalized].sort((a, b) =>
    a.scheduleYear - b.scheduleYear || a.scheduleMonth - b.scheduleMonth || priorityOf(a) - priorityOf(b) || a.targetKey.localeCompare(b.targetKey)
  );
  const output = [];
  for (const item of items) {
    const baseline = lastFinish.get(item.targetKey) || parseDate(item.latestActualFinishDate) || new Date(Date.UTC(item.scheduleYear, item.scheduleMonth - 2, 1));
    const scheduled = item.targetType === "DEPOT_EQUIPMENT"
      ? scheduleDepot(item, baseline, item.fixedCycleMonths || fixedCycleFromLevels(levelMap.get(item.targetKey)), calendar, occupancy)
      : scheduleVehicle(item, baseline, calendar, occupancy);
    lastFinish.set(item.targetKey, parseDate(scheduled.plannedEndDate));
    output.push(scheduled);
  }
  return { items: output, occupancy: Object.fromEntries(occupancy.days) };
}

module.exports = {
  HIGH_LEVELS,
  addDays,
  addMonths,
  createCalendar,
  daysBetween,
  fixedCycleFromLevels,
  formatDate,
  generateSchedule,
  maintenanceDuration,
  parseDate,
};
