import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {safeExistingPath} from "../../scripts/lib/path-safety.mjs";
import {canonicalSha256,sha256} from "../../scripts/lib/governance/typed-proof.mjs";

const taskDir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(taskDir,"../../..");
const taskId="GOV-PHASE1-SESSION-B2-COMPATIBILITY-REVIEW";
const base=`.codex/tasks/${taskId}`;
const readBytes=async(ref)=>readFile(await safeExistingPath(root,ref));
const readJson=async(ref)=>JSON.parse((await readBytes(ref)).toString("utf8"));
const manifestRef=`${base}/pre-review-input-manifest.json`;
const freezeRef=`${base}/pre-review-freeze.json`;
const scopeRef=`${base}/session-b2-security-read-scope-final.json`;
const manifestBytes=await readBytes(manifestRef), manifest=JSON.parse(manifestBytes.toString("utf8"));
const freeze=await readJson(freezeRef);
const scope=await readJson(scopeRef);
const frozenChecks=[];
for(const item of manifest.files){const bytes=await readBytes(item.path);const actual=sha256(bytes);frozenChecks.push({path:item.path,expected_sha256:item.sha256,actual_sha256:actual,expected_byte_size:item.byte_size,actual_byte_size:bytes.length,result:actual===item.sha256&&bytes.length===item.byte_size?"PASS":"FAIL"});}
const evidencePath=`${base}/session-b2-security-evidence.yaml`;
const normalized=structuredClone(scope);delete normalized.scope_payload_sha256;const evidenceEntry=normalized.allowed_files.find((item)=>item.path===evidencePath);if(evidenceEntry)evidenceEntry.expected_sha256=null;
const calculatedScopePayloadSha=canonicalSha256(normalized);
const duplicatePaths=scope.allowed_files.map((item)=>item.path).filter((value,index,array)=>array.indexOf(value)!==index);
const forbiddenPatterns=[/^\.env(?:\.|$)/,/^collab(?:\/|$)/,/^frontend(?:\/|$)/,/^erp-api(?:\/|$)/,/^db-design(?:\/|$)/,/^migration(?:\/|$)/];
const forbiddenEntries=scope.allowed_files.filter((item)=>forbiddenPatterns.some((pattern)=>pattern.test(item.path))).map((item)=>item.path);
const allowlistChecks=[];
for(const item of scope.allowed_files){const bytes=await readBytes(item.path);const actual=sha256(bytes);allowlistChecks.push({path:item.path,required:item.required===true,expected_sha256:item.expected_sha256,actual_sha256:actual,result:item.required===true&&actual===item.expected_sha256?"PASS":"FAIL"});}
const entries=new Map(scope.allowed_files.map((item)=>[item.path,item]));
const requiredNodes=[];
for(const [node,value] of Object.entries(scope.required_security_chain_nodes)){const entry=entries.get(value.path);const bytes=await readBytes(value.path);const actual=sha256(bytes);requiredNodes.push({node,path:value.path,node_sha256:value.sha256,allowlist_sha256:entry?.expected_sha256,actual_sha256:actual,required:entry?.required===true,result:entry?.required===true&&value.sha256===entry.expected_sha256&&actual===value.sha256?"PASS":"FAIL"});}
const result=freeze.pre_review_freeze?.frozen===true&&freeze.pre_review_freeze?.input_manifest_ref===manifestRef&&freeze.pre_review_freeze?.input_manifest_sha256===sha256(manifestBytes)&&manifest.file_count===9&&frozenChecks.every((item)=>item.result==="PASS")&&scope.review_plan_status==="VALID"&&scope.initial_read_required===true&&scope.initial_read_file===scopeRef&&scope.allowed_files.length===145&&duplicatePaths.length===0&&forbiddenEntries.length===0&&calculatedScopePayloadSha===scope.scope_payload_sha256&&allowlistChecks.every((item)=>item.result==="PASS")&&requiredNodes.length===8&&requiredNodes.every((item)=>item.result==="PASS")?"PASS":"FAIL";
const payload={schema_version:1,task_id:taskId,verification_stage:"immediately_before_reviewer_dispatch",pre_review_input_manifest_ref:manifestRef,pre_review_input_manifest_sha256:sha256(manifestBytes),freeze_bound_manifest_sha256:freeze.pre_review_freeze?.input_manifest_sha256,frozen_input_count:manifest.files.length,frozen_input_checks:frozenChecks,security_scope_ref:scopeRef,security_scope_file_sha256:sha256(await readBytes(scopeRef)),expected_allowed_file_count:145,actual_allowed_file_count:scope.allowed_files.length,duplicate_paths:[...new Set(duplicatePaths)],forbidden_entries:forbiddenEntries,scope_payload_sha256_expected:scope.scope_payload_sha256,scope_payload_sha256_calculated:calculatedScopePayloadSha,allowlist_checks:allowlistChecks,required_chain_node_count:requiredNodes.length,required_chain_nodes:requiredNodes,review_plan:result==="PASS"?"VALID":"INVALID",expected_exit:result==="PASS"?0:1,result,completed_at:new Date().toISOString()};
await writeFile(path.join(taskDir,"pre-review-freeze-verification.json"),`${JSON.stringify(payload,null,2)}\n`,{encoding:"utf8",flag:"w"});
console.log(JSON.stringify({result,frozen_inputs:frozenChecks.length,allowed_files:scope.allowed_files.length,required_nodes:requiredNodes.length,forbidden_entries:forbiddenEntries.length,scope_payload_match:calculatedScopePayloadSha===scope.scope_payload_sha256}));
if(result!=="PASS") process.exit(1);
