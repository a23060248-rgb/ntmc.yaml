import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const taskRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const human = JSON.parse(
  fs.readFileSync(path.join(taskRoot, "human-decision-binding.json"), "utf8"),
);

function validateExactBinding(actualHead, actualBranch) {
  if (actualHead !== human.parent_head) {
    throw new Error("BOUND_PARENT_HEAD_MISMATCH");
  }
  if (actualBranch !== human.target_branch) {
    throw new Error("BOUND_TARGET_BRANCH_MISMATCH");
  }
  return true;
}

let rejected = false;
let rejectionCode = null;
try {
  validateExactBinding(
    "0000000000000000000000000000000000000000",
    human.target_branch,
  );
} catch (error) {
  rejected = true;
  rejectionCode = error.message;
}

if (!rejected || rejectionCode !== "BOUND_PARENT_HEAD_MISMATCH") {
  throw new Error("Safety rejection case failed");
}

console.log(JSON.stringify({
  safety_rejection_test: "PASS",
  simulated_condition: "BOUND_PARENT_HEAD_MISMATCH",
  rejection_code: rejectionCode,
  files_modified: 0,
  git_mutation: "NO",
}, null, 2));
