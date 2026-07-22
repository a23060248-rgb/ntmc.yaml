import {lstat,readdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {safeExistingPath} from "../../scripts/lib/path-safety.mjs";
import {sha256} from "../../scripts/lib/governance/typed-proof.mjs";
const taskDir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(taskDir,"../../.."),taskId="GOV-PHASE1-SESSION-B2-COMPATIBILITY-REVIEW",output=process.argv[2];
if(!["review-baseline-before.json","review-baseline-after.json"].includes(output)) throw new Error("INVALID_BASELINE_OUTPUT");
const inheritedRef=".codex/tasks/GOV-PHASE1-REMEDIATION-10/review-baseline-after.json";
const inherited=JSON.parse(await readFile(await safeExistingPath(root,inheritedRef),"utf8"));
if(inherited.files?.length!==836||inherited.candidate?.file_count!==103) throw new Error("R10_BASELINE_EXPECTED_836_WITH_103_CANDIDATE");
async function record(ref,type){const bytes=await readFile(await safeExistingPath(root,ref));return {relative_path:ref,byte_size:bytes.length,sha256:sha256(bytes),artifact_type:type};}
const files=[];for(const item of inherited.files) files.push(await record(item.relative_path,item.artifact_type));
async function collect(ref){const absolute=await safeExistingPath(root,ref),stat=await lstat(absolute);if(stat.isDirectory()){for(const name of (await readdir(absolute)).sort((a,b)=>a.localeCompare(b))) await collect(path.posix.join(ref,name));return;}if(!stat.isFile())throw new Error(`UNSUPPORTED_R10_ENTRY:${ref}`);files.push(await record(ref,"remediation-10-frozen"));}
await collect(".codex/tasks/GOV-PHASE1-REMEDIATION-10");
files.sort((a,b)=>`${a.artifact_type}|${a.relative_path}`.localeCompare(`${b.artifact_type}|${b.relative_path}`));
if(new Set(files.map((item)=>item.relative_path)).size!==files.length) throw new Error("PROTECTED_BASELINE_DUPLICATE_PATH");
const counts={};for(const item of files)counts[item.artifact_type]=(counts[item.artifact_type]??0)+1;counts.total=files.length;
const payload={schema_version:1,task_id:taskId,baseline_role:output.includes("after")?"after":"before",root_token:"${PRODUCT_ROOT}",review_task_excluded:`.codex/tasks/${taskId}/**`,git_diff_used:false,exclusions:[".env*","collab/**","frontend/**","erp-api/**","db-design/**","migration/**","parent directories","sibling directories"],candidate:inherited.candidate,inherited_r10_baseline_ref:inheritedRef,inherited_file_count:inherited.files.length,remediation_10_frozen_ref:".codex/tasks/GOV-PHASE1-REMEDIATION-10/**",counts,files};
await writeFile(path.join(taskDir,output),`${JSON.stringify(payload,null,2)}\n`,{encoding:"utf8",flag:"wx"});console.log(JSON.stringify({result:"PASS",output,counts,candidate:payload.candidate}));
