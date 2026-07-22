import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const task = path.dirname(fileURLToPath(import.meta.url));
const read = async (name) => JSON.parse(await readFile(path.join(task, name), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex").toUpperCase();
function jcs(value) { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`; return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`).join(",")}}`; }

const readiness = await read("a11-r2-relaunch-readiness.json");
const validation = await read("validation-results.json");
const tests = await read("r2-contract-tests.json");
const packages = await read("package-integrity-report.json");
const envelopes = await read("launch-envelope-integrity-report.json");
const paths = await read("security-r2-launch-path-bijection.json");
const candidate = await read("candidate-integrity-comparison.json");
const history = await read("historical-artifact-integrity.json");
const transport = await read("manual-transport-attestation-r2.schema.json");
const preserved = await read("preserved-reviewer-payload-verification.json");
const checks = [
  ["readiness", readiness.launch_readiness === "READY_FOR_HUMAN_TO_LAUNCH_SECURITY_R2"],
  ["validation", validation.result === "PASS"],
  ["contract-tests", tests.total === 24 && tests.passed === 24 && tests.failed === 0],
  ["packages", packages.result === "PASS" && packages.packages.length === 2],
  ["envelopes", envelopes.result === "PASS" && envelopes.packages.length === 2],
  ["path-bijection", paths.result === "PASS" && paths.packages.length === 2],
  ["candidate", candidate.candidate_108_of_108_byte_identical === true],
  ["history", history.result === "PASS"],
  ["transport-v2", transport.required.length === 8 && transport.additionalProperties === false],
  ["preserved", preserved.result === "PASS" && preserved.payloads.length === 3],
  ["not-started", readiness.security_r2 === "NOT STARTED" && readiness.aggregator_r2 === "NOT STARTED"],
  ["no-git", readiness.git === "NOT USED"]
];
const failed = checks.filter(([, pass]) => !pass);
const artifact = { suite: "A11 R2 preparation output verification", total: checks.length, passed: checks.length - failed.length, failed: failed.length, checks: checks.map(([name, pass]) => ({ name, pass })), input_digest: sha256(Buffer.from(jcs({ readiness, validation, tests, packages, envelopes, paths, candidate, history, transport, preserved }), "utf8")) };
console.log(`A11_R2_OUTPUT_VERIFICATION ${JSON.stringify(artifact)}`);
process.exit(failed.length ? 1 : 0);
