import {readFile,writeFile} from "node:fs/promises";
import {spawn} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {safeExistingPath} from "../../scripts/lib/path-safety.mjs";
import {sha256} from "../../scripts/lib/governance/typed-proof.mjs";

const taskDir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(taskDir,"../../..");
const taskId="GOV-PHASE1-REMEDIATION-10";
const baseline=JSON.parse(await readFile(path.join(taskDir,"review-baseline-before.json"),"utf8"));
async function json(ref){return JSON.parse(await readFile(await safeExistingPath(root,ref),"utf8"));}
async function check(items){const mismatches=[];for(const item of items){const bytes=await readFile(await safeExistingPath(root,item.relative_path));const actual=sha256(bytes);if(actual!==item.sha256||bytes.length!==item.byte_size)mismatches.push({path:item.relative_path,expected_sha256:item.sha256,actual_sha256:actual,expected_byte_size:item.byte_size,actual_byte_size:bytes.length});}return mismatches;}
const a10Items=baseline.files.filter((item)=>item.artifact_type==="review-a10-formal");
const sessionBItems=baseline.files.filter((item)=>item.artifact_type==="session-b-frozen");
const migrationTask=baseline.files.filter((item)=>item.artifact_type==="migration-320-task");
const migrationExternal=baseline.files.filter((item)=>item.artifact_type==="migration-320-external-evidence");
const [a10Mismatch,sessionBMismatch,migrationTaskMismatch,migrationExternalMismatch]=await Promise.all([check(a10Items),check(sessionBItems),check(migrationTask),check(migrationExternal)]);
const a10=await json(".codex/tasks/GOV-PHASE1-L3-REVIEW-A10/session-a10-summary.json");
const sessionB=await json(".codex/tasks/GOV-PHASE1-SESSION-B-COMPATIBILITY-REVIEW/session-b-summary.json");
const m320Review=await json(".codex/tasks/GOV-M320-DRYRUN/review-findings.yaml");
const historicalResult=a10Mismatch.length===0&&sessionBMismatch.length===0&&a10.status==="ARCHIVED"&&a10.reviewer_set_outcome==="PASS"&&a10.bootstrap_candidate_review_gate==="GO"&&sessionB.status==="ARCHIVED"&&sessionB.session_b_outcome==="BLOCKER"&&sessionB.bootstrap_candidate_review_gate==="NO-GO";
const historical={schema_version:1,task_id:taskId,a10:{files_checked:a10Items.length,hash_mismatches:a10Mismatch,status:a10.status,reviewer_set_outcome:a10.reviewer_set_outcome,bootstrap_candidate_review_gate:a10.bootstrap_candidate_review_gate,unchanged:a10Mismatch.length===0},session_b:{files_checked:sessionBItems.length,hash_mismatches:sessionBMismatch,status:sessionB.status,outcome:sessionB.session_b_outcome,compatibility_gate:sessionB.bootstrap_candidate_review_gate,findings_remain_open:sessionB.session_b_outcome==="BLOCKER",unchanged:sessionBMismatch.length===0},remediation_closes_session_b_findings:false,session_b2_started:false,result:historicalResult?"PASS":"FAIL"};
await writeFile(path.join(taskDir,"historical-artifact-integrity.json"),`${JSON.stringify(historical,null,2)}\n`,{encoding:"utf8",flag:"wx"});

function runValidator(){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[".codex/scripts/validate-task.mjs","--task-id","GOV-M320-DRYRUN","--target-gate","migration-320-execution"],{cwd:root,windowsHide:true,stdio:["ignore","pipe","pipe"]});let stdout="",stderr="";child.stdout.on("data",(chunk)=>stdout+=chunk);child.stderr.on("data",(chunk)=>stderr+=chunk);child.on("error",reject);child.on("close",(exitCode)=>resolve({exitCode,stdout,stderr}));});}
const validator=await runValidator();
const resultLine=validator.stdout.split(/\r?\n/).find((line)=>line.startsWith("VALIDATE_TASK_RESULT "))??"";
const structural=/structural=VALID/.test(resultLine),reportedExit=Number(resultLine.match(/\bexit=(\d+)/)?.[1]??NaN),gateNoGo=/migration_320_execution=NO-GO/.test(resultLine);
const domainReview=(m320Review.reviews??[]).find((item)=>item.type==="railway-domain");
const migrationResult=migrationTaskMismatch.length===0&&migrationExternalMismatch.length===0&&migrationTask.length===13&&migrationExternal.length===5&&structural&&reportedExit===2&&validator.exitCode===2&&gateNoGo&&domainReview?.outcome==="NEEDS_HUMAN_DECISION";
const migration={schema_version:1,task_id:taskId,subject_task_id:"GOV-M320-DRYRUN",task_wrapper_files_checked:migrationTask.length,external_hash_bound_files_checked:migrationExternal.length,task_wrapper_hash_mismatches:migrationTaskMismatch,external_hash_mismatches:migrationExternalMismatch,domain_decision:domainReview?.outcome??null,execution_gate:gateNoGo?"NO-GO":"UNKNOWN",structural:structural?"VALID":"INVALID",validator_process_exit:validator.exitCode,validator_reported_exit:reportedExit,validator_result_line:resultLine,candidate_rules_promoted:false,business_rule_approved:false,result:migrationResult?"PASS":"FAIL"};
await writeFile(path.join(taskDir,"migration-320-integrity.json"),`${JSON.stringify(migration,null,2)}\n`,{encoding:"utf8",flag:"wx"});
const overall=historicalResult&&migrationResult;
console.log(JSON.stringify({result:overall?"PASS":"FAIL",a10_files:a10Items.length,session_b_files:sessionBItems.length,migration_task:migrationTask.length,migration_external:migrationExternal.length,m320_structural:migration.structural,m320_domain:migration.domain_decision,m320_gate:migration.execution_gate,m320_exit:reportedExit}));
if(!overall) process.exitCode=1;
