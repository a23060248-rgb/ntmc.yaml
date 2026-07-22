import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const runner = path.join(projectRoot, ".codex", "tests", "run-bootstrap-production-integration.mjs");
const child = spawnSync(process.execPath, [runner], {cwd: projectRoot, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024});
const output = `${child.stdout ?? ""}\n${child.stderr ?? ""}`;
const marker = output.split(/\r?\n/).find((line) => line.startsWith("BOOTSTRAP_PRODUCTION_INTEGRATION "));
if (!marker) throw new Error(`REVIEWER_BINDING_REGRESSIONS missing production report: ${output.slice(-2000)}`);
const production = JSON.parse(marker.slice("BOOTSTRAP_PRODUCTION_INTEGRATION ".length));
const cases = production.results.filter((item) => item.case_id.startsWith("PROD-REVIEWER-")).sort((left, right) => left.case_id.localeCompare(right.case_id));
const expectedIds = Array.from({length: 14}, (_, index) => `PROD-REVIEWER-${String(index + 1).padStart(2, "0")}`);
const pass = child.status === 0 && cases.length === expectedIds.length && cases.every((item, index) => item.case_id === expectedIds[index] && item.pass);
for (const item of cases) console.log(`${item.pass ? "PASS" : "FAIL"} ${item.case_id} ${item.invariant}`);
console.log(`REVIEWER_BINDING_REGRESSIONS ${JSON.stringify({total: cases.length, passed: cases.filter((item) => item.pass).length, failed: cases.filter((item) => !item.pass).length, production_runner_exit: child.status, assurance: "procedural_role_and_assignment_binding", expected_case_ids: expectedIds, cases})}`);
process.exit(pass ? 0 : 1);
