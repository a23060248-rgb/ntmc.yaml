import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {safeExistingPath} from "../../scripts/lib/path-safety.mjs";
import {canonicalSha256,sha256} from "../../scripts/lib/governance/typed-proof.mjs";

const taskDir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(taskDir,"../../..");
const taskId="GOV-PHASE1-REMEDIATION-10";
async function loadTask(name){return JSON.parse(await readFile(path.join(taskDir,name),"utf8"));}
async function loadRoot(ref){const bytes=await readFile(await safeExistingPath(root,ref));return {json:JSON.parse(bytes.toString("utf8")),sha256:sha256(bytes)};}
function clone(value){return structuredClone(value);}
function scopeHash(scope){const copy=clone(scope);delete copy.scope_payload_sha256;return canonicalSha256(copy);}
function refreshScope(scope){scope.scope_payload_sha256=scopeHash(scope);return scope;}
const chain=await loadTask("session-b2-security-binding-chain.json");
const scope=await loadTask("session-b2-security-read-scope.json");
const evidence=await loadTask("session-b2-security-evidence-contract.yaml");
const contract=await loadRoot(chain.scanner_contract.path);
const record=await loadRoot(chain.candidate_record.path);
const report=await loadRoot(chain.scanner_report.path);
const manifest=await loadRoot(chain.candidate.manifest_path);

function validateContract({candidateRecord=record.json,scannerReport=report.json,securityEvidence=evidence,productionContract=contract}){
  const violations=[];
  const derived={id:productionContract.json.scan_contract_id,version:productionContract.json.scan_contract_version,sha256:productionContract.sha256,path:chain.scanner_contract.path};
  const binding=securityEvidence.scanner_binding??{};
  if(binding.manual_contract_version_override!==undefined) violations.push("MANUAL_CONTRACT_VERSION_OVERRIDE_FORBIDDEN");
  if(binding.derived_from_production_contract!==true||binding.manual_version_override_allowed!==false) violations.push("CONTRACT_MUST_BE_DERIVED_AND_OVERRIDE_FORBIDDEN");
  if(binding.contract_id!==derived.id||binding.contract_version!==derived.version||binding.contract_sha256!==derived.sha256||binding.source_path!==derived.path) violations.push("EVIDENCE_PRODUCTION_CONTRACT_MISMATCH");
  if(candidateRecord.scan_contract_sha256!==derived.sha256) violations.push("CANDIDATE_RECORD_CONTRACT_HASH_MISMATCH");
  if(scannerReport.scan_contract?.contract_id!==derived.id||scannerReport.scan_contract?.contract_version!==derived.version||scannerReport.scan_contract?.contract_sha256!==derived.sha256) violations.push("SCANNER_REPORT_CONTRACT_BINDING_MISMATCH");
  if(binding.candidate_record_contract_sha256!==candidateRecord.scan_contract_sha256||binding.scanner_report_contract_sha256!==scannerReport.scan_contract?.contract_sha256) violations.push("EVIDENCE_RECORD_REPORT_BINDING_MISMATCH");
  return {valid:violations.length===0,exit:violations.length?1:0,structural:violations.length?"INVALID":"VALID",violations};
}

const actualHashByPath=new Map();
for(const item of scope.allowed_files){if(/^[A-F0-9]{64}$/.test(item.expected_sha256??"")&&!actualHashByPath.has(item.path)){const bytes=await readFile(await safeExistingPath(root,item.path));actualHashByPath.set(item.path,sha256(bytes));}}
function forbidden(pathRef){return [/^\.env(?:\.|$)/,/^collab(?:\/|$)/,/^frontend(?:\/|$)/,/^erp-api(?:\/|$)/,/^db-design(?:\/|$)/,/^migration(?:\/|$)/].some((pattern)=>pattern.test(pathRef));}
function validateScope(candidateScope){
  const violations=[];
  if(candidateScope.scope_payload_sha256!==scopeHash(candidateScope)) violations.push("ALLOWLIST_PAYLOAD_HASH_MISMATCH");
  const entries=new Map();
  for(const item of candidateScope.allowed_files??[]){if(entries.has(item.path)) violations.push(`DUPLICATE_PATH:${item.path}`);entries.set(item.path,item);if(forbidden(item.path)) violations.push(`FORBIDDEN_SCOPE:${item.path}`);if(item.required===true){if(!/^[A-F0-9]{64}$/.test(item.expected_sha256??"")) violations.push(`REQUIRED_HASH_MISSING:${item.path}`);else if(actualHashByPath.get(item.path)!==item.expected_sha256) violations.push(`ALLOWLIST_HASH_MISMATCH:${item.path}`);}}
  const nodes=candidateScope.required_security_chain_nodes??{};
  for(const name of ["candidate_manifest","candidate_record","scanner_report","scanner_contract","finding_registry","canonicalization_config","binary_oracle_config","binary_magic_registry"]){const node=nodes[name],entry=node?entries.get(node.path):null;if(!node||!entry||entry.required!==true) violations.push(`REQUIRED_NODE_MISSING:${name}`);else if(entry.expected_sha256!==node.sha256||actualHashByPath.get(node.path)!==node.sha256) violations.push(`REQUIRED_NODE_HASH_MISMATCH:${name}`);}
  return {valid:violations.length===0,exit:violations.length?1:0,review_plan:violations.length?"INVALID":"VALID",violations};
}

function validateChain(candidateChain){
  const violations=[];
  const c=candidateChain.candidate,r=candidateChain.candidate_record,s=candidateChain.scanner_report;
  if(c.manifest_sha256!==manifest.sha256||c.file_count!==103) violations.push("CANDIDATE_MANIFEST_OR_COUNT_MISMATCH");
  if(r.bound_manifest_sha256!==c.manifest_sha256) violations.push("CANDIDATE_RECORD_MANIFEST_MISMATCH");
  if(s.bound_manifest_sha256!==c.manifest_sha256) violations.push("SCANNER_REPORT_MANIFEST_MISMATCH");
  if(r.bound_file_set_sha256!==c.included_file_set_sha256||s.included_file_set_sha256!==c.included_file_set_sha256||s.scanned_file_set_sha256!==c.included_file_set_sha256) violations.push("INCLUDED_SCANNED_FILE_SET_MISMATCH");
  if(s.expected_file_count!==103||s.scanned_file_count!==103) violations.push("SCANNED_FILE_COUNT_MISMATCH");
  if(s.finding_count!==0) violations.push("REPORT_CLEAN_CLAIM_FINDINGS_NONZERO");
  return {valid:violations.length===0,exit:violations.length?1:0,structural:violations.length?"INVALID":"VALID",violations};
}

function result(id,description,expectedValid,actual){return {case_id:id,description,expected_valid:expectedValid,expected_exit:expectedValid?0:1,actual_valid:actual.valid,actual_exit:actual.exit,violations:actual.violations,result:actual.valid===expectedValid&&actual.exit===(expectedValid?0:1)?"PASS":"FAIL"};}
const contractCases=[];
{const e=clone(evidence);e.scanner_binding.contract_version=4;contractCases.push(result("CV-01","Evidence declares v4 while production is v5.",false,validateContract({securityEvidence:e})));}
{const e=clone(evidence);e.scanner_binding.contract_sha256="0".repeat(64);contractCases.push(result("CV-02","Evidence declares v5 with an incorrect contract hash.",false,validateContract({securityEvidence:e})));}
{const s=clone(report.json);s.scan_contract.contract_version=4;contractCases.push(result("CV-03","Candidate record is v5-bound while scanner report declares v4.",false,validateContract({scannerReport:s})));}
{const e=clone(evidence);e.scanner_binding.manual_contract_version_override=5;contractCases.push(result("CV-04","A hand-written version attempts to override production derivation.",false,validateContract({securityEvidence:e})));}
contractCases.push(result("CV-05","Production contract-derived v5 identity and all four bindings agree.",true,validateContract({})));

function removeNode(base,name){const s=clone(base),node=s.required_security_chain_nodes[name];s.allowed_files=s.allowed_files.filter((item)=>item.path!==node.path);delete s.required_security_chain_nodes[name];return refreshScope(s);}
const allowCases=[];
allowCases.push(result("AL-06","Candidate manifest is missing.",false,validateScope(removeNode(scope,"candidate_manifest"))));
allowCases.push(result("AL-07","Candidate record is missing.",false,validateScope(removeNode(scope,"candidate_record"))));
allowCases.push(result("AL-08","Scanner report is missing.",false,validateScope(removeNode(scope,"scanner_report"))));
allowCases.push(result("AL-09","Scanner contract is missing.",false,validateScope(removeNode(scope,"scanner_contract"))));
allowCases.push(result("AL-10","Finding registry is missing.",false,validateScope(removeNode(scope,"finding_registry"))));
{const s=clone(scope);s.allowed_files.push({path:"collab/HANDOFF.md",purpose:"forbidden mutation",expected_sha256:"0".repeat(64),required:true,source_category:"forbidden"});refreshScope(s);allowCases.push(result("AL-11","collab/HANDOFF.md is added.",false,validateScope(s)));}
{const s=clone(scope);s.allowed_files.push({path:"frontend/package.json",purpose:"forbidden product path",expected_sha256:"0".repeat(64),required:true,source_category:"forbidden"});refreshScope(s);allowCases.push(result("AL-12","A product directory file is added.",false,validateScope(s)));}
{const s=clone(scope),node=s.required_security_chain_nodes.candidate_manifest,entry=s.allowed_files.find((item)=>item.path===node.path);entry.expected_sha256="0".repeat(64);refreshScope(s);allowCases.push(result("AL-13","An allowlisted required hash disagrees with source bytes.",false,validateScope(s)));}
allowCases.push(result("AL-14","Every required node is present, exact and byte-matched.",true,validateScope(scope)));

const chainCases=[];
{const c=clone(chain);c.scanner_report.bound_manifest_sha256="0".repeat(64);chainCases.push(result("CH-15","Scanner report binds an old manifest.",false,validateChain(c)));}
{const c=clone(chain);c.scanner_report.scanned_file_count=102;c.scanner_report.scanned_file_set_sha256="0".repeat(64);chainCases.push(result("CH-16","Scanned file set is missing one file.",false,validateChain(c)));}
{const c=clone(chain);c.scanner_report.scanned_file_count=104;c.scanner_report.scanned_file_set_sha256="F".repeat(64);chainCases.push(result("CH-17","Scanned file set contains one extra file.",false,validateChain(c)));}
{const c=clone(chain);c.candidate_record.bound_manifest_sha256="0".repeat(64);chainCases.push(result("CH-18","Candidate record manifest hash disagrees.",false,validateChain(c)));}
{const c=clone(chain);c.scanner_report.finding_count=1;chainCases.push(result("CH-19","Report claims the chain while findings are non-empty.",false,validateChain(c)));}
chainCases.push(result("CH-20","Complete 103-file chain is internally consistent.",true,validateChain(chain)));

async function writeResult(name,suite,cases){const passed=cases.filter((item)=>item.result==="PASS").length;const payload={schema_version:1,task_id:taskId,suite,total:cases.length,passed,failed:cases.length-passed,cases,result:passed===cases.length?"PASS":"FAIL"};await writeFile(path.join(taskDir,name),`${JSON.stringify(payload,null,2)}\n`,{encoding:"utf8",flag:"wx"});if(payload.result!=="PASS") process.exitCode=1;return payload;}
const outputs=[await writeResult("contract-version-negative-tests.json","contract-version-derivation",contractCases),await writeResult("allowlist-negative-tests.json","exact-security-allowlist",allowCases),await writeResult("candidate-chain-negative-tests.json","candidate-security-binding-chain",chainCases)];
console.log(JSON.stringify({result:outputs.every((item)=>item.result==="PASS")?"PASS":"FAIL",total:outputs.reduce((sum,item)=>sum+item.total,0),passed:outputs.reduce((sum,item)=>sum+item.passed,0),suites:outputs.map((item)=>({suite:item.suite,result:item.result,total:item.total}))}));
