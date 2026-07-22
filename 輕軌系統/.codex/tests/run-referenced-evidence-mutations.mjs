import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const integration = path.join(root, ".codex", "tests", "run-bootstrap-production-integration.mjs");
const child = spawnSync(process.execPath, [integration, "--referenced-evidence-mutations"], {cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024});
if (child.error) throw child.error;
const line = child.stdout.split(/\r?\n/).find((item) => item.startsWith("REFERENCED_EVIDENCE_MUTATIONS "));
if (!line) {
  process.stderr.write(child.stderr);
  throw new Error(`Referenced-evidence mutation suite did not emit its formal payload; child exit=${child.status}.`);
}
const payload = JSON.parse(line.slice("REFERENCED_EVIDENCE_MUTATIONS ".length));
const valid = child.status === 0 && payload.operator_count === 8 && payload.killed === 8 && payload.survived === 0 && payload.operators.every((item) => item.killed === true);
console.log(`REFERENCED_EVIDENCE_MUTATION_RESULT ${JSON.stringify(payload)}`);
if (!valid) {
  process.stderr.write(child.stderr);
  process.exit(1);
}
