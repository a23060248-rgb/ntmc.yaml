import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  TASK_ID,
  TASK_REPO_PREFIX,
  TASK_MANIFEST_REPO_PATH,
  compareCodePoints,
  jcs,
  recomputeManifestHash,
} from "./validate-production.mjs";

const taskRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productRoot = path.resolve(taskRoot, "..", "..", "..");
const gitRoot = path.resolve(productRoot, "..");
const manifestPath = path.join(taskRoot, "task-artifact-manifest.json");
const expectedTaskRoot = path.resolve(
  "C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統/.codex/tasks",
  TASK_ID,
);

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function need(condition, code) {
  if (!condition) throw new Error(code);
}

function listFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const currentStat = fs.lstatSync(current);
    need(!currentStat.isSymbolicLink(), "TASK_MANIFEST_REPARSE_POINT");
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      need(!entry.isSymbolicLink(), "TASK_MANIFEST_REPARSE_POINT");
      if (entry.isDirectory()) stack.push(absolute);
      else {
        need(entry.isFile(), "TASK_MANIFEST_NON_FILE_ENTRY");
        files.push(absolute);
      }
    }
  }
  return files;
}

function repositoryPath(absolute) {
  const value = path.relative(gitRoot, absolute).split(path.sep).join("/");
  need(value.normalize("NFC") === value, "TASK_MANIFEST_PATH_NOT_NFC");
  need(value.startsWith(TASK_REPO_PREFIX), "TASK_MANIFEST_PATH_SCOPE_MISMATCH");
  need(!value.includes("\\"), "TASK_MANIFEST_BACKSLASH");
  need(
    !value.split("/").some((segment) => ["", ".", ".."].includes(segment)),
    "TASK_MANIFEST_TRAVERSAL",
  );
  need(
    !value.split("/").some((segment) =>
      segment.toLocaleLowerCase("en-US").startsWith(".env")),
    "TASK_MANIFEST_FORBIDDEN_ENV_PATH",
  );
  return value;
}

function buildManifest() {
  need(taskRoot === expectedTaskRoot, "TASK_ROOT_BINDING_MISMATCH");
  const entries = listFiles(taskRoot)
    .filter((absolute) => path.resolve(absolute) !== manifestPath)
    .map((absolute) => {
      const bytes = fs.readFileSync(absolute);
      return {
        repository_relative_path: repositoryPath(absolute),
        bytes: bytes.length,
        sha256: sha256(bytes),
      };
    })
    .sort((left, right) =>
      compareCodePoints(
        left.repository_relative_path,
        right.repository_relative_path,
      ));
  const collision = new Set();
  for (let index = 0; index < entries.length; index += 1) {
    if (index > 0) {
      need(
        compareCodePoints(
          entries[index - 1].repository_relative_path,
          entries[index].repository_relative_path,
        ) < 0,
        "TASK_MANIFEST_ORDER_OR_DUPLICATE",
      );
    }
    const key = entries[index].repository_relative_path
      .normalize("NFC")
      .toLocaleLowerCase("en-US");
    need(!collision.has(key), "TASK_MANIFEST_CASE_OR_NFC_COLLISION");
    collision.add(key);
  }
  const manifest = {
    schema_version: 2,
    task_id: TASK_ID,
    generation_order: "LAST_AFTER_HANDOFF_FREEZE",
    assurance: "INTERNAL_CONSISTENCY_ONLY",
    authority_boundary: {
      external_immutable_binding_status: "NOT_PROVIDED",
      human_identity_claimed: false,
      adopted_authority_claimed: false,
    },
    self_path: TASK_MANIFEST_REPO_PATH,
    self_exclusion: {
      excluded_path: TASK_MANIFEST_REPO_PATH,
      reason: "SELF_REFERENCE_AVOIDANCE",
      self_entry_present: false,
    },
    path_scope: "REPOSITORY_RELATIVE_WITHIN_EXACT_TASK_ROOT",
    path_sort: "UNICODE_NFC_ORDINAL_CODE_POINT",
    canonicalization: "RFC8785_JCS",
    hash_contract:
      "SHA256_OF_RFC8785_JCS_MANIFEST_CORE_OMITTING_MANIFEST_SHA256",
    entry_count: entries.length,
    physical_file_count: entries.length + 1,
    entries,
  };
  manifest.manifest_sha256 = recomputeManifestHash(manifest);
  return manifest;
}

function writeManifest() {
  const manifest = buildManifest();
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const readBack = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  need(
    recomputeManifestHash(readBack) === readBack.manifest_sha256,
    "TASK_MANIFEST_READ_BACK_HASH_MISMATCH",
  );
  need(
    jcs(readBack).length > 0 &&
      readBack.entry_count === buildManifest().entry_count,
    "TASK_MANIFEST_READ_BACK_COUNT_MISMATCH",
  );
  return readBack;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invoked === fileURLToPath(import.meta.url)) {
  try {
    const manifest = writeManifest();
    process.stdout.write(
      `${JSON.stringify({
        task_id: TASK_ID,
        manifest_generation_status: "GENERATED_AND_READ_BACK",
        manifest_sha256: manifest.manifest_sha256,
        entry_count: manifest.entry_count,
        physical_file_count: manifest.physical_file_count,
        assurance: manifest.assurance,
      }, null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

export { buildManifest, writeManifest };
