import {lstat,readdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {safeExistingPath} from "../../scripts/lib/path-safety.mjs";
import {sha256} from "../../scripts/lib/governance/typed-proof.mjs";

const taskDir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(taskDir,"../../..");
const taskId="GOV-PHASE1-REMEDIATION-10";
const outputName=process.argv[2];
if(!["review-baseline-before.json","review-baseline-after.json"].includes(outputName)) throw new Error("OUTPUT_MUST_BE_BEFORE_OR_AFTER_BASELINE");
const inheritedRef=".codex/tasks/GOV-PHASE1-SESSION-B-COMPATIBILITY-REVIEW/review-baseline-after.json";
const inherited=JSON.parse(await readFile(await safeExistingPath(root,inheritedRef),"utf8"));
if(inherited.files?.length!==786||inherited.candidate?.file_count!==103) throw new Error("SESSION_B_BASELINE_EXPECTED_786_WITH_103_CANDIDATE");

async function record(relativePath,artifactType){
  const bytes=await readFile(await safeExistingPath(root,relativePath));
  return {relative_path:relativePath,byte_size:bytes.length,sha256:sha256(bytes),artifact_type:artifactType};
}
const files=[];
for(const item of inherited.files) files.push(await record(item.relative_path,item.artifact_type));
async function collectTree(relativePath){
  const absolute=await safeExistingPath(root,relativePath);
  const stat=await lstat(absolute);
  if(stat.isDirectory()){
    for(const name of (await readdir(absolute)).sort((a,b)=>a.localeCompare(b))) await collectTree(path.posix.join(relativePath,name));
    return;
  }
  if(!stat.isFile()) throw new Error(`UNSUPPORTED_SESSION_B_ENTRY:${relativePath}`);
  files.push(await record(relativePath,"session-b-frozen"));
}
await collectTree(".codex/tasks/GOV-PHASE1-SESSION-B-COMPATIBILITY-REVIEW");
files.sort((a,b)=>`${a.artifact_type}|${a.relative_path}`.localeCompare(`${b.artifact_type}|${b.relative_path}`));
const paths=new Set(files.map((item)=>item.relative_path));
if(paths.size!==files.length) throw new Error("PROTECTED_BASELINE_DUPLICATE_PATH");
const counts={};
for(const item of files) counts[item.artifact_type]=(counts[item.artifact_type]??0)+1;
counts.total=files.length;
const payload={schema_version:1,task_id:taskId,baseline_role:outputName.includes("after")?"after":"before",root_token:"${PRODUCT_ROOT}",remediation_task_excluded:`.codex/tasks/${taskId}/**`,git_diff_used:false,exclusions:[".env*","collab/**","frontend/**","erp-api/**","db-design/**","migration/**","parent directories","sibling directories"],candidate:inherited.candidate,inherited_session_b_baseline_ref:inheritedRef,inherited_file_count:inherited.files.length,session_b_frozen_ref:".codex/tasks/GOV-PHASE1-SESSION-B-COMPATIBILITY-REVIEW/**",counts,files};
await writeFile(path.join(taskDir,outputName),`${JSON.stringify(payload,null,2)}\n`,{encoding:"utf8",flag:"wx"});
console.log(JSON.stringify({result:"PASS",output:outputName,counts,candidate:payload.candidate}));
