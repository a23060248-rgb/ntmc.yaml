import {readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const before = JSON.parse(await readFile(path.join(taskDir,"review-baseline-before.json"),"utf8"));
const after = JSON.parse(await readFile(path.join(taskDir,"review-baseline-after.json"),"utf8"));
const key = (item)=>`${item.artifact_type}|${item.relative_path}`;
const left = new Map(before.files.map((item)=>[key(item),item]));
const right = new Map(after.files.map((item)=>[key(item),item]));
const types = [...new Set([...before.files,...after.files].map((item)=>item.artifact_type))].sort();
const byType = {};
for (const type of types) {
  const ids = [...new Set([...before.files.filter((i)=>i.artifact_type===type).map(key),...after.files.filter((i)=>i.artifact_type===type).map(key)])].sort();
  const added=[],deleted=[],modified=[]; let unchanged=0;
  for (const id of ids) {
    const a=left.get(id), b=right.get(id);
    if (!a) added.push(b.relative_path);
    else if (!b) deleted.push(a.relative_path);
    else if (a.sha256!==b.sha256 || a.byte_size!==b.byte_size) modified.push({relative_path:a.relative_path,before_sha256:a.sha256,after_sha256:b.sha256,before_byte_size:a.byte_size,after_byte_size:b.byte_size});
    else unchanged++;
  }
  byType[type]={before_count:ids.length-added.length,after_count:ids.length-deleted.length,added,deleted,modified,unchanged_count:unchanged,identical:!added.length&&!deleted.length&&!modified.length};
}
const candidateBindingIdentical = JSON.stringify(before.candidate)===JSON.stringify(after.candidate);
const identical = candidateBindingIdentical && Object.values(byType).every((item)=>item.identical);
const result={schema_version:1,task_id:"GOV-PHASE1-SESSION-B-COMPATIBILITY-REVIEW",result:identical?"PASS":"FAIL",identical,candidate_binding_identical:candidateBindingIdentical,by_artifact_type:byType,git_diff_used:false};
await writeFile(path.join(taskDir,"baseline-comparison.json"),`${JSON.stringify(result,null,2)}\n`,{encoding:"utf8",flag:"wx"});
console.log(JSON.stringify({result:result.result,identical,counts:Object.fromEntries(types.map((type)=>[type,byType[type].unchanged_count]))}));
if (!identical) process.exit(1);
