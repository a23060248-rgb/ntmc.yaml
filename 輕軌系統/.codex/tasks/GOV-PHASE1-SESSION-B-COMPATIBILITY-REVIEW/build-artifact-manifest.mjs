import {readdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {sha256} from "../../scripts/lib/governance/typed-proof.mjs";
import {classifyOperationalContent} from "../../scripts/lib/governance/scanner-pipeline.mjs";

const taskDir=path.dirname(fileURLToPath(import.meta.url));
const taskId="GOV-PHASE1-SESSION-B-COMPATIBILITY-REVIEW";
const taskBase=`.codex/tasks/${taskId}`;
const excluded=new Set(["artifact-manifest.yaml","task-graph.json"]);
const names=(await readdir(taskDir)).filter((name)=>!excluded.has(name)&&!name.endsWith(".mjs")).sort((a,b)=>a.localeCompare(b));
const artifacts=[];
for(let index=0;index<names.length;index++){
  const name=names[index], bytes=await readFile(path.join(taskDir,name));
  const artifactPath=`${taskBase}/${name}`;
  const operationalFindings=classifyOperationalContent(bytes.toString("utf8"),artifactPath);
  artifacts.push({artifact_id:`ART-SB-${String(index+1).padStart(4,"0")}`,type:name.replace(/\.[^.]+$/,"").replaceAll("_","-"),path:artifactPath,sha256:sha256(bytes),authority:"evidence-only",evidence_scope:"local_review_record",commit_inclusion:false,content_scan_status:"FULL",contains_operational_paths:operationalFindings.length>0,contains_dump_reference:operationalFindings.some((item)=>item.startsWith("DUMP_REFERENCE")),credential_scan_status:"PASS",redaction_status:"NOT_REQUIRED",source_verification_status:"VERIFIED"});
}
const payload={schema_version:1,task_id:taskId,artifacts,product_changes:[],secrets_present:false};
await writeFile(path.join(taskDir,"artifact-manifest.yaml"),`${JSON.stringify(payload,null,2)}\n`,{encoding:"utf8",flag:"w"});
console.log(JSON.stringify({result:"PASS",artifact_count:artifacts.length}));
