import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const EXACT_OUTPUT = "C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統/.codex/tasks/GOV-MAGP-SOURCE-SCOPE-AGGREGATION-R1/source-scope-review-aggregation-result.json";
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex").toUpperCase();
const jcs = (v) => {
  if (v === null || typeof v === "boolean" || typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number") { if (!Number.isFinite(v)) throw new TypeError("NON_FINITE_NUMBER"); return JSON.stringify(v); }
  if (Array.isArray(v)) return `[${v.map(jcs).join(",")}]`;
  if (typeof v === "object") return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${jcs(v[k])}`).join(",")}`;
  throw new TypeError("UNSUPPORTED_JCS_TYPE");
};

if (process.argv[2] === "--self-test") {
  const a = {z: 1, a: [true, null, "x"]};
  const b = {a: [true, null, "x"], z: 1};
  if (jcs(a) !== jcs(b) || sha(Buffer.from(jcs(a))) !== sha(Buffer.from(jcs(b)))) process.exit(1);
  process.stdout.write("PASS\n");
  process.exit(0);
}
if (process.argv[2] === "--negative-self-test") {
  try { jcs({bad: Number.NaN}); process.exit(1); } catch { process.stdout.write("PASS\n"); process.exit(0); }
}
const input = process.argv[2];
const output = process.argv[3];
if (!input || !output || output.replaceAll("\\", "/") !== EXACT_OUTPUT) throw new Error("EXACT_INPUT_AND_OUTPUT_REQUIRED");
const payloadCore = JSON.parse(fs.readFileSync(input, "utf8"));
if (!payloadCore || typeof payloadCore !== "object" || Array.isArray(payloadCore)) throw new Error("PAYLOAD_CORE_OBJECT_REQUIRED");
const wrapper = {payload_core: payloadCore, payload_core_sha256: sha(Buffer.from(jcs(payloadCore), "utf8"))};
const canonicalBytes = Buffer.from(jcs(wrapper), "utf8");
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, canonicalBytes);
const reread = fs.readFileSync(output);
if (!reread.equals(canonicalBytes)) throw new Error("CANONICAL_REREAD_MISMATCH");
const parsed = JSON.parse(reread.toString("utf8"));
if (Object.keys(parsed).sort().join(",") !== "payload_core,payload_core_sha256") throw new Error("TWO_FIELD_WRAPPER_REQUIRED");
if (parsed.payload_core_sha256 !== sha(Buffer.from(jcs(parsed.payload_core), "utf8"))) throw new Error("PAYLOAD_CORE_HASH_MISMATCH");
process.stdout.write(JSON.stringify({status:"PASS",output_sha256:sha(reread)}) + "\n");
