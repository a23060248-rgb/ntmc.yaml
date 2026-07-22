import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {safeExistingPath} from "../../scripts/lib/path-safety.mjs";
import {canonicalSha256,sha256} from "../../scripts/lib/governance/typed-proof.mjs";

const taskDir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(taskDir,"../../..");
const refs={manifest:".codex/governance/governance-commit-manifest.yaml",record:".codex/tasks/GOV-PHASE1-REMEDIATION-9/bootstrap-candidate-record.json",report:".codex/tasks/GOV-PHASE1-REMEDIATION-9/bootstrap-scanner-report.json",contract:".codex/governance/scan-contract.yaml",sessionEvidence:".codex/tasks/GOV-PHASE1-SESSION-B-COMPATIBILITY-REVIEW/security-evidence.yaml",sessionScope:".codex/tasks/GOV-PHASE1-SESSION-B-COMPATIBILITY-REVIEW/security-review-read-scope.json",sessionReview:".codex/tasks/GOV-PHASE1-SESSION-B-COMPATIBILITY-REVIEW/security-integrity-review.json"};
async function load(ref){const bytes=await readFile(await safeExistingPath(root,ref));return {bytes,json:JSON.parse(bytes.toString("utf8")),sha256:sha256(bytes)};}
const data={};for(const [key,ref] of Object.entries(refs)) data[key]=await load(ref);
const files=(data.manifest.json.artifacts??[]).map((item)=>({path:item.path,sha256:item.sha256})).sort((a,b)=>a.path.localeCompare(b.path));
const manifestValid=data.manifest.sha256==="29F4F947DEF79A633F63E28FA2444F4734D7E6BB9612B96154A302464255531D"&&files.length===103&&canonicalSha256(files)===data.record.json.included_file_set_sha256;
const chainValid=manifestValid&&data.record.json.manifest_sha256===data.manifest.sha256&&data.report.json.candidate_binding.manifest_sha256===data.manifest.sha256&&data.record.json.included_file_set_sha256===data.report.json.candidate_binding.included_file_set_sha256&&data.report.json.candidate_binding.scanned_file_set_sha256===data.record.json.included_file_set_sha256&&data.record.json.scan_contract_sha256===data.contract.sha256&&data.report.json.scan_contract.contract_sha256===data.contract.sha256;
const oldAllowed=new Set(data.sessionScope.json.allowed_files??[]);
const missing=[refs.manifest,refs.record,refs.report].filter((ref)=>!oldAllowed.has(ref));
const findings=[
  {finding_id:"SB-SEC-EVIDENCE-CONTRACT-VERSION-001",affected_layer:"session_b_task_local_artifact",root_cause:"The non-overwriting Session B scaffold copied a legacy scan_contract_version=4 field instead of deriving contract identity, version and hash from the frozen production candidate chain.",candidate_change_required:false,evidence:{session_b_security_evidence_ref:refs.sessionEvidence,session_b_security_evidence_sha256:data.sessionEvidence.sha256,session_b_declared_version:data.sessionEvidence.json.scan_contract.scan_contract_version,production_contract_ref:refs.contract,production_contract_sha256:data.contract.sha256,production_contract_version:data.contract.json.scan_contract_version,candidate_record_bound_contract_sha256:data.record.json.scan_contract_sha256,scanner_report_bound_contract_sha256:data.report.json.scan_contract.contract_sha256}},
  {finding_id:"SB-SEC-ALLOWLIST-EVIDENCE-GAP-001",affected_layer:"session_b_review_scope",root_cause:"The Session B formal Security read scope enumerated candidate files and derived summaries but omitted the three direct source nodes needed to independently verify the manifest-record-report binding chain.",candidate_change_required:false,evidence:{session_b_security_scope_ref:refs.sessionScope,session_b_security_scope_sha256:data.sessionScope.sha256,missing_required_paths:missing,formal_security_review_ref:refs.sessionReview,formal_security_review_sha256:data.sessionReview.sha256}}
];
const candidateChangeRequired=!chainValid||findings.some((item)=>item.candidate_change_required);
const payload={schema_version:1,task_id:"GOV-PHASE1-REMEDIATION-10",classification_performed_before_remediation_artifact_generation:true,candidate_chain_directly_recomputed:true,candidate_governance_source:{manifest_valid:manifestValid,chain_valid:chainValid,candidate_change_required:candidateChangeRequired,manifest_sha256:data.manifest.sha256,file_count:files.length,included_file_set_sha256:canonicalSha256(files)},findings,stop_condition:candidateChangeRequired?"REMEDIATION_10_STOPPED / CANDIDATE_CHANGE_REQUIRED":"NOT_TRIGGERED",result:candidateChangeRequired?"REMEDIATION_10_STOPPED":"CONTINUE_REMEDIATION"};
await writeFile(path.join(taskDir,"root-cause-classification.json"),`${JSON.stringify(payload,null,2)}\n`,{encoding:"utf8",flag:"wx"});
console.log(JSON.stringify({result:payload.result,candidate_change_required:candidateChangeRequired,affected_layers:findings.map((item)=>item.affected_layer)}));
if(candidateChangeRequired) process.exitCode=1;
