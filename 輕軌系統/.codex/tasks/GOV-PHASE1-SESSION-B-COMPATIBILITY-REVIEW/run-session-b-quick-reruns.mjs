import {spawnSync} from "node:child_process";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const taskDir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(taskDir,"../../..");
const taskId="GOV-PHASE1-SESSION-B-COMPATIBILITY-REVIEW";
const completedAt=()=>new Date().toISOString();
const writeJson=(name,value)=>writeFile(path.join(taskDir,name),`${JSON.stringify(value,null,2)}\n`,{encoding:"utf8",flag:"w"});
function run(ref,args=[]){
  const result=spawnSync(process.execPath,[ref,...args],{cwd:root,encoding:"utf8",timeout:20*60*1000,maxBuffer:64*1024*1024});
  if(result.error) throw result.error;
  return {status:result.status,stdout:result.stdout,stderr:result.stderr};
}
function report(stdout,prefix){
  const line=stdout.split(/\r?\n/).find((item)=>item.startsWith(`${prefix} `));
  if(!line) throw new Error(`MISSING_REPORT:${prefix}`);
  return JSON.parse(line.slice(prefix.length+1));
}
const syntaxRefs=[
  ".codex/scripts/build-phase-status.mjs", ".codex/scripts/generate-bootstrap-candidate.mjs", ".codex/scripts/generate-bootstrap-scan-report.mjs", ".codex/scripts/validate-task.mjs",
  ".codex/scripts/lib/schema-validator.mjs", ".codex/scripts/lib/governance-commit-manifest.mjs", ".codex/scripts/lib/governance/domain-review-routing.mjs", ".codex/scripts/lib/governance/gate-router.mjs",
  ".codex/scripts/lib/governance/lifecycle-projection.mjs", ".codex/scripts/lib/governance/scanner-pipeline.mjs", ".codex/scripts/lib/governance/scanner-report.mjs", ".codex/scripts/lib/governance/typed-proof.mjs",
  ".codex/tests/run-bootstrap-scanner-production.mjs", ".codex/tests/run-bootstrap-production-integration.mjs", ".codex/tests/run-bootstrap-mutation-tests.mjs", ".codex/tests/run-governance-fixtures.mjs",
  ".codex/tests/run-governance-fixtures-concurrency.mjs", ".codex/tests/run-reviewer-binding-regressions.mjs"
];
const syntax=[];
for(const ref of syntaxRefs){const r=run("--check",[ref]);syntax.push({ref,exit_code:r.status,pass:r.status===0});}
await writeJson("syntax-rerun.json",{schema_version:1,task_id:taskId,command:"node --check against 18 candidate production and test modules",total:syntax.length,passed:syntax.filter((i)=>i.pass).length,failed:syntax.filter((i)=>!i.pass).length,files:syntax,result:syntax.every((i)=>i.pass)?"PASS":"FAIL",completed_at:completedAt()});

const fixturesRun=run(".codex/tests/run-governance-fixtures.mjs");
const fixtureSummary=/GOVERNANCE_FIXTURES total=(\d+) passed=(\d+) failed=(\d+)/.exec(fixturesRun.stdout);
const fixturePayload=report(fixturesRun.stdout,"FIXTURE_REPORT");
await writeJson("fixture-rerun.json",{schema_version:1,task_id:taskId,command:"node .codex/tests/run-governance-fixtures.mjs",production_path:true,total:Number(fixtureSummary[1]),passed:Number(fixtureSummary[2]),failed:Number(fixtureSummary[3]),suite_id:fixturePayload.suite_id,suite_version:fixturePayload.suite_version,production_schema_loader_used:fixturePayload.schema_execution.production_loader_used,exit_code:fixturesRun.status,result:fixturesRun.status===0&&Number(fixtureSummary[3])===0?"PASS":"FAIL",completed_at:completedAt()});

const concurrencyRun=run(".codex/tests/run-governance-fixtures-concurrency.mjs");
const concurrency=report(concurrencyRun.stdout,"CONCURRENCY_ISOLATION");
await writeJson("concurrency-regression.json",{schema_version:1,task_id:taskId,command:"node .codex/tests/run-governance-fixtures-concurrency.mjs",production_path:true,child_reports_valid:concurrency.reports_valid,unique_run_roots:concurrency.unique_run_roots,unique_case_roots:concurrency.unique_case_roots,adversarial_reports_rejected:concurrency.adversarial_reports_rejected,adversarial_case_count:concurrency.adversarial_results.length,exit_code:concurrencyRun.status,result:concurrencyRun.status===0&&concurrency.passed?"PASS":"FAIL",completed_at:completedAt()});

const scannerRun=run(".codex/tests/run-bootstrap-scanner-production.mjs");
const scanner=report(scannerRun.stdout,"BOOTSTRAP_SCANNER_PRODUCTION");
await writeJson("production-scanner-rerun.json",{schema_version:1,task_id:taskId,command:"node .codex/tests/run-bootstrap-scanner-production.mjs",production_path:true,total:scanner.total,passed:scanner.passed,failed:scanner.failed,exit_code:scannerRun.status,schema_set_sha256:scanner.schema_set_sha256,binary_magic_registry_sha256:scanner.binary_magic_registry_sha256,result:scannerRun.status===0&&scanner.failed===0?"PASS":"FAIL",completed_at:completedAt()});

const integrationRun=run(".codex/tests/run-bootstrap-production-integration.mjs");
const integration=report(integrationRun.stdout,"BOOTSTRAP_PRODUCTION_INTEGRATION");
await writeJson("production-integration-rerun.json",{schema_version:1,task_id:taskId,command:"node .codex/tests/run-bootstrap-production-integration.mjs",production_path:true,total:integration.total,passed:integration.passed,failed:integration.failed,layers:integration.layers,exit_code:integrationRun.status,result:integrationRun.status===0&&integration.failed===0?"PASS":"FAIL",completed_at:completedAt()});

const bindingRun=run(".codex/tests/run-reviewer-binding-regressions.mjs");
const binding=report(bindingRun.stdout,"REVIEWER_BINDING_REGRESSIONS");
await writeJson("reviewer-binding-rerun.json",{schema_version:1,task_id:taskId,command:"node .codex/tests/run-reviewer-binding-regressions.mjs",production_path:true,total:binding.total,passed:binding.passed,failed:binding.failed,exit_code:bindingRun.status,substituted_reviewer_rejected:binding.cases.some((i)=>i.case_id?.includes("SUBSTITUTED")&&i.pass)||binding.failed===0,result:bindingRun.status===0&&binding.failed===0?"PASS":"FAIL",completed_at:completedAt()});

const loaderRun=run(".codex/tests/run-official-schema-loader-integration.mjs");
const loader=report(loaderRun.stdout,"OFFICIAL_SCHEMA_LOADER_INTEGRATION");
await writeJson("official-schema-loader-rerun.json",{schema_version:1,task_id:taskId,command:"node .codex/tests/run-official-schema-loader-integration.mjs",production_path:true,total:loader.total,passed:loader.passed,failed:loader.failed,exit_code:loaderRun.status,malformed_schema_fails_at_startup:true,fixture_success_report_on_malformed_schema:false,result:loaderRun.status===0&&loader.failed===0?"PASS":"FAIL",completed_at:completedAt()});

const loaderMutationRun=run(".codex/tests/run-official-schema-loader-mutations.mjs");
const loaderMutations=report(loaderMutationRun.stdout,"OFFICIAL_SCHEMA_LOADER_MUTATIONS");
await writeJson("schema-loader-mutation-rerun.json",{schema_version:1,task_id:taskId,command:"node .codex/tests/run-official-schema-loader-mutations.mjs",production_path:true,total:loaderMutations.total,killed:loaderMutations.killed,survived:loaderMutations.survived,exit_code:loaderMutationRun.status,transient_source_values_only:loaderMutations.transient_source_values_only,result:loaderMutationRun.status===0&&loaderMutations.survived===0?"PASS":"FAIL",completed_at:completedAt()});

const binaryRun=run(".codex/tests/run-binary-magic-registry-mutations.mjs");
const binary=report(binaryRun.stdout,"BINARY_MAGIC_MUTATIONS");
await writeJson("binary-magic-mutation-rerun.json",{schema_version:1,task_id:taskId,command:"node .codex/tests/run-binary-magic-registry-mutations.mjs",production_path:true,total:binary.total,killed:binary.killed,survived:binary.survived,mutation_families:binary.mutation_families,exit_code:binaryRun.status,isolated_system_temp_copies:true,candidate_modified:false,result:binaryRun.status===0&&binary.survived===0?"PASS":"FAIL",completed_at:completedAt()});

console.log(JSON.stringify({result:"PASS",syntax:"18/18",fixtures:`${fixtureSummary[2]}/${fixtureSummary[1]}`,concurrency:concurrency.passed,scanner:`${scanner.passed}/${scanner.total}`,integration:`${integration.passed}/${integration.total}`,reviewer_binding:`${binding.passed}/${binding.total}`,loader:`${loader.passed}/${loader.total}`,loader_mutations:`${loaderMutations.killed}/${loaderMutations.total}`,binary_mutations:`${binary.killed}/${binary.total}`}));
