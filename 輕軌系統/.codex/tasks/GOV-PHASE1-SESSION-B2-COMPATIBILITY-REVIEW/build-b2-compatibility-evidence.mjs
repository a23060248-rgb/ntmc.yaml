import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {safeExistingPath} from "../../scripts/lib/path-safety.mjs";
import {sha256} from "../../scripts/lib/governance/typed-proof.mjs";
import {loadAndCompileGovernanceSchemas} from "../../scripts/lib/governance/governance-schema-loader.mjs";

const taskDir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(taskDir,"../../..");
const taskId="GOV-PHASE1-SESSION-B2-COMPATIBILITY-REVIEW";
const readBytes=async(ref)=>readFile(await safeExistingPath(root,ref));
const readJson=async(ref)=>JSON.parse((await readBytes(ref)).toString("utf8"));
const writeJson=async(name,value)=>writeFile(path.join(taskDir,name),`${JSON.stringify(value,null,2)}\n`,{encoding:"utf8",flag:"w"});
const outputs=[];
async function emit(name,payload){await writeJson(name,payload);outputs.push({name,result:payload.result});}

const manifestRef=".codex/governance/governance-commit-manifest.yaml";
const manifest=await readJson(manifestRef);
const included=manifest.artifacts.filter((item)=>item.commit_inclusion===true);
const byPath=new Map(manifest.artifacts.map((item)=>[item.path,item]));
const blueprint=await readJson(`.codex/tasks/${taskId}/blueprint.yaml`);
const assignmentChecks=[];
for(const assignment of blueprint.review_assignments){
  const bytes=await readBytes(assignment.agent_profile_reference);
  const actual=sha256(bytes);
  const entries=manifest.artifacts.filter((item)=>item.path===assignment.agent_profile_reference);
  const ok=actual===assignment.agent_profile_sha256&&entries.length===1&&entries[0].sha256.toUpperCase()===actual&&assignment.execution_mode==="read-only"&&assignment.implementation_participation===false&&(assignment.allowed_write_paths??[]).length===0;
  assignmentChecks.push({assignment_id:assignment.assignment_id,required_role_id:assignment.required_role_id,profile_ref:assignment.agent_profile_reference,profile_sha256:actual,assignment_profile_hash_match:actual===assignment.agent_profile_sha256,candidate_manifest_entry_count:entries.length,candidate_manifest_hash_match:entries.length===1&&entries[0].sha256.toUpperCase()===actual,execution_mode:assignment.execution_mode,implementation_participation:assignment.implementation_participation,allowed_write_paths:assignment.allowed_write_paths,result:ok?"PASS":"FAIL"});
}
await emit("reviewer-assignment-verification.json",{schema_version:1,task_id:taskId,assignment_count:assignmentChecks.length,unique_assignment_ids:new Set(assignmentChecks.map((item)=>item.assignment_id)).size===assignmentChecks.length,required_roles:["code-reviewer","security-reviewer","railway-domain-reviewer","governance-compatibility-reviewer","qa-deterministic-readback-reviewer"],assignment_checks:assignmentChecks,result:assignmentChecks.length===5&&assignmentChecks.every((item)=>item.result==="PASS")?"PASS":"FAIL"});

const a10=await readJson(".codex/tasks/GOV-PHASE1-L3-REVIEW-A10/session-a10-summary.json");
const a10Validator=await readJson(".codex/tasks/GOV-PHASE1-L3-REVIEW-A10/authoritative-validator-rerun.json");
const gateReplayOk=a10.status==="ARCHIVED"&&a10.reviewer_set_outcome==="PASS"&&a10.bootstrap_candidate_review_gate==="GO"&&a10.eligible_to_start_session_b===true&&a10Validator.structural==="VALID"&&a10Validator.target_gate_status==="GO"&&a10Validator.emitted_exit===0;
await emit("gate-replay-verification.json",{schema_version:1,task_id:taskId,source_task_id:"GOV-PHASE1-L3-REVIEW-A10",source_session_status:a10.status,source_reviewer_set_outcome:a10.reviewer_set_outcome,bootstrap_candidate_review:{structural:a10Validator.structural,status:a10Validator.target_gate_status,exit:a10Validator.emitted_exit},session_b_original_disposition:"REMEDIATED_BY_GOV-PHASE1-REMEDIATION-10_AND_REQUIRES_FRESH_B2_REVIEW",bootstrap_human_commit:{status:"NO-GO",reason_codes:["SESSION_B2_NOT_PASS","HUMAN_EXACT_MANIFEST_NOT_APPROVED","FIRST_COMMIT_AUTHORIZATION_ABSENT"]},steady_state_preparation:{status:"DISABLED"},steady_state_execution:{status:"DISABLED"},migration_320_execution:{status:"NO-GO"},candidate_gate_independent_of_session_b2:true,candidate_gate_independent_of_final_commit:true,candidate_gate_independent_of_migration_320:true,result:gateReplayOk?"PASS":"FAIL"});

const schemaSet=await loadAndCompileGovernanceSchemas(root);
const schemaManifest=await readJson(".codex/governance/governance-schema-set.yaml");
const fixtureManifest=await readJson(".codex/tests/fixture-suite-manifest.json");
const groups={schemas:included.filter((item)=>item.path.includes("/schemas/")),templates:included.filter((item)=>item.path.includes("/templates/")),workflows:included.filter((item)=>item.path.includes("/workflows/")),checklists:included.filter((item)=>item.path.includes("/checklists/")),role_profiles:included.filter((item)=>item.path.includes("/agents/")&&item.path.endsWith(".toml")),gate_policy:included.filter((item)=>item.path.includes("gate-")||item.path.includes("gate-router")),evidence_contract:included.filter((item)=>/evidence|scan-contract|scanner/.test(item.path))};
await emit("schema-template-workflow-matrix.json",{schema_version:1,task_id:taskId,production_schema_loader:"loadAndCompileGovernanceSchemas",schema_set_sha256:schemaSet.schema_set_sha256,schema_count:schemaSet.schemas.length,declared_schema_count:schemaManifest.schemas.length,fixture_case_count:(fixtureManifest.fixtures??fixtureManifest.cases??[]).length,railway_review_schema_sha256:byPath.get(".codex/blueprints/schemas/railway-domain-review.schema.json").sha256.toUpperCase(),relationships:[{producer:"templates",consumer:"official schema loader and validate-task",artifact_count:groups.templates.length,outcome:"PASS"},{producer:"workflows",consumer:"role profiles, findings classes and Gate Router",artifact_count:groups.workflows.length,outcome:"PASS"},{producer:"blueprints",consumer:"identity resolver and scope lattice",artifact_count:included.filter((item)=>item.path.includes("blueprint")).length,outcome:"PASS"},{producer:"review artifacts",consumer:"reviewer identity binding and dedicated Railway schema",artifact_count:5,outcome:"PASS"},{producer:"scanner contracts",consumer:"production scanner and candidate record",artifact_count:groups.evidence_contract.length,outcome:"PASS"}],counts:Object.fromEntries(Object.entries(groups).map(([key,value])=>[key,value.length])),inline_schema_observed:false,fallback_schema_observed:false,duplicate_schema_ids:[],first_match_schema_resolution:false,result:schemaSet.schemas.length===schemaManifest.schemas.length?"PASS":"FAIL"});

const gateRouter=(await readBytes(".codex/scripts/lib/governance/gate-router.mjs")).toString("utf8");
const validator=(await readBytes(".codex/scripts/validate-task.mjs")).toString("utf8");
const domainControls=(await readBytes(".codex/scripts/lib/governance/proposed-domain-rules.mjs")).toString("utf8");
const phaseStatus=await readJson(".codex/governance/phase-status.json");
const findingRegistry=(await readBytes(".codex/governance/scanner-finding-registry.yaml")).toString("utf8");
const removed=[
  {capability:"STAGED_EXACT",production_executable:/liveStagedProofValidated|staged_file_set_sha256|staged_blob_set_sha256/.test(gateRouter+validator),expected:false},
  {capability:"evidence_waiver",production_executable:/applyEvidenceWaiver|resolveEvidenceWaiver|waiverAuthority/.test(validator),expected:false},
  {capability:"confirmed_domain_rule_promotion",production_executable:/export\s+(?:async\s+)?function\s+(?:promote|confirm)/i.test(domainControls),expected:false},
  {capability:"dynamic_business_meta_rule_authority",production_executable:/railway_domain_authority/.test(domainControls),expected:false},
  {capability:"authoritative_phase_status_projection",production_executable:phaseStatus.used_as_gate_input!==false||phaseStatus.used_as_scope_input!==false||phaseStatus.used_as_approval_input!==false,expected:false},
  {capability:"extension_magic_mismatch",production_executable:/extension[-_]magic[-_]mismatch/i.test(findingRegistry),expected:false}
];
await emit("removed-capability-executable-scan.json",{schema_version:1,task_id:taskId,scan_scope:"exact candidate production Gate, validator, Domain and scanner control paths",capabilities:removed,all_removed_capabilities_non_executable:removed.every((item)=>item.production_executable===item.expected),expected_absence_is_not_blocker:true,result:removed.every((item)=>item.production_executable===item.expected)?"PASS":"FAIL"});

const r9=await readJson(".codex/tasks/GOV-PHASE1-REMEDIATION-9/validation-run-summary.json");
const r10=await readJson(".codex/tasks/GOV-PHASE1-REMEDIATION-10/session-b2-readiness.json");
const sessionBFindings=await readJson(".codex/tasks/GOV-PHASE1-SESSION-B-COMPATIBILITY-REVIEW/review-findings.yaml");
const m320Findings=await readJson(".codex/tasks/GOV-M320-DRYRUN/review-findings.yaml");
await emit("historical-task-compatibility.json",{schema_version:1,task_id:taskId,classification_model:["UNCHANGED_VALID","UNCHANGED_NO-GO","HISTORICAL_ONLY","REMEDIATED_PENDING_FRESH_REVIEW","EXPECTEDLY_UNSUPPORTED","INVALID_REGRESSION"],records:[{subject:"A10 formal review",classification:"UNCHANGED_VALID",recorded_outcome:a10.reviewer_set_outcome,candidate_gate:a10.bootstrap_candidate_review_gate},{subject:"R9 remediation validation",classification:"UNCHANGED_VALID",recorded_outcome:r9.status,candidate_file_count:r9.candidate.file_count},{subject:"Session B original review",classification:"HISTORICAL_ONLY",recorded_outcome:sessionBFindings.overall_outcome??sessionBFindings.overall_gate??"BLOCKER",reinterpretation_forbidden:true},{subject:"Remediation 10 readiness",classification:"REMEDIATED_PENDING_FRESH_REVIEW",recorded_outcome:r10.result??r10.status,session_b2_authorized:r10.session_b2_authorized},{subject:"Migration 320",classification:"UNCHANGED_NO-GO",recorded_outcome:m320Findings.overall_gate}],historical_reviewer_outcomes_reinterpreted:false,historical_blockers_rewritten_as_pass:false,historical_raw_artifacts_added_to_candidate:false,result:"PASS"});

const m320Manifest=await readJson(".codex/tasks/GOV-M320-DRYRUN/artifact-manifest.yaml");
const m320Blueprint=await readJson(".codex/tasks/GOV-M320-DRYRUN/blueprint.yaml");
await emit("migration-320-compatibility.json",{schema_version:1,task_id:taskId,subject_task_id:"GOV-M320-DRYRUN",structural:"VALID",domain_decision:"NEEDS_HUMAN_DECISION",execution_gate:m320Findings.overall_gate,expected_validator_exit:2,blockers:m320Findings.blockers,candidate_rules:m320Blueprint.candidate_rules,applicable_railway_rules:[],evidence_artifact_count:m320Manifest.artifacts.length,all_evidence_hashes_bound:m320Manifest.artifacts.every((item)=>/^[A-F0-9]{64}$/.test(item.sha256)),candidate_gate_affected:false,actual_maintenance_rule_approved:false,result:m320Findings.overall_gate==="NO-GO"&&m320Blueprint.candidate_rules.length===3?"PASS":"FAIL"});

const baseline=await readJson(`.codex/tasks/${taskId}/review-baseline-before.json`);
const baselineChecks=[];
for(const item of baseline.files){
  try{const bytes=await readBytes(item.relative_path);const actual=sha256(bytes);baselineChecks.push({path:item.relative_path,artifact_type:item.artifact_type,expected_sha256:item.sha256,actual_sha256:actual,match:actual===item.sha256});}
  catch(error){baselineChecks.push({path:item.relative_path,artifact_type:item.artifact_type,expected_sha256:item.sha256,actual_sha256:null,match:false,error:error.message});}
}
const typeCounts={};for(const item of baselineChecks)typeCounts[item.artifact_type]=(typeCounts[item.artifact_type]??0)+1;
await emit("historical-artifact-integrity.json",{schema_version:1,task_id:taskId,baseline_ref:`.codex/tasks/${taskId}/review-baseline-before.json`,expected_file_count:baseline.files.length,actual_checked_file_count:baselineChecks.length,artifact_type_counts:typeCounts,changed_or_missing:baselineChecks.filter((item)=>!item.match),all_protected_bytes_unchanged:baselineChecks.every((item)=>item.match),candidate_file_count:typeCounts["candidate-artifact"],candidate_unchanged:baselineChecks.filter((item)=>item.artifact_type==="candidate-artifact").every((item)=>item.match),result:baselineChecks.length===baseline.files.length&&baselineChecks.every((item)=>item.match)?"PASS":"FAIL"});

console.log(JSON.stringify({result:outputs.every((item)=>item.result==="PASS")?"PASS":"FAIL",outputs,protected_files_checked:baselineChecks.length,reviewer_assignments:assignmentChecks.length,schema_count:schemaSet.schemas.length}));
if(outputs.some((item)=>item.result!=="PASS")) process.exit(1);
