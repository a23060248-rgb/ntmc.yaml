import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const taskDir=path.dirname(fileURLToPath(import.meta.url));
const before=JSON.parse(await readFile(path.join(taskDir,"review-baseline-before.json"),"utf8"));
const after=JSON.parse(await readFile(path.join(taskDir,"review-baseline-after.json"),"utf8"));
const beforeMap=new Map(before.files.map((item)=>[item.relative_path,item]));
const afterMap=new Map(after.files.map((item)=>[item.relative_path,item]));
const added=[...afterMap.keys()].filter((ref)=>!beforeMap.has(ref)).sort();
const removed=[...beforeMap.keys()].filter((ref)=>!afterMap.has(ref)).sort();
const changed=[];
for(const [ref,item] of beforeMap){const next=afterMap.get(ref);if(next&&(item.sha256!==next.sha256||item.byte_size!==next.byte_size||item.artifact_type!==next.artifact_type)) changed.push({relative_path:ref,before:item,after:next});}
const result=added.length||removed.length||changed.length?"FAIL":"PASS";
const payload={schema_version:1,task_id:"GOV-PHASE1-REMEDIATION-10",before_ref:"review-baseline-before.json",after_ref:"review-baseline-after.json",before_file_count:before.files.length,after_file_count:after.files.length,added,removed,changed,candidate_byte_identical:result==="PASS",a10_outcome_unchanged:result==="PASS",session_b_outcome_unchanged:result==="PASS",migration_320_evidence_unchanged:result==="PASS",git_diff_used:false,result};
await writeFile(path.join(taskDir,"baseline-comparison.json"),`${JSON.stringify(payload,null,2)}\n`,{encoding:"utf8",flag:"wx"});
console.log(JSON.stringify({result,added:added.length,removed:removed.length,changed:changed.length,file_count:before.files.length}));
if(result!=="PASS") process.exitCode=1;
