import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
function run(script, marker) {
  const child = spawnSync(process.execPath, [path.join(root, script)], {cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024});
  const line = child.stdout.split(/\r?\n/).find((item) => item.startsWith(`${marker} `));
  if (child.status !== 0 || !line) throw new Error(`${script} failed to emit ${marker}; exit=${child.status}.`);
  return JSON.parse(line.slice(marker.length + 1));
}
const production = run(".codex/tests/run-referenced-evidence-production.mjs", "REFERENCED_EVIDENCE_PRODUCTION");
const mutations = run(".codex/tests/run-referenced-evidence-mutations.mjs", "REFERENCED_EVIDENCE_MUTATION_RESULT");
await writeFile(path.join(taskDir, "production-path-after-fix.json"), json({schema_version:1,task_id:"GOV-PHASE1-CANDIDATE-REMEDIATION-13",finding_id:"B6EXT-CODE-TASK-LOCAL-SCHEMA-BYPASS-001",production_entrypoint:"validateTask",...production}), {encoding:"utf8",flag:"w"});
await writeFile(path.join(taskDir, "mutation-test-results.json"), json({schema_version:1,task_id:"GOV-PHASE1-CANDIDATE-REMEDIATION-13",...mutations}), {encoding:"utf8",flag:"w"});
console.log(JSON.stringify({production_cases:production.case_count,production_passed:production.passed,mutants:mutations.operator_count,mutants_killed:mutations.killed}));
