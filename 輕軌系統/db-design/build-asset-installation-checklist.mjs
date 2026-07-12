import fs from "node:fs";
import path from "node:path";

const [, , positionArg = "./vehicle-position-slots-tamhai.csv", outputArg = "./asset-installation-field-checklist-tamhai.csv"] = process.argv;

const cwd = process.cwd();
const positionPath = path.resolve(cwd, positionArg);
const outputPath = path.resolve(cwd, outputArg);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...body] = rows;
  return body
    .filter((items) => items.some((item) => item !== ""))
    .map((items) => Object.fromEntries(headers.map((header, index) => [header, items[index] ?? ""])));
}

function csvValue(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

const positionText = fs.readFileSync(positionPath, "utf8").replace(/^\uFEFF/, "");
const positions = parseCsv(positionText)
  .filter((position) => position.IsInstallable === "True")
  .sort((a, b) => {
    const train = Number(a.TrainNo) - Number(b.TrainNo);
    if (train) return train;
    const module = a.ModuleNo.localeCompare(b.ModuleNo, "zh-Hant");
    if (module) return module;
    return a.LocationId.localeCompare(b.LocationId, "zh-Hant");
  });

const typeName = {
  INDEPENDENT: "獨立件",
  ASSEMBLY: "總成",
  COMPONENT: "子件"
};

const headers = [
  "列號",
  "場站代碼",
  "對象代碼",
  "車號",
  "車廂模組",
  "坑位代碼",
  "坑位名稱",
  "坑位類型",
  "上層坑位代碼",
  "設備序號",
  "現場設備名稱",
  "裝用狀態",
  "盤點人",
  "盤點日期",
  "照片檔名或連結",
  "備註"
];

const outputRows = positions.map((position, index) => [
  index + 1,
  position.SiteCode,
  position.TargetCode,
  position.TrainNo,
  position.ModuleNo,
  position.LocationId,
  position.SlotName,
  typeName[position.SlotKind] ?? position.SlotKind,
  position.ParentLocationId,
  "",
  "",
  "",
  "",
  "",
  "",
  ""
]);

const output = [headers, ...outputRows]
  .map((row) => row.map(csvValue).join(","))
  .join("\r\n");

fs.writeFileSync(outputPath, `\uFEFF${output}\r\n`, "utf8");

const counts = outputRows.reduce((acc, row) => {
  const type = row[7];
  acc[type] = (acc[type] ?? 0) + 1;
  return acc;
}, {});

console.log(`exported: ${outputPath}`);
console.log(`rows: ${outputRows.length}`);
for (const key of Object.keys(counts).sort((a, b) => a.localeCompare(b, "zh-Hant"))) {
  console.log(`${key}: ${counts[key]}`);
}
