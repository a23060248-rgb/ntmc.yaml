import {lstat, readdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {safeExistingPath} from "../../scripts/lib/path-safety.mjs";
import {sha256} from "../../scripts/lib/governance/typed-proof.mjs";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, "../../..");
const taskId = "GOV-PHASE1-SESSION-B-COMPATIBILITY-REVIEW";
const outputName = process.argv[2] ?? "review-baseline-before.json";
const priorRef = ".codex/tasks/GOV-PHASE1-L3-REVIEW-A10/review-baseline-after.json";
const prior = JSON.parse(await readFile(await safeExistingPath(root, priorRef), "utf8"));
if (prior.files?.length !== 741 || prior.candidate?.file_count !== 103) throw new Error("A10_BASELINE_EXPECTED_741_WITH_103_CANDIDATE");

async function record(relativePath, artifactType) {
  const bytes = await readFile(await safeExistingPath(root, relativePath));
  return {relative_path:relativePath, byte_size:bytes.length, sha256:sha256(bytes), artifact_type:artifactType};
}

const files = [];
async function collectTree(relativePath, artifactType) {
  const absolute = await safeExistingPath(root, relativePath);
  const stat = await lstat(absolute);
  if (stat.isDirectory()) {
    for (const name of (await readdir(absolute)).sort((a,b)=>a.localeCompare(b))) await collectTree(path.posix.join(relativePath,name),artifactType);
    return;
  }
  if (!stat.isFile()) throw new Error(`UNSUPPORTED_A10_ENTRY:${relativePath}`);
  files.push(await record(relativePath,artifactType));
}
for (const item of prior.files) files.push(await record(item.relative_path, item.artifact_type));
const a10Ref = ".codex/tasks/GOV-PHASE1-L3-REVIEW-A10";
const excludedA10 = new Set(["HANDOFF.md", "implementation-handoff.yaml", "implementation-plan.md"]);
for (const name of (await readdir(await safeExistingPath(root, a10Ref))).sort((a,b)=>a.localeCompare(b))) {
  if (excludedA10.has(name)) continue;
  const ref = path.posix.join(a10Ref, name);
  await collectTree(ref,"review-a10-formal");
}
files.sort((a,b)=>`${a.artifact_type}|${a.relative_path}`.localeCompare(`${b.artifact_type}|${b.relative_path}`));
const counts = {};
for (const item of files) counts[item.artifact_type] = (counts[item.artifact_type] ?? 0) + 1;
counts.total = files.length;
if (counts["candidate-artifact"] !== 103 || counts["review-a10-formal"] < 40) throw new Error("SESSION_B_BASELINE_COUNT_INVALID");

const payload = {
  schema_version:1,
  task_id:taskId,
  baseline_role:outputName.includes("after") ? "after" : "before",
  root_token:"${PRODUCT_ROOT}",
  review_task_excluded:`.codex/tasks/${taskId}/**`,
  git_diff_used:false,
  exclusions:[".env*", "collab/**", "frontend/**", "erp-api/**", "db-design/**", "migration/**", "parent directories", "sibling directories"],
  candidate:prior.candidate,
  inherited_a10_baseline_ref:priorRef,
  inherited_a10_baseline_file_count:prior.files.length,
  a10_formal_exclusions:[...excludedA10].sort(),
  counts,
  files
};
await writeFile(path.join(taskDir, outputName), `${JSON.stringify(payload,null,2)}\n`, {encoding:"utf8",flag:"wx"});
console.log(JSON.stringify({output:outputName,counts,candidate:payload.candidate}));
