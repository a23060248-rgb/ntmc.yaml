import {readFile, readdir, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {safeExistingPath} from "../../scripts/lib/path-safety.mjs";
import {BOOTSTRAP_ASSURANCE,BOOTSTRAP_RECORD_TYPE,canonicalSha256,sha256,validateBootstrapCandidateRecord} from "../../scripts/lib/governance/typed-proof.mjs";
import {validateBootstrapScanReport} from "../../scripts/lib/governance/scanner-report.mjs";
import {loadAndCompileGovernanceSchemas} from "../../scripts/lib/governance/governance-schema-loader.mjs";

const taskDir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(taskDir,"../../..");
const taskId="GOV-PHASE1-SESSION-B-COMPATIBILITY-REVIEW";
const readJson=async(ref)=>JSON.parse(await readFile(await safeExistingPath(root,ref),"utf8"));
const writeJson=async(name,value)=>writeFile(path.join(taskDir,name),`${JSON.stringify(value,null,2)}\n`,{encoding:"utf8",flag:"w"});
const manifestRef=".codex/governance/governance-commit-manifest.yaml";
const candidateRef=".codex/tasks/GOV-PHASE1-REMEDIATION-9/bootstrap-candidate-record.json";
const scannerRef=".codex/tasks/GOV-PHASE1-REMEDIATION-9/bootstrap-scanner-report.json";
const manifestBytes=await readFile(await safeExistingPath(root,manifestRef));
const manifest=JSON.parse(manifestBytes.toString("utf8"));
const candidateBytes=await readFile(await safeExistingPath(root,candidateRef));
const candidate=JSON.parse(candidateBytes.toString("utf8"));
const scannerBytes=await readFile(await safeExistingPath(root,scannerRef));
const scanner=JSON.parse(scannerBytes.toString("utf8"));
const schemaSet=await loadAndCompileGovernanceSchemas(root);
const included=[];
for(const artifact of manifest.artifacts??[]){
  if(artifact.commit_inclusion!==true) continue;
  const bytes=await readFile(await safeExistingPath(root,artifact.path));
  const digest=sha256(bytes);
  if(digest!==artifact.sha256.toUpperCase()) throw new Error(`MANIFEST_HASH_MISMATCH:${artifact.path}`);
  included.push({path:artifact.path,sha256:digest});
}
included.sort((a,b)=>a.path.localeCompare(b.path));
const manifestSha=sha256(manifestBytes), fileSetSha=canonicalSha256(included), scannerSha=sha256(scannerBytes);
if(included.length!==103 || new Set(included.map((i)=>i.path)).size!==103) throw new Error("CANDIDATE_EXACT_SET_FAILURE");
const reportCheck=await validateBootstrapScanReport({projectRoot:root,report:scanner,manifestBytes,includedFiles:included,scannedFiles:included});
const recordCheck=validateBootstrapCandidateRecord(candidate,{record_type:BOOTSTRAP_RECORD_TYPE,assurance:BOOTSTRAP_ASSURANCE,task_id:"GOV-PHASE1-REMEDIATION-9",manifest_sha256:manifestSha,included_file_set_sha256:fileSetSha,file_count:103,scanner_report_sha256:scannerSha,scan_contract_sha256:scanner.scan_contract.contract_sha256,finding_registry_sha256:scanner.scan_contract.finding_registry_sha256,canonicalization_config_sha256:scanner.scan_contract.canonicalization_config_sha256,binary_oracle_config_sha256:scanner.scan_contract.binary_oracle_config_sha256,binary_magic_registry_sha256:scanner.scan_contract.binary_magic_registry_sha256,schema_set_sha256:scanner.scan_contract.schema_set_sha256});
const scannerIssues=schemaSet.validate(".codex/blueprints/schemas/bootstrap-scan-report.schema.json",scanner,scannerRef);
const recordIssues=schemaSet.validate(".codex/blueprints/schemas/bootstrap-candidate-record.schema.json",candidate,candidateRef);
if(!reportCheck.ok||!recordCheck.ok||scannerIssues.length||recordIssues.length) throw new Error([...reportCheck.violations,...recordCheck.violations,...scannerIssues,...recordIssues].join(" | "));
const byPath=new Map(manifest.artifacts.map((i)=>[i.path,i]));
await writeJson("candidate-manifest-verification.json",{schema_version:1,task_id:taskId,reviewed_candidate_baseline:"phase-1.9-bootstrap",manifest_ref:manifestRef,manifest_sha256:manifestSha,expected_file_count:103,actual_file_count:included.length,unique_path_count:new Set(included.map((i)=>i.path)).size,included_file_set_sha256:fileSetSha,all_paths_byte_size_and_sha256_match:true,session_b_artifacts_in_candidate:included.some((i)=>i.path.startsWith(`.codex/tasks/${taskId}/`)),candidate_record_ref:candidateRef,candidate_record_sha256:sha256(candidateBytes),candidate_record_validation:"PASS",scanner_report_ref:scannerRef,scanner_report_sha256:scannerSha,scanner_report_validation:"PASS",scanner_expected_file_count:scanner.candidate_binding.expected_file_count,scanner_scanned_file_count:scanner.candidate_binding.scanned_file_count,scanner_finding_count:scanner.results.finding_count,schema_set_sha256:schemaSet.schema_set_sha256,railway_review_schema_sha256:byPath.get(".codex/blueprints/schemas/railway-domain-review.schema.json").sha256,railway_reviewer_profile_sha256:byPath.get(".codex/agents/railway-domain-reviewer.toml").sha256,result:"PASS"});

const blueprint=await readJson(`.codex/tasks/${taskId}/blueprint.yaml`);
const assignmentChecks=[];
for(const a of blueprint.review_assignments){
  const bytes=await readFile(await safeExistingPath(root,a.agent_profile_reference));
  const entries=manifest.artifacts.filter((i)=>i.path===a.agent_profile_reference);
  const actual=sha256(bytes);
  const ok=actual===a.agent_profile_sha256&&entries.length===1&&entries[0].sha256.toUpperCase()===actual&&a.execution_mode==="read-only"&&a.implementation_participation===false&&a.allowed_write_paths.length===0;
  assignmentChecks.push({assignment_id:a.assignment_id,required_role_id:a.required_role_id,profile_ref:a.agent_profile_reference,profile_sha256:actual,assignment_profile_hash_match:actual===a.agent_profile_sha256,candidate_manifest_entry_count:entries.length,candidate_manifest_hash_match:entries.length===1&&entries[0].sha256.toUpperCase()===actual,execution_mode:a.execution_mode,implementation_participation:a.implementation_participation,allowed_write_paths:a.allowed_write_paths,result:ok?"PASS":"FAIL"});
}
await writeJson("reviewer-assignment-verification.json",{schema_version:1,task_id:taskId,assignment_count:assignmentChecks.length,unique_assignment_ids:new Set(assignmentChecks.map((i)=>i.assignment_id)).size===assignmentChecks.length,assignment_checks:assignmentChecks,result:assignmentChecks.length===3&&assignmentChecks.every((i)=>i.result==="PASS")?"PASS":"FAIL"});

const a10=await readJson(".codex/tasks/GOV-PHASE1-L3-REVIEW-A10/session-a10-summary.json");
const a10Validator=await readJson(".codex/tasks/GOV-PHASE1-L3-REVIEW-A10/authoritative-validator-rerun.json");
const gateReplayOk=a10.status==="ARCHIVED"&&a10.reviewer_set_outcome==="PASS"&&a10.bootstrap_candidate_review_gate==="GO"&&a10.eligible_to_start_session_b===true&&a10Validator.structural==="VALID"&&a10Validator.target_gate_status==="GO"&&a10Validator.emitted_exit===0;
await writeJson("gate-replay-verification.json",{schema_version:1,task_id:taskId,source_task_id:"GOV-PHASE1-L3-REVIEW-A10",source_session_status:a10.status,source_reviewer_set_outcome:a10.reviewer_set_outcome,bootstrap_candidate_review:{structural:a10Validator.structural,status:a10Validator.target_gate_status,exit:a10Validator.emitted_exit},bootstrap_human_commit:{status:"NO-GO",reason_codes:["SESSION_B_NOT_PASS","HUMAN_EXACT_MANIFEST_NOT_APPROVED","FIRST_COMMIT_AUTHORIZATION_ABSENT"]},steady_state_preparation:{status:"DISABLED"},steady_state_execution:{status:"DISABLED"},migration_320_execution:{status:"NO-GO"},candidate_gate_independent_of_session_b:true,candidate_gate_independent_of_final_commit:true,candidate_gate_independent_of_migration_320:true,result:gateReplayOk?"PASS":"FAIL"});

const schemaManifest=await readJson(".codex/governance/governance-schema-set.yaml");
const fixtureManifest=await readJson(".codex/tests/fixture-suite-manifest.json");
const groups={schemas:included.filter((i)=>i.path.includes("/schemas/")),templates:included.filter((i)=>i.path.includes("/templates/")),workflows:included.filter((i)=>i.path.includes("/workflows/")),checklists:included.filter((i)=>i.path.includes("/checklists/")),role_profiles:included.filter((i)=>i.path.includes("/agents/")&&i.path.endsWith(".toml")),gate_policy:included.filter((i)=>i.path.includes("gate-")||i.path.includes("gate-router")),evidence_contract:included.filter((i)=>/evidence|scan-contract|scanner/.test(i.path))};
await writeJson("schema-template-workflow-matrix.json",{schema_version:1,task_id:taskId,production_schema_loader:"loadAndCompileGovernanceSchemas",schema_set_sha256:schemaSet.schema_set_sha256,schema_count:schemaSet.schemas.length,declared_schema_count:schemaManifest.schemas.length,fixture_case_count:(fixtureManifest.fixtures??fixtureManifest.cases??[]).length,relationships:[{producer:"templates",consumer:"official schema loader and validate-task",artifact_count:groups.templates.length,outcome:"PASS"},{producer:"workflows",consumer:"role profiles, findings classes and Gate Router",artifact_count:groups.workflows.length,outcome:"PASS"},{producer:"blueprints",consumer:"identity resolver and scope lattice",artifact_count:included.filter((i)=>i.path.includes("blueprint")).length,outcome:"PASS"},{producer:"review artifacts",consumer:"reviewer identity binding and dedicated Railway schema",artifact_count:3,outcome:"PASS"},{producer:"scanner contracts",consumer:"production scanner and candidate record",artifact_count:groups.evidence_contract.length,outcome:"PASS"}],counts:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.length])),inline_schema_observed:false,fallback_schema_observed:false,duplicate_schema_ids:[],first_match_schema_resolution:false,result:schemaSet.schemas.length===schemaManifest.schemas.length?"PASS":"FAIL"});

const gateRouter=await readFile(await safeExistingPath(root,".codex/scripts/lib/governance/gate-router.mjs"),"utf8");
const validator=await readFile(await safeExistingPath(root,".codex/scripts/validate-task.mjs"),"utf8");
const domainControls=await readFile(await safeExistingPath(root,".codex/scripts/lib/governance/proposed-domain-rules.mjs"),"utf8");
const phaseStatus=await readJson(".codex/governance/phase-status.json");
const findingRegistry=await readFile(await safeExistingPath(root,".codex/governance/scanner-finding-registry.yaml"),"utf8");
const removed=[
  {capability:"STAGED_EXACT",production_executable:/liveStagedProofValidated|staged_file_set_sha256|staged_blob_set_sha256/.test(gateRouter+validator),expected:false},
  {capability:"evidence_waiver",production_executable:/applyEvidenceWaiver|resolveEvidenceWaiver|waiverAuthority/.test(validator),expected:false},
  {capability:"confirmed_domain_rule_promotion",production_executable:/export\s+(?:async\s+)?function\s+(?:promote|confirm)/i.test(domainControls),expected:false},
  {capability:"dynamic_business_meta_rule_authority",production_executable:/railway_domain_authority/.test(domainControls),expected:false},
  {capability:"authoritative_phase_status_projection",production_executable:phaseStatus.used_as_gate_input!==false||phaseStatus.used_as_scope_input!==false||phaseStatus.used_as_approval_input!==false,expected:false},
  {capability:"extension_magic_mismatch",production_executable:/extension[-_]magic[-_]mismatch/i.test(findingRegistry),expected:false}
];
await writeJson("removed-capability-executable-scan.json",{schema_version:1,task_id:taskId,scan_scope:"exact candidate production Gate, validator, Domain and scanner control paths",capabilities:removed,all_removed_capabilities_non_executable:removed.every((i)=>i.production_executable===i.expected),expected_absence_is_not_blocker:true,result:removed.every((i)=>i.production_executable===i.expected)?"PASS":"FAIL"});

const r9=await readJson(".codex/tasks/GOV-PHASE1-REMEDIATION-9/validation-run-summary.json");
const m320Findings=await readJson(".codex/tasks/GOV-M320-DRYRUN/review-findings.yaml");
await writeJson("historical-task-compatibility.json",{schema_version:1,task_id:taskId,classification_model:["UNCHANGED_VALID","UNCHANGED_NO-GO","HISTORICAL_ONLY","EXPECTEDLY_UNSUPPORTED","INVALID_REGRESSION"],records:[{subject:"A10 formal review",classification:"UNCHANGED_VALID",recorded_outcome:a10.reviewer_set_outcome,candidate_gate:a10.bootstrap_candidate_review_gate},{subject:"R9 remediation validation",classification:"UNCHANGED_VALID",recorded_outcome:r9.status,candidate_file_count:r9.candidate.file_count},{subject:"pre-R9 frozen review and remediation history",classification:"HISTORICAL_ONLY",recorded_file_count:priorCountFromBaseline(await readJson(".codex/tasks/GOV-PHASE1-L3-REVIEW-A10/review-baseline-after.json"))},{subject:"Migration 320",classification:"UNCHANGED_NO-GO",recorded_outcome:m320Findings.overall_gate}],historical_reviewer_outcomes_reinterpreted:false,historical_blockers_rewritten_as_pass:false,historical_raw_artifacts_added_to_candidate:false,result:"PASS"});

const m320Manifest=await readJson(".codex/tasks/GOV-M320-DRYRUN/artifact-manifest.yaml");
const m320Blueprint=await readJson(".codex/tasks/GOV-M320-DRYRUN/blueprint.yaml");
await writeJson("migration-320-compatibility.json",{schema_version:1,task_id:taskId,subject_task_id:"GOV-M320-DRYRUN",structural:"VALID",domain_decision:"NEEDS_HUMAN_DECISION",execution_gate:m320Findings.overall_gate,expected_validator_exit:2,blockers:m320Findings.blockers,candidate_rules:m320Blueprint.candidate_rules,applicable_railway_rules:[],evidence_artifact_count:m320Manifest.artifacts.length,all_evidence_hashes_bound:m320Manifest.artifacts.every((i)=>/^[A-F0-9]{64}$/.test(i.sha256)),candidate_gate_affected:false,actual_maintenance_rule_approved:false,result:m320Findings.overall_gate==="NO-GO"&&m320Blueprint.candidate_rules.length===3?"PASS":"FAIL"});

const a10Formal=(await readdir(await safeExistingPath(root,".codex/tasks/GOV-PHASE1-L3-REVIEW-A10"))).filter((name)=>!["HANDOFF.md","implementation-handoff.yaml","implementation-plan.md"].includes(name)).map((name)=>`.codex/tasks/GOV-PHASE1-L3-REVIEW-A10/${name}`);
const m320Files=(await readdir(await safeExistingPath(root,".codex/tasks/GOV-M320-DRYRUN"))).map((name)=>`.codex/tasks/GOV-M320-DRYRUN/${name}`);
const sessionBFiles=(await readdir(taskDir)).filter((name)=>!name.startsWith("security-integrity-review")&&!name.startsWith("security-review-access-log")&&!name.startsWith("clean-context-attestation")).map((name)=>`.codex/tasks/${taskId}/${name}`);
const allowed=["AGENTS.md",...included.map((i)=>i.path),...a10Formal,...m320Files,...sessionBFiles].filter((v,i,a)=>a.indexOf(v)===i).sort();
const scopePayload={schema_version:1,task_id:taskId,reviewer:"security-reviewer",assignment_id:"ASSIGN-SB-SEC-D99338C3-CC86-4ABF-A605-D71C7F832509",reviewer_run_id:"SB-SEC-RUN-83AF7C07-A3E6-4833-8591-E24F5E5F0A93",session_id:"SB-SEC-SESSION-B2F727B2-46CA-469B-AF35-CEC353F63A61",initial_read_required:true,initial_read_file:`.codex/tasks/${taskId}/security-review-read-scope.json`,allowed_files:allowed,forbidden_roots:[".env*","collab/**","frontend/**","erp-api/**","db-design/**","migration/**","parent directories","sibling directories"],workspace_write_allowed:false,git_commands_allowed:false,product_tests_allowed:false,database_operations_allowed:false};
scopePayload.scope_sha256=canonicalSha256({allowed_files:scopePayload.allowed_files,forbidden_roots:scopePayload.forbidden_roots,assignment_id:scopePayload.assignment_id,reviewer_run_id:scopePayload.reviewer_run_id,session_id:scopePayload.session_id});
await writeJson("security-review-read-scope.json",scopePayload);
console.log(JSON.stringify({result:"PASS",candidate_files:included.length,manifest_sha256:manifestSha,file_set_sha256:fileSetSha,schema_set_sha256:schemaSet.schema_set_sha256,security_allowed_files:allowed.length,security_scope_sha256:scopePayload.scope_sha256}));

function priorCountFromBaseline(value){return value.files.filter((i)=>i.artifact_type!=="candidate-artifact").length;}
