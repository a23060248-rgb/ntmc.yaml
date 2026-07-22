import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const before = JSON.parse(await readFile(path.join(taskDir, "review-baseline-before.json"), "utf8"));
const after = JSON.parse(await readFile(path.join(taskDir, "review-baseline-after.json"), "utf8"));
const key = (item) => `${item.artifact_type}|${item.relative_path}`;
const beforeMap = new Map(before.files.map((item) => [key(item), item]));
const afterMap = new Map(after.files.map((item) => [key(item), item]));
const types = ["candidate-artifact", "frozen-history", "remediation-8", "review-a8", "remediation-9", "review-a9", "migration-320-task", "migration-320-external-evidence"];

function changesFor(type) {
  const ids = [...new Set([...before.files.filter((item) => item.artifact_type === type).map(key), ...after.files.filter((item) => item.artifact_type === type).map(key)])].sort();
  const added = [], deleted = [], modified = [];
  let unchangedCount = 0;
  for (const id of ids) {
    const left = beforeMap.get(id), right = afterMap.get(id);
    if (!left) added.push(right);
    else if (!right) deleted.push(left);
    else if (left.sha256 !== right.sha256 || left.byte_size !== right.byte_size) modified.push({relative_path: left.relative_path, before_byte_size: left.byte_size, after_byte_size: right.byte_size, before_sha256: left.sha256, after_sha256: right.sha256});
    else unchangedCount += 1;
  }
  return {before_count: ids.length - added.length, after_count: ids.length - deleted.length, added, deleted, modified, unchanged_count: unchangedCount, identical: added.length === 0 && deleted.length === 0 && modified.length === 0};
}

const byType = Object.fromEntries(types.map((type) => [type, changesFor(type)]));
const identical = Object.values(byType).every((item) => item.identical) && JSON.stringify(before.candidate) === JSON.stringify(after.candidate);
const result = {schema_version:1, task_id:"GOV-PHASE1-L3-REVIEW-A10", result:identical ? "PASS" : "FAIL", identical, candidate_binding_identical:JSON.stringify(before.candidate) === JSON.stringify(after.candidate), by_artifact_type:byType, git_diff_used:false};
await writeFile(path.join(taskDir, "baseline-comparison.json"), `${JSON.stringify(result, null, 2)}\n`, {encoding:"utf8", flag:"wx"});
console.log(JSON.stringify({result:result.result, identical:result.identical, counts:Object.fromEntries(types.map((type) => [type, byType[type].unchanged_count]))}));
if (!identical) process.exit(1);
