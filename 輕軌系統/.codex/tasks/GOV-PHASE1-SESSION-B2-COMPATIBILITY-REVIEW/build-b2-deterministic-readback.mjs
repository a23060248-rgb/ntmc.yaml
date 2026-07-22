import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {sha256} from "../../scripts/lib/governance/typed-proof.mjs";

const taskDir=path.dirname(fileURLToPath(import.meta.url));
const taskId="GOV-PHASE1-SESSION-B2-COMPATIBILITY-REVIEW";
async function load(name){const bytes=await readFile(path.join(taskDir,name));return {name,bytes,json:JSON.parse(bytes.toString("utf8")),sha256:sha256(bytes)};}
const specs=[
  ["syntax-rerun.json",(v)=>v.result==="PASS"&&v.total===18&&v.passed===18&&v.failed===0],
  ["fixture-rerun.json",(v)=>v.result==="PASS"&&v.total===68&&v.passed===68&&v.failed===0&&v.production_schema_loader_used===true],
  ["concurrency-regression.json",(v)=>v.result==="PASS"&&v.child_reports_valid===true&&v.unique_run_roots===true&&v.unique_case_roots===true&&v.adversarial_reports_rejected===true],
  ["production-scanner-rerun.json",(v)=>v.result==="PASS"&&v.total===72&&v.passed===72&&v.failed===0],
  ["production-integration-rerun.json",(v)=>v.result==="PASS"&&v.total===48&&v.passed===48&&v.failed===0],
  ["production-mutation-rerun.json",(v)=>v.result==="PASS"&&v.expected_total===31&&v.actual_total===31&&v.killed===31&&v.survived===0&&v.duplicate_mutation_ids.length===0&&v.timeouts===0],
  ["reviewer-binding-rerun.json",(v)=>v.result==="PASS"&&v.total===14&&v.passed===14&&v.failed===0&&v.substituted_reviewer_rejected===true],
  ["official-schema-loader-rerun.json",(v)=>v.result==="PASS"&&v.total===11&&v.passed===11&&v.failed===0&&v.malformed_schema_fails_at_startup===true],
  ["schema-loader-mutation-rerun.json",(v)=>v.result==="PASS"&&v.total===6&&v.killed===6&&v.survived===0],
  ["binary-magic-mutation-rerun.json",(v)=>v.result==="PASS"&&v.total===45&&v.killed===45&&v.survived===0&&v.candidate_modified===false],
  ["remediation-10-chain-test-rerun.json",(v)=>v.result==="PASS"&&v.total===20&&v.passed===20&&v.failed===0&&v.suites.length===3],
  ["pre-review-freeze-verification.json",(v)=>v.result==="PASS"&&v.frozen_input_count===9&&v.actual_allowed_file_count===145&&v.required_chain_node_count===8&&v.forbidden_entries.length===0&&v.duplicate_paths.length===0],
  ["reviewer-assignment-verification.json",(v)=>v.result==="PASS"&&v.assignment_count===5&&v.unique_assignment_ids===true],
  ["gate-replay-verification.json",(v)=>v.result==="PASS"&&v.bootstrap_candidate_review.status==="GO"&&v.bootstrap_human_commit.status==="NO-GO"&&v.migration_320_execution.status==="NO-GO"],
  ["schema-template-workflow-matrix.json",(v)=>v.result==="PASS"&&v.production_schema_loader==="loadAndCompileGovernanceSchemas"&&v.schema_count===15&&v.declared_schema_count===15],
  ["removed-capability-executable-scan.json",(v)=>v.result==="PASS"&&v.all_removed_capabilities_non_executable===true],
  ["historical-task-compatibility.json",(v)=>v.result==="PASS"&&v.historical_reviewer_outcomes_reinterpreted===false&&v.historical_blockers_rewritten_as_pass===false],
  ["migration-320-compatibility.json",(v)=>v.result==="PASS"&&v.domain_decision==="NEEDS_HUMAN_DECISION"&&v.execution_gate==="NO-GO"&&v.actual_maintenance_rule_approved===false],
  ["historical-artifact-integrity.json",(v)=>v.result==="PASS"&&v.expected_file_count===874&&v.actual_checked_file_count===874&&v.all_protected_bytes_unchanged===true&&v.candidate_file_count===103&&v.candidate_unchanged===true],
  ["candidate-manifest-verification.json",(v)=>v.result==="PASS"&&v.actual_file_count===103&&v.unique_path_count===103&&v.manifest_sha256==="29F4F947DEF79A633F63E28FA2444F4734D7E6BB9612B96154A302464255531D"&&v.included_file_set_sha256==="739DAC633946266BCD28A71BE236D3748C57550AB1749A29C4F5E59421F993CB"]
];
const checks=[];
for(const [name,verify] of specs){const item=await load(name);let pass=false,error=null;try{pass=verify(item.json)===true;}catch(reason){error=reason.message;}checks.push({evidence_ref:`.codex/tasks/${taskId}/${name}`,evidence_sha256:item.sha256,byte_size:item.bytes.length,result:pass?"PASS":"FAIL",error});}
const payload={schema_version:1,task_id:taskId,evidence_type:"independent_qa_deterministic_readback_input",raw_evidence_count:checks.length,raw_evidence_checks:checks,all_raw_evidence_pass:checks.every((item)=>item.result==="PASS"),candidate_manifest_file_count:103,protected_baseline_file_count:874,product_tests_run:false,database_operations_run:false,git_commands_run:false,result:checks.every((item)=>item.result==="PASS")?"PASS":"FAIL",completed_at:new Date().toISOString()};
await writeFile(path.join(taskDir,"deterministic-readback-summary.json"),`${JSON.stringify(payload,null,2)}\n`,{encoding:"utf8",flag:"w"});
console.log(JSON.stringify({result:payload.result,raw_evidence_count:checks.length,passed:checks.filter((item)=>item.result==="PASS").length,failed:checks.filter((item)=>item.result!=="PASS").length}));
if(payload.result!=="PASS")process.exit(1);
