const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const { buildBlockMappings } = require("./wordBlockService");

function resolvePath(object, sourcePath) {
  return String(sourcePath || "").split(".").filter(Boolean).reduce((value, key) => value == null ? undefined : value[key], object);
}

function rocDate(value) {
  if (!value) return "";
  const parts = dateParts(value);
  if (!parts) return String(value);
  return `${parts.year - 1911}${String(parts.month).padStart(2, "0")}${String(parts.day).padStart(2, "0")}`;
}

function dateParts(value) {
  const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) return { year: Number(dateOnly[1]), month: Number(dateOnly[2]), day: Number(dateOnly[3]) };
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

function rocDateText(value) {
  const parts = dateParts(value);
  if (!parts) return value ? String(value) : "";
  return `${parts.year - 1911}年${String(parts.month).padStart(2, "0")}月${String(parts.day).padStart(2, "0")}日`;
}

function compactWorkOrderNo(value) {
  const source = String(value || "").trim();
  const match = source.match(/^([A-Z])-(\d{7})-[A-Z]+-[A-Z]+-(\d{3,})$/i);
  return match ? `${match[1].toUpperCase()}${match[2]}${match[3]}` : source;
}

function transformValue(value, code, fallback) {
  const source = value ?? fallback ?? "";
  if (code === "ROC_DATE") return rocDate(source);
  if (code === "ROC_DATE_TEXT") return rocDateText(source);
  if (code === "COMPACT_WORK_ORDER_NO") return compactWorkOrderNo(source);
  if (code === "DATE") {
    if (!source) return "";
    const date = new Date(source);
    return Number.isNaN(date.getTime()) ? String(source) : date.toISOString().slice(0, 10);
  }
  if (code === "UPPER") return String(source).toUpperCase();
  if (code === "CHECK") return source ? "■" : "□";
  if (Array.isArray(source)) return source.join("、");
  return String(source);
}

function buildPrintSnapshot(snapshot, printStage) {
  const completed = printStage === "POST_COMPLETION";
  const startDate = completed
    ? (snapshot.actualStartAt || snapshot.actualWorkDate || snapshot.planStartDate)
    : snapshot.planStartDate;
  const finishDate = completed
    ? (snapshot.actualFinishAt || snapshot.actualWorkDate || snapshot.planStartDate)
    : snapshot.planStartDate;
  return {
    ...snapshot,
    print: { stage: printStage, startDate, finishDate },
  };
}

function isInstrumentReadyForDate(instrument, effectiveDate) {
  const status = String(instrument?.status || "").trim().toUpperCase();
  const available = status === "AVAILABLE" || instrument?.status === "可使用";
  const calibrationDate = String(instrument?.calibration_due_date || "").slice(0, 10);
  return available && Boolean(calibrationDate) && calibrationDate >= effectiveDate;
}

function buildMappings(snapshot, mappings) {
  return mappings.map((mapping) => ({
    targetType: mapping.word_target_type,
    target: mapping.word_target,
    value: transformValue(resolvePath(snapshot, mapping.source_path), mapping.transform_code, mapping.default_value),
  }));
}

function buildRendererMappings(snapshot, mappings, blockMappings, printStage) {
  return [
    ...buildMappings(snapshot, mappings),
    ...buildBlockMappings(snapshot, blockMappings || [], printStage),
  ];
}

function validateRequiredMappings(snapshot, mappings) {
  return mappings
    .filter((mapping) => mapping.is_required)
    .filter((mapping) => {
      const value = resolvePath(snapshot, mapping.source_path);
      const resolved = value ?? mapping.default_value;
      return resolved === undefined || resolved === null || resolved === "";
    })
    .map((mapping) => mapping.field_key);
}

async function sha256(filePath) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function safeName(value) {
  return String(value).replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_");
}

function runPowerShell(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", ...args], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(stderr.trim() || `Word renderer exited with code ${code}`)));
  });
}

async function renderWordTemplate({ template, mappings, blockMappings = [], snapshot, workOrderNo, printStage, jobId }) {
  if (process.platform !== "win32") throw new Error("Word template worker currently requires Windows and Microsoft Word");
  const templateRoot = process.env.WORD_TEMPLATE_ROOT || path.resolve(__dirname, "../../../word-templates");
  const outputRoot = process.env.WORD_OUTPUT_DIR || path.resolve(__dirname, "../../../generated/word");
  const rootPath = path.resolve(templateRoot);
  const templatePath = path.isAbsolute(template.storage_path) ? path.resolve(template.storage_path) : path.resolve(rootPath, template.storage_path);
  const relative = path.relative(rootPath, templatePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Word template path is outside WORD_TEMPLATE_ROOT");
  await fs.access(templatePath);
  if (template.file_hash) {
    const actualHash = await sha256(templatePath);
    if (actualHash.toLowerCase() !== String(template.file_hash).toLowerCase()) {
      throw new Error("Word template hash does not match the registered version");
    }
  }
  await fs.mkdir(outputRoot, { recursive: true });
  const extension = path.extname(template.source_file_name || templatePath).toLowerCase() === ".docx" ? ".docx" : ".doc";
  const outputFileName = safeName(`${workOrderNo}-${printStage}-${template.version_no}-${jobId}${extension}`);
  const outputPath = path.join(outputRoot, outputFileName);
  const mappingPath = path.join(outputRoot, `${jobId}.mappings.json`);
  await fs.writeFile(
    mappingPath,
    JSON.stringify(buildRendererMappings(snapshot, mappings, blockMappings, printStage), null, 2),
    "utf8"
  );
  try {
    await runPowerShell([
      "-File", path.resolve(__dirname, "../../scripts/render-word-template.ps1"),
      "-TemplatePath", templatePath,
      "-OutputPath", outputPath,
      "-MappingsPath", mappingPath,
    ]);
  } finally {
    await fs.unlink(mappingPath).catch(() => {});
  }
  return { outputFileName, outputPath, outputHash: await sha256(outputPath) };
}

module.exports = {
  buildMappings,
  buildPrintSnapshot,
  buildRendererMappings,
  isInstrumentReadyForDate,
  renderWordTemplate,
  transformValue,
  validateRequiredMappings,
};
