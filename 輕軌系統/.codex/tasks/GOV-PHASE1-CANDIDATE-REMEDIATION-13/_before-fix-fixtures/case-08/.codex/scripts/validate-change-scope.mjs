import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateRelativeRef } from "./lib/path-safety.mjs";
import { validatePathsAgainstEffectiveScope } from "./lib/governance/scope-lattice.mjs";
import { validateTask } from "./validate-task.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..", "..");

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith("--") || argv[index + 1] === undefined) throw new Error("Arguments must be --key value pairs.");
    result[argv[index].slice(2)] = argv[index + 1];
  }
  return result;
}

export function validateChangedPaths({ paths, productPrefix, effectiveWritePaths }) {
  const errors = [];
  const productRefs = [];
  const forbiddenExtensions = /\.(?:dump|bak|backup|exe|dll|bin|pfx|p12|pem|key|zip|7z)$/i;
  for (const repoPath of [...new Set(paths)].sort()) {
    const normalized = repoPath.replaceAll("\\", "/").replace(/^\.\//, "");
    if (!normalized.startsWith(`${productPrefix}/`)) { errors.push(`OUTSIDE_PRODUCT ${normalized}`); continue; }
    const productRef = normalized.slice(productPrefix.length + 1);
    try { validateRelativeRef(productRef); } catch (error) { errors.push(`UNSAFE_PATH ${normalized}: ${error.message}`); continue; }
    if (/^\.env(?:\.|$)|\/\.env(?:\.|$)/i.test(productRef)) errors.push(`DOTENV ${normalized}`);
    if (forbiddenExtensions.test(productRef) || /(?:credential|credentials)[^/]*$/i.test(productRef)) errors.push(`FORBIDDEN_EVIDENCE ${normalized}`);
    productRefs.push(productRef);
  }
  errors.push(...validatePathsAgainstEffectiveScope(productRefs, effectiveWritePaths));
  return errors;
}

function gitPaths(gitRoot, args) {
  const output = execFileSync("git", ["-c", `safe.directory=${gitRoot.replaceAll("\\", "/")}`, "-C", gitRoot, ...args], { encoding: "buffer", windowsHide: true });
  return output.toString("utf8").split("\0").filter(Boolean);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!/^[A-Z][A-Z0-9-]{2,63}$/.test(args["task-id"] ?? "")) throw new Error("--task-id is required and invalid.");
  const validation = await validateTask(args["task-id"], { projectRoot });
  if (validation.errors.length) throw new Error(`Task structure is invalid; change-scope validation refused (${validation.errors.length} errors).`);
  if (!validation.actorScope?.actor_role || !validation.actorScope.effective_write_paths.length) throw new Error("Exact actor role could not be resolved from the validated Task handoff.");
  if (args.role && args.role !== validation.actorScope.actor_role) throw new Error(`Role ${args.role} does not match validated Task actor ${validation.actorScope.actor_role}.`);
  const effectiveWritePaths = validation.actorScope.effective_write_paths;
  const gitRoot = path.dirname(projectRoot), productPrefix = path.basename(projectRoot);
  const staged = gitPaths(gitRoot, ["diff", "--cached", "--name-only", "-z", "--", `${productPrefix}/AGENTS.md`, `${productPrefix}/.agents`, `${productPrefix}/.codex`]);
  const unstaged = gitPaths(gitRoot, ["diff", "--name-only", "-z", "--", `${productPrefix}/AGENTS.md`, `${productPrefix}/.agents`, `${productPrefix}/.codex`]);
  const untracked = gitPaths(gitRoot, ["ls-files", "--others", "--exclude-standard", "-z", "--", `${productPrefix}/AGENTS.md`, `${productPrefix}/.agents`, `${productPrefix}/.codex`]);
  const errors = validateChangedPaths({ paths: [...staged, ...unstaged, ...untracked], productPrefix, effectiveWritePaths });
  const manifest = JSON.parse(await (await import("node:fs/promises")).readFile(path.join(projectRoot, ".codex", "governance", "governance-commit-manifest.yaml"), "utf8"));
  const expected = new Set((manifest.artifacts ?? []).map((item) => item.path));
  const stagedRefs = new Set(staged.map((item) => item.replaceAll("\\", "/").slice(productPrefix.length + 1)));
  if (stagedRefs.size) {
    for (const ref of stagedRefs) if (!expected.has(ref)) errors.push(`STAGED_NOT_IN_COMMIT_MANIFEST ${ref}`);
    for (const ref of expected) if (!stagedRefs.has(ref)) errors.push(`COMMIT_MANIFEST_PATH_NOT_STAGED ${ref}`);
  }
  for (const error of errors) console.error(`CHANGE_SCOPE_ERROR ${error}`);
  if (errors.length) process.exit(1);
  console.log(`CHANGE_SCOPE_OK files=${new Set([...staged, ...unstaged, ...untracked]).size} staged_manifest_mode=${stagedRefs.size ? "EXACT_SCOPE_COMPARISON_ONLY" : "NOT_A_COMMIT_CANDIDATE"} scope_source=computeEffectiveScope actor_role=${validation.actorScope.actor_role} actor_binding=${validation.actorScope.binding} branch_or_worktree_restriction=false proof_created=false`);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main();
