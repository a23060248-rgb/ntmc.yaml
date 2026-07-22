import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const integration = path.join(root, ".codex", "tests", "run-bootstrap-production-integration.mjs");
const child = spawnSync(process.execPath, [integration, "--referenced-evidence-matrix"], {cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024});
if (child.error) throw child.error;
const line = child.stdout.split(/\r?\n/).find((item) => item.startsWith("REFERENCED_EVIDENCE_MATRIX "));
if (!line) {
  process.stderr.write(child.stderr);
  throw new Error(`Referenced-evidence production matrix did not emit its formal payload; child exit=${child.status}.`);
}
const payload = JSON.parse(line.slice("REFERENCED_EVIDENCE_MATRIX ".length));
const case4 = payload.cases.find((item) => item.case_id === "CASE-04");
const valid = child.status === 0 && payload.case_count === 24 && payload.passed === 24 && payload.failed === 0 && payload.fixed_oracles === true && case4?.observed?.structural === "INVALID" && case4?.observed?.gate === "NO-GO" && case4?.observed?.exit_code === 1;
console.log(`REFERENCED_EVIDENCE_PRODUCTION ${JSON.stringify(payload)}`);
if (!valid) {
  process.stderr.write(child.stderr);
  process.exit(1);
}
