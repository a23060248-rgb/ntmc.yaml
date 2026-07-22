import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const runRoot = await mkdtemp(path.join(os.tmpdir(), "ntmc-rem13-history-regression-"));
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
for (const ref of ["AGENTS.md", ".agents", ".codex", "docs"]) await cp(path.join(root, ref), path.join(runRoot, ref), {recursive:true});
const removals = [
  ".codex/tasks/GOV-PHASE1-REMEDIATION-10/contract-version-negative-tests.json",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-10/allowlist-negative-tests.json",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-10/candidate-chain-negative-tests.json",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-11/evidence-schema-negative-tests.json",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-11/security-allowlist-negative-tests.json",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-11/code-reviewer-scope-negative-tests.json",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-11/reviewer-capacity-negative-tests.json",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-11/pre-review-package-verification.json",
  ".codex/tasks/GOV-PHASE1-REMEDIATION-11/preparation-test-summary.json"
];
for (const ref of removals) await rm(path.join(runRoot, ...ref.split("/")), {force:true});
const suites = [
  ["REMEDIATION_10_CHAIN", ".codex/tasks/GOV-PHASE1-REMEDIATION-10/run-security-chain-tests.mjs", 20],
  ["REMEDIATION_11_PREPARATION", ".codex/tasks/GOV-PHASE1-REMEDIATION-11/run-preparation-tests.mjs", 30],
  ["REMEDIATION_12_PROTOCOL", ".codex/tasks/GOV-PHASE1-REMEDIATION-12/run-remediation-12-tests.mjs", 30]
];
const results = [];
for (const [suite, ref, expected] of suites) {
  const child = spawnSync(process.execPath, [path.join(runRoot, ...ref.split("/"))], {cwd:runRoot,encoding:"utf8",windowsHide:true,maxBuffer:16*1024*1024});
  const lines = child.stdout.trim().split(/\r?\n/).filter(Boolean);
  let payload = null;
  try { payload = JSON.parse(lines.at(-1)); } catch {}
  const total = payload?.total ?? null, passed = payload?.passed ?? null;
  const failed_cases = [];
  if (suite === "REMEDIATION_10_CHAIN") for (const name of ["contract-version-negative-tests.json","allowlist-negative-tests.json","candidate-chain-negative-tests.json"]) {
    try { const report=JSON.parse(await readFile(path.join(runRoot,".codex","tasks","GOV-PHASE1-REMEDIATION-10",name),"utf8")); failed_cases.push(...(report.cases??[]).filter((item)=>item.result!=="PASS").map((item)=>({report:name,...item}))); } catch {}
  }
  if (suite === "REMEDIATION_12_PROTOCOL") for (const name of ["scope-satisfiability-tests.json","task-local-schema-tests.json","reviewer-protocol-tests.json","deterministic-qa-contract-tests.json"]) {
    try { const report=JSON.parse(await readFile(path.join(runRoot,".codex","tasks","GOV-PHASE1-REMEDIATION-12",name),"utf8")); failed_cases.push(...(report.cases??[]).filter((item)=>item.result!=="PASS").map((item)=>({report:name,...item}))); } catch {}
  }
  results.push({suite,production_script:ref,executed_in_isolated_copy:true,source_tree_modified:false,exit_code:child.status,total,passed,failed:Number.isInteger(total)&&Number.isInteger(passed)?total-passed:null,expected_total:expected,result:child.status===0&&total===expected&&passed===expected?"PASS":"FAIL",failed_cases,stderr_tail:child.stderr.slice(-2000)});
}
const output = {schema_version:1,task_id:"GOV-PHASE1-CANDIDATE-REMEDIATION-13",historical_source_tree_unchanged:true,suites:results,total:results.reduce((sum,item)=>sum+(item.total??0),0),passed:results.reduce((sum,item)=>sum+(item.passed??0),0),failed:results.reduce((sum,item)=>sum+(item.failed??0),0),result:results.every((item)=>item.result==="PASS")?"PASS":"FAIL"};
await writeFile(path.join(taskDir,"historical-regression-copy-results.json"),json(output));
await rm(runRoot,{recursive:true,force:true});
console.log(JSON.stringify({result:output.result,suites:results.map((item)=>({suite:item.suite,result:item.result,total:item.total,passed:item.passed}))}));
if(output.result!=="PASS")process.exit(1);
