const fs = require("node:fs");
const path = require("node:path");

const systemRoot = path.resolve(__dirname, "../..");
const defaultInput = path.join(systemRoot, ".local-rehearsal", "word-qa", "p1-layout-detail.json");
const defaultOutput = path.join(systemRoot, "db-design", "templates", "p1-word-layout-1140826.json");

const sectionRows = new Map([
  [2, "車體配件"],
  [14, "內裝設備"],
  [42, "轉向架"],
  [58, "齒輪傳動裝置"],
  [67, "車輪與車軸"],
  [72, "電力／推進／輔助電力系統"],
  [87, "照明系統"],
  [95, "空調與通風系統"],
  [105, "輔助操作設備"],
  [116, "車門系統"],
  [126, "監控及安全裝置"],
  [152, "配電盤"],
  [155, "煞車系統"],
]);

const specialRows = new Map([
  [20, {
    items: [{ suffix: "DATE", label: "滅火器下次性能檢查日期", checkType: "text", standardValue: "有效日期" }],
    template: "下次性能檢查日期：{date}",
    fields: [{ suffix: "DATE", token: "date" }],
  }],
  [75, {
    items: [
      { suffix: "M1", label: "集電弓碳刷厚度 M1 端", checkType: "value", unit: "mm", minValue: 6, standardValue: "> 6 mm" },
      { suffix: "M5", label: "集電弓碳刷厚度 M5 端", checkType: "value", unit: "mm", minValue: 6, standardValue: "> 6 mm" },
    ],
    template: "碳刷M1端：{m1} mm、M5端：{m5} mm",
    fields: [{ suffix: "M1", token: "m1" }, { suffix: "M5", token: "m5" }],
  }],
  [76, {
    items: [{ suffix: "DIFF", label: "碳刷高低差", checkType: "value", unit: "mm", maxValue: 5, standardValue: "< 5 mm" }],
    template: "高低差：{difference} mm",
    fields: [{ suffix: "DIFF", token: "difference" }],
  }],
  [81, {
    items: [{ suffix: "INSULATION", label: "集電弓絕緣電阻", checkType: "value", unit: "KΩ", minValue: 1, standardValue: "> 1 KΩ" }],
    template: "絕緣電阻：{value} KΩ",
    fields: [{ suffix: "INSULATION", token: "value" }],
  }],
  [97, {
    items: [{ suffix: "FILTER-PASSENGER", label: "旅客區空調濾網處理方式", checkType: "text", standardValue: "N/A／水洗／更換" }],
    template: "處理方式：{value}",
    fields: [{ suffix: "FILTER-PASSENGER", token: "value" }],
  }],
  [98, {
    items: ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"].map((point) => ({
      suffix: `FAN-${point}`,
      label: `空調風扇溫度 ${point}`,
      checkType: "value",
      unit: "°C",
      maxValue: 80,
      standardValue: "≤ 80 °C",
    })),
    template: "A1：{a1} A2：{a2} A3：{a3} A4：{a4} B1：{b1} B2：{b2} B3：{b3} B4：{b4}",
    fields: ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"].map((point) => ({ suffix: `FAN-${point}`, token: point.toLowerCase() })),
  }],
  [100, {
    items: [{ suffix: "FILTER-CAB", label: "駕駛室空調濾網處理方式", checkType: "text", standardValue: "N/A／水洗／更換" }],
    template: "處理方式：{value}",
    fields: [{ suffix: "FILTER-CAB", token: "value" }],
  }],
]);

function cleanText(value) {
  return String(value || "").replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
}

function rowKey(row) {
  return `P1-R${String(row).padStart(3, "0")}`;
}

function seatCoordinate(pixelX, pixelY) {
  const left = 42.4 + (pixelX / 1691) * 523.5 - 5.5;
  const top = 219.75 + (pixelY / 264) * 81.75 - 5.5;
  return { left: Number(left.toFixed(2)), top: Number(top.toFixed(2)), width: 11, height: 11, fontSize: 10 };
}

function seatCoordinates() {
  const coordinates = {};
  const add = (module, row, column, x, y) => { coordinates[`${module}-R${row}-C${column}`] = seatCoordinate(x, y); };
  for (const [row, y] of [[1, 100], [2, 120], [3, 170], [4, 190]]) {
    [[1, 230.5], [2, 264.5], [4, 316], [5, 350]].forEach(([column, x]) => add("M5", row, column, x, y));
    [[1, 770.5], [2, 804.5], [4, 855.5], [5, 889.5]].forEach(([column, x]) => add("M3", row, column, x, y));
    [[1, 1309.5], [2, 1343.5], [4, 1395.5], [5, 1429.5]].forEach(([column, x]) => add("M1", row, column, x, y));
  }
  [[1, 472.5], [2, 493]].forEach(([column, x]) => add("M4", 1, column, x, 102.5));
  [[1, 472], [2, 494], [3, 515.5], [4, 537], [5, 558.5]].forEach(([column, x]) => add("M4", 3, column, x, 187.5));
  [[1, 1102.5], [2, 1123.5], [3, 1145], [4, 1167], [5, 1188]].forEach(([column, x]) => add("M2", 1, column, x, 102.5));
  [[4, 1168.5], [5, 1187]].forEach(([column, x]) => add("M2", 2, column, x, 187.5));
  return coordinates;
}

function buildProfile(layout) {
  const table = layout.tables.find((item) => Number(item.index) === 1);
  if (!table || Number(table.rows) !== 159) throw new Error("P1 main table must contain 159 rows");
  const descriptionCells = table.cells.filter((cell) => Number(cell.column) === 1);
  const checkItems = [];
  const cellMappings = [];
  const aggregateMappings = [];
  const compositeMappings = [];
  let section = "未分類";

  for (const cell of descriptionCells) {
    const row = Number(cell.row);
    const description = cleanText(cell.text);
    if (sectionRows.has(row)) {
      section = sectionRows.get(row);
      continue;
    }
    if (row < 3 || row === 159 || !description) continue;
    const special = specialRows.get(row);
    if (special) {
      const keys = special.items.map((item, index) => {
        const itemKey = `${rowKey(row)}-${item.suffix}`;
        checkItems.push({
          itemNo: itemKey,
          section,
          itemDescription: item.label,
          checkType: item.checkType,
          standardValue: item.standardValue || null,
          unit: item.unit || null,
          minValue: item.minValue ?? null,
          maxValue: item.maxValue ?? null,
          requiresValue: true,
          isRequired: true,
          sourceWordRow: row,
          sourcePage: Number(cell.page),
          sortOrder: row * 100 + index + 1,
        });
        return itemKey;
      });
      aggregateMappings.push({ itemKeys: keys, row, normalColumn: 2, abnormalColumn: 3, mark: "V", required: true });
      compositeMappings.push({
        row,
        column: 4,
        template: special.template,
        fields: special.fields.map((field) => ({ itemKey: `${rowKey(row)}-${field.suffix}`, source: "value", token: field.token, required: true })),
      });
      continue;
    }

    const itemKey = rowKey(row);
    checkItems.push({
      itemNo: itemKey,
      section,
      itemDescription: description,
      checkType: "checkbox",
      standardValue: "正常",
      unit: null,
      minValue: null,
      maxValue: null,
      requiresValue: false,
      isRequired: true,
      sourceWordRow: row,
      sourcePage: Number(cell.page),
      sortOrder: row * 100,
    });
    cellMappings.push(
      { itemKey, source: "status", row, column: 2, transform: "EQUALS_MARK", equals: "正常", trueValue: "V", falseValue: "", required: true },
      { itemKey, source: "status", row, column: 3, transform: "EQUALS_MARK", equals: "異常", trueValue: "V", falseValue: "", required: true }
    );
    const remarkCell = table.cells.find((candidate) => Number(candidate.row) === row && Number(candidate.column) === 4);
    if (remarkCell && !cleanText(remarkCell.text)) {
      cellMappings.push({ itemKey, source: "remark", row, column: 4, required: false });
    }
  }

  const brakeKeys = ["M1-1", "M2-2", "M3-3", "M4-4", "M5-5", "M5-6"];
  return {
    profileCode: "P1-WORD-1140826",
    pmCode: "P1",
    sourceDocument: "輕軌列車預防檢修檢查記錄表改(第一級)-4-FM-H110-ERS13001-6_1140826.doc",
    sourceDocumentSha256: "84A25CD70781B57488BED25C056CB3133C35001CB9969A2826571B5A29F227CD",
    preparedTemplate: "p1-prepared-1140826.docx",
    preparedPages: 8,
    generatedFromLayoutReport: true,
    reviewStatus: "REHEARSAL_REVIEW_REQUIRED",
    checkItems,
    blocks: [
      {
        blockCode: "P1-CHECKS",
        sourcePath: "backfill.checks",
        blockType: "CHECK_TABLE",
        wordTargetType: "TABLE",
        wordTarget: "1",
        isRequired: true,
        configJson: { printStages: ["POST_COMPLETION"], coverAllActiveChecks: true, cellMappings, aggregateMappings, compositeMappings },
      },
      {
        blockCode: "P1-SEAT",
        sourcePath: "backfill.attachments.P1-SEAT",
        blockType: "SEAT_MAP",
        wordTargetType: "SHAPE_COORDINATES",
        wordTarget: "13",
        isRequired: true,
        configJson: {
          printStages: ["POST_COMPLETION"],
          inlineShapeIndex: 13,
          coordinates: seatCoordinates(),
          summaryTable: { tableIndex: 2, row: 2, normalColumn: 2, abnormalColumn: 3, mark: "V" },
        },
      },
      {
        blockCode: "P1-MAG-BRAKE",
        sourcePath: "backfill.attachments.P1-MAG-BRAKE",
        blockType: "MEASUREMENT_TABLE",
        wordTargetType: "TABLE",
        wordTarget: "3",
        isRequired: true,
        configJson: {
          printStages: ["POST_COMPLETION"],
          cellMappings: brakeKeys.flatMap((itemKey, index) => [
            { itemKey, source: "value.airGapMm", row: 2, column: index + 2, required: true },
            { itemKey, source: "value.wearDistanceMm", row: 3, column: index + 2, required: true },
          ]),
        },
      },
      {
        blockCode: "P1-MILEAGE",
        sourcePath: "accumulatedMileage",
        blockType: "OTHER",
        wordTargetType: "TABLE",
        wordTarget: "1",
        isRequired: true,
        configJson: { printStages: ["POST_COMPLETION"], row: 159, column: 1, prefix: "累計行駛里程數：", suffix: "（Km）" },
      },
    ],
  };
}

function main() {
  const input = path.resolve(process.argv[2] || defaultInput);
  const output = path.resolve(process.argv[3] || defaultOutput);
  const layout = JSON.parse(fs.readFileSync(input, "utf8").replace(/^\uFEFF/, ""));
  const profile = buildProfile(layout);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, output, checks: profile.checkItems.length, blocks: profile.blocks.length }, null, 2));
}

if (require.main === module) main();

module.exports = { buildProfile, cleanText, rowKey, seatCoordinate, seatCoordinates };
