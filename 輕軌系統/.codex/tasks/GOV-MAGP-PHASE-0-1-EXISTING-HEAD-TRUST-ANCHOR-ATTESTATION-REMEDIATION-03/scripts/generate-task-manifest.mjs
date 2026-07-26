import fs from "node:fs";
import path from "node:path";
import {
  TASK_ID,
  taskRoot,
  gitRoot,
  taskRepoPrefix,
  taskManifestRepoPath,
  ensureRoots,
  need,
  posix,
  sha256,
  compareCodePoints,
  secureRead,
  secureJson,
  listFilesStrict,
  validateRepoPath,
  taskManifestHash,
} from "./lib.mjs";

export function buildTaskManifest() {
  ensureRoots();
  const entries = listFilesStrict(taskRoot, "FINAL_TASK_TREE")
    .filter((absolute) =>
      posix(path.relative(gitRoot, absolute)) !== taskManifestRepoPath)
    .map((absolute) => {
      const read = secureRead(absolute, taskRoot, "FINAL_TASK_ENTRY");
      return {
        repository_relative_path: posix(path.relative(gitRoot, absolute)),
        bytes: read.bytes.length,
        sha256: sha256(read.bytes),
      };
    })
    .sort((left, right) =>
      compareCodePoints(
        left.repository_relative_path,
        right.repository_relative_path,
      ));
  let previous = null;
  const collisions = new Set();
  for (const entry of entries) {
    validateRepoPath(entry.repository_relative_path, taskRepoPrefix);
    need(
      previous === null ||
        compareCodePoints(previous, entry.repository_relative_path) < 0,
      "FINAL_TASK_MANIFEST_ORDER_INVALID",
    );
    previous = entry.repository_relative_path;
    const collision = entry.repository_relative_path
      .normalize("NFC")
      .toLocaleLowerCase("en-US");
    need(!collisions.has(collision), "FINAL_TASK_MANIFEST_CASE_OR_NFC_COLLISION");
    collisions.add(collision);
  }
  const manifest = {
    schema_version: 1,
    task_id: TASK_ID,
    freeze_stage: "STAGE_B_FINAL_PACKAGE_FREEZE",
    generation_order: "LAST_AFTER_HANDOFF_SUMMARY_AND_ALL_EVIDENCE",
    self_exclusion: {
      excluded_path: taskManifestRepoPath,
      reason: "SELF_REFERENCE_AVOIDANCE",
      self_entry_present: false,
    },
    path_scope: "REPOSITORY_RELATIVE_WITHIN_EXACT_TASK_ROOT",
    path_sort: "UNICODE_NFC_ORDINAL_CODE_POINT",
    canonicalization: "RFC8785_JCS",
    hash_contract:
      "SHA256_OF_RFC8785_JCS_CORE_OMITTING_INTERNAL_MANIFEST_SHA256",
    entry_count: entries.length,
    physical_file_count: entries.length + 1,
    entries,
  };
  manifest.internal_manifest_sha256 = taskManifestHash(manifest);
  return manifest;
}

export function writeTaskManifest() {
  const absolute = path.join(taskRoot, "task-artifact-manifest.json");
  const manifest = buildTaskManifest();
  fs.writeFileSync(absolute, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

export function verifyTaskManifest() {
  const absolute = path.join(taskRoot, "task-artifact-manifest.json");
  const read = secureJson(absolute, taskRoot, "FINAL_TASK_MANIFEST");
  const manifest = read.value;
  need(manifest.schema_version === 1, "FINAL_TASK_MANIFEST_SCHEMA_INVALID");
  need(manifest.task_id === TASK_ID, "FINAL_TASK_MANIFEST_TASK_ID_INVALID");
  need(manifest.freeze_stage === "STAGE_B_FINAL_PACKAGE_FREEZE",
    "FINAL_TASK_MANIFEST_STAGE_INVALID");
  need(manifest.self_exclusion?.excluded_path === taskManifestRepoPath &&
    manifest.self_exclusion?.self_entry_present === false,
  "FINAL_TASK_MANIFEST_SELF_EXCLUSION_INVALID");
  need(manifest.entry_count === manifest.entries.length,
    "FINAL_TASK_MANIFEST_ENTRY_COUNT_INVALID");
  need(manifest.physical_file_count === manifest.entry_count + 1,
    "FINAL_TASK_MANIFEST_PHYSICAL_COUNT_INVALID");
  let previous = null;
  const declared = new Map();
  for (const entry of manifest.entries) {
    validateRepoPath(entry.repository_relative_path, taskRepoPrefix);
    need(entry.repository_relative_path !== taskManifestRepoPath,
      "FINAL_TASK_MANIFEST_SELF_INCLUDED");
    need(
      previous === null ||
        compareCodePoints(previous, entry.repository_relative_path) < 0,
      "FINAL_TASK_MANIFEST_ORDER_INVALID",
    );
    previous = entry.repository_relative_path;
    need(!declared.has(entry.repository_relative_path),
      "FINAL_TASK_MANIFEST_DUPLICATE_PATH");
    declared.set(entry.repository_relative_path, entry);
    const entryAbsolute = path.join(
      gitRoot,
      ...entry.repository_relative_path.split("/"),
    );
    const entryRead = secureRead(entryAbsolute, taskRoot, "FINAL_TASK_ENTRY");
    need(entryRead.bytes.length === entry.bytes,
      "FINAL_TASK_MANIFEST_BYTES_MISMATCH");
    need(sha256(entryRead.bytes) === entry.sha256,
      "FINAL_TASK_MANIFEST_HASH_MISMATCH");
  }
  const actual = listFilesStrict(taskRoot, "FINAL_TASK_TREE");
  need(actual.length === manifest.physical_file_count,
    "FINAL_TASK_MANIFEST_ACTUAL_PHYSICAL_COUNT_MISMATCH");
  need(taskManifestHash(manifest) === manifest.internal_manifest_sha256,
    "FINAL_TASK_MANIFEST_INTERNAL_HASH_MISMATCH");
  return {
    manifest,
    external_file_sha256: sha256(read.bytes),
    physical_file_count: actual.length,
  };
}
