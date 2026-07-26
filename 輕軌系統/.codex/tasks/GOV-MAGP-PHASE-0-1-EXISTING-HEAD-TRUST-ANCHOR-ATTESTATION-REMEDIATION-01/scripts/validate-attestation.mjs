import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TASK_ID =
  "GOV-MAGP-PHASE-0-1-EXISTING-HEAD-TRUST-ANCHOR-ATTESTATION-REMEDIATION-01";
const EXPECTED_PRODUCT_ROOT =
  "C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統";
const EXPECTED_GIT_ROOT = "C:/Users/a2306/Desktop/code/ntmc.yaml";
const PRODUCT_PREFIX = "輕軌系統/";
const EXPECTED_HEAD = "22baa18784a081dd8c0d8a3ce177ba00363251de";
const EXPECTED_BRANCH = "codex/precheck-template-maintenance";
const EXPECTED_PATH_COUNT = 147;
const EXPECTED_SOURCE_PARTITION_COUNT = 106;
const EXPECTED_ATTEMPT_PARTITION_COUNT = 41;
const EXPECTED_HEAD_BINDING_SHA256 =
  "529AE67219F970C5B3AFDD694D51384F5DC4290E3D13B36B3416946D25C2977D";
const EXPECTED_BRANCH_BINDING_SHA256 =
  "6C1B53839F433463CCCA131A09A8DB3EE3B5387F0F2CCB67DCDE437984C2768D";
const EXPECTED_SOURCE_MANIFEST_SHA256 =
  "5CE80FC02491E66701D9D5573DB3123561FE41C74BABE7C0D0F5496404207685";
const EXPECTED_DEPENDENCY_SOURCE_SHA256 =
  "B320CEC8FAC46723D6BFD2D9726357A959DA14D1E8C06FD01D27037928F619E6";
const EXPECTED_CANDIDATE_MANIFEST_SHA256 =
  "2C01A85E3348B174B7BFB1F3F1D0A26CAB485423297252C7C7F4F35C65702E5D";
const EXPECTED_HISTORICAL_BASELINES = {
  proposal_01: {
    task_id: "GOV-MAGP-PHASE-0-1-GIT-TRUST-ANCHOR-PROPOSAL-01",
    file_count: 19,
    manifest_sha256:
      "487E221D9BE82E9F1E9A5F6A30D53711354B36DECFEDA14EE262D49B139835B7",
  },
  proposal_02: {
    task_id: "GOV-MAGP-PHASE-0-1-GIT-TRUST-ANCHOR-PROPOSAL-02",
    file_count: 23,
    manifest_sha256:
      "3D763DD0EFB76403D9AC8E64EA74B6BFF4ACD602C0650378FD87DA3243BA1FC4",
  },
  commit_01: {
    task_id: "GOV-MAGP-PHASE-0-1-GIT-TRUST-ANCHOR-COMMIT-01",
    file_count: 16,
    manifest_sha256:
      "F2DB3ACA49A667704C221F35C36964C7F0C2A7BBFA016230F41A08BA69CF41F5",
  },
};

const taskRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productRoot = path.resolve(taskRoot, "..", "..", "..");
const gitRoot = path.resolve(productRoot, "..");
const taskRelativePath =
  `.codex/tasks/${TASK_ID}/**`;
const sourceManifestPath = path.join(
  productRoot,
  ".codex",
  "tasks",
  "GOV-MAGP-PHASE-0-1-GIT-TRUST-ANCHOR-PROPOSAL-02",
  "exact-commit-paths.json",
);
const dependencySourcePath = path.join(
  productRoot,
  ".codex",
  "tasks",
  "GOV-MAGP-PHASE-0-1-GIT-TRUST-ANCHOR-PROPOSAL-02",
  "dependency-closure.json",
);
const phasePolicyPath = path.join(
  productRoot,
  ".codex",
  "governance",
  "phase-policy.yaml",
);
const safeDirectory = `safe.directory=${EXPECTED_GIT_ROOT}`;

class ValidationError extends Error {
  constructor(code, detail = null) {
    super(code);
    this.name = "ValidationError";
    this.code = code;
    this.detail = detail;
  }
}

function need(condition, code, detail = null) {
  if (!condition) throw new ValidationError(code, detail);
}

function posix(value) {
  return value.split(path.sep).join("/");
}

function ordinalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex").toUpperCase();
}

function exactStringBinding(value) {
  return sha256(Buffer.from(value, "utf8"));
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort(ordinalCompare)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function canonicalObjectBinding(value) {
  return sha256(Buffer.from(canonicalJson(value), "utf8"));
}

function readJson(absolutePath, code) {
  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    throw new ValidationError(code, {
      path: posix(absolutePath),
      error: error.message,
    });
  }
}

function git(args, {
  input = undefined,
  allowedExitCodes = [0],
  encoding = null,
} = {}) {
  const result = spawnSync(
    "git",
    ["-c", safeDirectory, "-C", EXPECTED_GIT_ROOT, ...args],
    {
      input,
      encoding,
      windowsHide: true,
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  need(
    allowedExitCodes.includes(result.status),
    "READ_ONLY_GIT_QUERY_FAILED",
    {
      args,
      status: result.status,
      stderr: Buffer.isBuffer(result.stderr)
        ? result.stderr.toString("utf8")
        : result.stderr,
    },
  );
  return result;
}

function gitText(args, options = {}) {
  const result = git(args, { ...options, encoding: "utf8" });
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function gitConfig(name) {
  const result = gitText(["config", "--get", name], {
    allowedExitCodes: [0, 1],
  });
  return result.status === 0 ? result.stdout : null;
}

function batch(items, size = 20) {
  const groups = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function batchedGitBuffer(prefix, paths) {
  const outputs = [];
  for (const group of batch(paths)) {
    outputs.push(git([...prefix, "--", ...group]).stdout);
  }
  return Buffer.concat(outputs);
}

function parseZeroList(buffer) {
  return buffer.toString("utf8").split("\0").filter(Boolean);
}

function parseIndex(buffer) {
  const rows = [];
  for (const record of parseZeroList(buffer)) {
    const match = record.match(/^(\d{6}) ([0-9a-f]+) (\d)\t([\s\S]+)$/);
    need(Boolean(match), "INDEX_ENTRY_PARSE_FAILURE", { record });
    rows.push({
      mode: match[1],
      oid: match[2],
      stage: Number(match[3]),
      repository_relative_path: match[4],
    });
  }
  return rows;
}

function parseTree(buffer) {
  const rows = [];
  for (const record of parseZeroList(buffer)) {
    const match = record.match(/^(\d{6}) ([^ ]+) ([0-9a-f]+)\t([\s\S]+)$/);
    need(Boolean(match), "HEAD_TREE_ENTRY_PARSE_FAILURE", { record });
    rows.push({
      mode: match[1],
      type: match[2],
      oid: match[3],
      repository_relative_path: match[4],
    });
  }
  return rows;
}

function parseStatus(buffer) {
  const fields = buffer.toString("utf8").split("\0");
  const rows = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (!field) continue;
    const row = {
      xy: field.slice(0, 2),
      repository_relative_path: field.slice(3),
    };
    if (/[RC]/.test(row.xy) && fields[index + 1]) {
      row.rename_or_copy_source = fields[index + 1];
      index += 1;
    }
    rows.push(row);
  }
  return rows;
}

function parseCheckIgnore(buffer) {
  const fields = buffer.toString("utf8").split("\0").filter(Boolean);
  need(fields.length % 4 === 0, "CHECK_IGNORE_PARSE_FAILURE", {
    field_count: fields.length,
  });
  const rows = [];
  for (let index = 0; index < fields.length; index += 4) {
    rows.push({
      rule_source: fields[index],
      rule_line: Number(fields[index + 1]),
      rule_pattern: fields[index + 2],
      repository_relative_path: fields[index + 3],
    });
  }
  return rows;
}

function parseCheckAttr(buffer) {
  const fields = buffer.toString("utf8").split("\0").filter(Boolean);
  need(fields.length % 3 === 0, "CHECK_ATTR_PARSE_FAILURE", {
    field_count: fields.length,
  });
  const map = new Map();
  for (let index = 0; index < fields.length; index += 3) {
    const filePath = fields[index];
    const attribute = fields[index + 1];
    const value = fields[index + 2];
    if (!map.has(filePath)) map.set(filePath, {});
    map.get(filePath)[attribute] = value;
  }
  return map;
}

function gitBlobOid(algorithm, bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
  return crypto
    .createHash(algorithm)
    .update(Buffer.concat([header, bytes]))
    .digest("hex");
}

function listFilesStrict(root, codePrefix) {
  need(fs.existsSync(root), `${codePrefix}_ROOT_MISSING`, { root: posix(root) });
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      const relative = posix(path.relative(root, absolute));
      need(
        !relative.split("/").some((segment) => segment.toLowerCase().startsWith(".env")),
        `${codePrefix}_FORBIDDEN_ENV_PATH`,
        { relative_path: relative },
      );
      need(!entry.isSymbolicLink(), `${codePrefix}_SYMLINK_NOT_ALLOWED`, {
        relative_path: relative,
      });
      if (entry.isDirectory()) stack.push(absolute);
      else {
        need(entry.isFile(), `${codePrefix}_NON_FILE_ENTRY`, {
          relative_path: relative,
        });
        files.push(absolute);
      }
    }
  }
  return files.sort((left, right) => ordinalCompare(posix(left), posix(right)));
}

function digestTree(root, codePrefix) {
  const entries = listFilesStrict(root, codePrefix)
    .map((absolute) => {
      const bytes = fs.readFileSync(absolute);
      return {
        relative_path: posix(path.relative(root, absolute)),
        sha256: sha256(bytes),
        bytes: bytes.length,
      };
    })
    .sort((left, right) => ordinalCompare(left.relative_path, right.relative_path));
  const canonical = entries
    .map((entry) => `${entry.relative_path}|${entry.sha256}|${entry.bytes}`)
    .join("\n");
  return {
    file_count: entries.length,
    manifest_sha256: sha256(Buffer.from(canonical, "utf8")),
    entries,
  };
}

function digestCandidateEntries(entries) {
  const canonical = [...entries]
    .sort((left, right) =>
      ordinalCompare(left.repository_relative_path, right.repository_relative_path))
    .map((entry) =>
      `${entry.repository_relative_path}|${entry.sha256}|${entry.file_size_bytes}`)
    .join("\n");
  return sha256(Buffer.from(canonical, "utf8"));
}

function validateRepositoryRelativePath(value) {
  need(typeof value === "string" && value.length > 0, "PATH_NOT_STRING");
  need(!value.includes("\0"), "PATH_CONTAINS_NUL", { path: value });
  need(!value.includes("\\"), "PATH_CONTAINS_BACKSLASH", { path: value });
  need(!value.startsWith("//"), "UNC_PATH_NOT_ALLOWED", { path: value });
  need(!/^[A-Za-z]:/.test(value), "DRIVE_PATH_NOT_ALLOWED", { path: value });
  need(!path.posix.isAbsolute(value), "ABSOLUTE_PATH_NOT_ALLOWED", { path: value });
  need(value.normalize("NFC") === value, "PATH_NOT_NFC", { path: value });
  const segments = value.split("/");
  need(!segments.some((segment) => segment === "" || segment === "." || segment === ".."),
    "PATH_TRAVERSAL_OR_EMPTY_SEGMENT",
    { path: value });
  need(value.startsWith(PRODUCT_PREFIX), "PATH_OUTSIDE_PRODUCT_ROOT", {
    path: value,
  });
  need(
    !segments.some((segment) => segment.toLowerCase().startsWith(".env")),
    "FORBIDDEN_ENV_PATH",
    { path: value },
  );
}

function applyFixture(source, fixture) {
  const exact = structuredClone(source);
  if (!fixture) return exact;
  if (fixture.remove_path) {
    exact.files = exact.files.filter(
      (entry) => entry.repository_relative_path !== fixture.remove_path,
    );
  }
  if (fixture.add_entry) exact.files.push(structuredClone(fixture.add_entry));
  if (fixture.duplicate_path) {
    const entry = exact.files.find(
      (candidate) => candidate.repository_relative_path === fixture.duplicate_path,
    );
    need(Boolean(entry), "FIXTURE_TARGET_NOT_FOUND", {
      duplicate_path: fixture.duplicate_path,
    });
    exact.files.push(structuredClone(entry));
  }
  if (fixture.replace_path) {
    need(exact.files.length > 0, "FIXTURE_EMPTY_SOURCE");
    exact.files[0].repository_relative_path = fixture.replace_path;
    exact.files[0].nfc_repository_relative_path =
      fixture.replace_path.normalize("NFC");
  }
  if (fixture.override_file_sha256) {
    const entry = exact.files.find(
      (candidate) =>
        candidate.repository_relative_path ===
          fixture.override_file_sha256.repository_relative_path,
    );
    need(Boolean(entry), "FIXTURE_TARGET_NOT_FOUND", {
      override_file_sha256: fixture.override_file_sha256,
    });
    entry.sha256 = fixture.override_file_sha256.sha256;
  }
  if (fixture.override_blob_oid) {
    const entry = exact.files.find(
      (candidate) =>
        candidate.repository_relative_path ===
          fixture.override_blob_oid.repository_relative_path,
    );
    need(Boolean(entry), "FIXTURE_TARGET_NOT_FOUND", {
      override_blob_oid: fixture.override_blob_oid,
    });
    entry.git_state.tracked_oid = fixture.override_blob_oid.oid;
  }
  return exact;
}

function loadFixture(fixturePath) {
  if (!fixturePath) return null;
  const resolved = path.resolve(fixturePath);
  const relative = path.relative(taskRoot, resolved);
  need(
    relative !== "" &&
      !relative.startsWith("..") &&
      !path.isAbsolute(relative),
    "FIXTURE_OUTSIDE_TASK_ROOT",
    { fixture_path: posix(resolved) },
  );
  return readJson(resolved, "FIXTURE_INVALID_JSON");
}

function verifyHistoricalBaselines() {
  const results = {};
  for (const [key, expected] of Object.entries(EXPECTED_HISTORICAL_BASELINES)) {
    const root = path.join(productRoot, ".codex", "tasks", expected.task_id);
    const actual = digestTree(root, `HISTORICAL_${key.toUpperCase()}`);
    need(
      actual.file_count === expected.file_count,
      "HISTORICAL_FILE_COUNT_MISMATCH",
      { key, expected: expected.file_count, actual: actual.file_count },
    );
    need(
      actual.manifest_sha256 === expected.manifest_sha256,
      "HISTORICAL_MANIFEST_MISMATCH",
      {
        key,
        expected: expected.manifest_sha256,
        actual: actual.manifest_sha256,
      },
    );
    results[key] = {
      task_id: expected.task_id,
      file_count: actual.file_count,
      manifest_sha256: actual.manifest_sha256,
      status: "MATCH",
    };
  }
  return results;
}

function verifyDependencyClosure(sourceExact) {
  const dependencyBytes = fs.readFileSync(dependencySourcePath);
  const dependencySha256 = sha256(dependencyBytes);
  need(
    dependencySha256 === EXPECTED_DEPENDENCY_SOURCE_SHA256,
    "DEPENDENCY_SOURCE_SHA256_MISMATCH",
    {
      expected: EXPECTED_DEPENDENCY_SOURCE_SHA256,
      actual: dependencySha256,
    },
  );
  const dependency = JSON.parse(dependencyBytes.toString("utf8"));
  need(
    dependency.direct_replay_inputs.length === EXPECTED_PATH_COUNT,
    "DEPENDENCY_DIRECT_INPUT_COUNT_MISMATCH",
  );
  const exactMap = new Map(
    sourceExact.files.map((entry) => [entry.repository_relative_path, entry]),
  );
  const directSeen = new Set();
  for (const entry of dependency.direct_replay_inputs) {
    validateRepositoryRelativePath(entry.repository_relative_path);
    need(!directSeen.has(entry.repository_relative_path),
      "DEPENDENCY_DIRECT_INPUT_DUPLICATE",
      { path: entry.repository_relative_path });
    directSeen.add(entry.repository_relative_path);
    const exactEntry = exactMap.get(entry.repository_relative_path);
    need(Boolean(exactEntry), "DEPENDENCY_DIRECT_INPUT_EXTRA", {
      path: entry.repository_relative_path,
    });
    need(
      entry.sha256 === exactEntry.sha256 &&
        entry.file_size_bytes === exactEntry.file_size_bytes,
      "DEPENDENCY_DIRECT_INPUT_BINDING_MISMATCH",
      { path: entry.repository_relative_path },
    );
  }
  need(directSeen.size === exactMap.size, "DEPENDENCY_DIRECT_INPUT_MISSING");

  need(
    Array.isArray(dependency.transitive_provenance_groups) &&
      dependency.transitive_provenance_groups.length === 17,
    "PROVENANCE_GROUP_COUNT_MISMATCH",
  );
  const declaredProvenanceMap = new Map();
  for (const entry of dependency.transitive_provenance_entries) {
    validateRepositoryRelativePath(entry.repository_relative_path);
    need(
      !declaredProvenanceMap.has(entry.repository_relative_path),
      "PROVENANCE_ENTRY_DUPLICATE",
      { path: entry.repository_relative_path },
    );
    declaredProvenanceMap.set(entry.repository_relative_path, entry);
  }
  const actualProvenancePaths = new Set();
  const groups = [];
  for (const group of dependency.transitive_provenance_groups) {
    validateRepositoryRelativePath(`${group.repository_relative_root}/_binding`);
    const absoluteRoot = path.join(
      gitRoot,
      ...group.repository_relative_root.split("/"),
    );
    const actual = digestTree(
      absoluteRoot,
      `PROVENANCE_${group.task_id.replace(/[^A-Za-z0-9]/g, "_")}`,
    );
    need(
      actual.file_count === group.expected_file_count,
      "PROVENANCE_FILE_COUNT_MISMATCH",
      {
        task_id: group.task_id,
        expected: group.expected_file_count,
        actual: actual.file_count,
      },
    );
    need(
      actual.manifest_sha256 === group.expected_manifest_sha256,
      "PROVENANCE_MANIFEST_MISMATCH",
      {
        task_id: group.task_id,
        expected: group.expected_manifest_sha256,
        actual: actual.manifest_sha256,
      },
    );
    for (const entry of actual.entries) {
      const repositoryRelativePath =
        `${group.repository_relative_root}/${entry.relative_path}`;
      actualProvenancePaths.add(repositoryRelativePath);
      const declared = declaredProvenanceMap.get(repositoryRelativePath);
      need(Boolean(declared), "PROVENANCE_ENTRY_MISSING_FROM_SOURCE", {
        path: repositoryRelativePath,
      });
      need(
        declared.sha256 === entry.sha256 &&
          declared.file_size_bytes === entry.bytes &&
          declared.task_id === group.task_id,
        "PROVENANCE_ENTRY_BINDING_MISMATCH",
        { path: repositoryRelativePath },
      );
    }
    groups.push({
      task_id: group.task_id,
      file_count: actual.file_count,
      manifest_sha256: actual.manifest_sha256,
      status: "RECOMPUTED_MATCH",
    });
  }
  need(
    actualProvenancePaths.size === declaredProvenanceMap.size,
    "PROVENANCE_SOURCE_HAS_EXTRA_ENTRY",
    {
      actual_count: actualProvenancePaths.size,
      declared_count: declaredProvenanceMap.size,
    },
  );

  need(
    Array.isArray(dependency.external_hash_bound_references) &&
      dependency.external_hash_bound_references.length === 11,
    "EXTERNAL_REFERENCE_METADATA_COUNT_MISMATCH",
  );
  const externalKeys = new Set();
  const externalMetadata = [];
  for (const entry of dependency.external_hash_bound_references) {
    need(
      typeof entry.normalized_absolute_path === "string" &&
        entry.normalized_absolute_path.length > 0,
      "EXTERNAL_REFERENCE_METADATA_PATH_INVALID",
    );
    need(
      !externalKeys.has(entry.normalized_absolute_path),
      "EXTERNAL_REFERENCE_METADATA_DUPLICATE",
    );
    externalKeys.add(entry.normalized_absolute_path);
    need(
      /^[A-F0-9]{64}$/.test(entry.sha256_recorded),
      "EXTERNAL_REFERENCE_METADATA_SHA256_INVALID",
    );
    need(
      Number.isInteger(entry.file_size_bytes_recorded) &&
        entry.file_size_bytes_recorded >= 0,
      "EXTERNAL_REFERENCE_METADATA_BYTES_INVALID",
    );
    need(
      entry.repository_external === true &&
        entry.proposed_for_commit === false &&
        entry.required_for_replay === false &&
        entry.dereferenced_during_proposal_02 === false,
      "EXTERNAL_REFERENCE_METADATA_BOUNDARY_INVALID",
    );
    externalMetadata.push({
      normalized_absolute_path: entry.normalized_absolute_path,
      sha256_recorded: entry.sha256_recorded,
      file_size_bytes_recorded: entry.file_size_bytes_recorded,
      content_verification_status: "NOT_DEREFERENCED_BY_SCOPE",
      metadata_binding_status: "VERIFIED",
    });
  }
  need(
    dependency.external_content_read === false &&
      dependency.unresolved_reference_count === 11 &&
      dependency.blocking_unresolved_reference_count === 0,
    "EXTERNAL_REFERENCE_SOURCE_SUMMARY_INVALID",
  );

  return {
    dependency_source_sha256: dependencySha256,
    direct_replay_input_count: directSeen.size,
    transitive_provenance_group_count: groups.length,
    transitive_provenance_file_count: actualProvenancePaths.size,
    transitive_provenance_groups: groups,
    external_reference_metadata_count: externalMetadata.length,
    external_reference_metadata: externalMetadata,
    unresolved_reference_count: 11,
    blocking_unresolved_reference_count: 0,
    external_content_read: false,
  };
}

function verifyTaskManifest() {
  const manifestPath = path.join(taskRoot, "task-artifact-manifest.json");
  need(fs.existsSync(manifestPath), "TASK_ARTIFACT_MANIFEST_MISSING");
  const manifest = readJson(manifestPath, "TASK_ARTIFACT_MANIFEST_INVALID_JSON");
  need(manifest.task_id === TASK_ID, "TASK_MANIFEST_TASK_ID_MISMATCH");
  need(
    Array.isArray(manifest.exclusions) &&
      manifest.exclusions.length === 1 &&
      manifest.exclusions[0] === "task-artifact-manifest.json",
    "TASK_MANIFEST_SELF_EXCLUSION_INVALID",
  );
  need(
    manifest.canonicalization_method ===
      "ORDINAL_SORT_RELATIVE_PATH_PIPE_SHA256_PIPE_BYTES_NEWLINE_SHA256",
    "TASK_MANIFEST_CANONICALIZATION_INVALID",
  );
  const actual = digestTree(taskRoot, "TASK_ARTIFACT");
  const actualEntries = actual.entries.filter(
    (entry) => entry.relative_path !== "task-artifact-manifest.json",
  );
  const actualMap = new Map(
    actualEntries.map((entry) => [entry.relative_path, entry]),
  );
  need(
    manifest.file_count === manifest.entries.length &&
      manifest.file_count === actualEntries.length,
    "TASK_MANIFEST_COUNT_MISMATCH",
    {
      declared: manifest.file_count,
      entries: manifest.entries.length,
      actual: actualEntries.length,
    },
  );
  const declaredPaths = new Set();
  for (const entry of manifest.entries) {
    need(!declaredPaths.has(entry.relative_path), "TASK_MANIFEST_DUPLICATE_PATH", {
      path: entry.relative_path,
    });
    declaredPaths.add(entry.relative_path);
    const actualEntry = actualMap.get(entry.relative_path);
    need(Boolean(actualEntry), "TASK_MANIFEST_EXTRA_PATH", {
      path: entry.relative_path,
    });
    need(
      actualEntry.bytes === entry.bytes &&
        actualEntry.sha256 === entry.sha256,
      "TASK_MANIFEST_ENTRY_BINDING_MISMATCH",
      { path: entry.relative_path },
    );
  }
  need(
    declaredPaths.size === actualMap.size,
    "TASK_MANIFEST_MISSING_PATH",
    { declared: declaredPaths.size, actual: actualMap.size },
  );
  const canonical = manifest.entries
    .map((entry) => `${entry.relative_path}|${entry.sha256}|${entry.bytes}`)
    .join("\n");
  need(
    sha256(Buffer.from(canonical, "utf8")) === manifest.manifest_sha256,
    "TASK_MANIFEST_SHA256_MISMATCH",
  );
  return {
    file_count: manifest.file_count,
    physical_file_count: manifest.file_count + 1,
    manifest_sha256: manifest.manifest_sha256,
    self_exclusion_contract: "VALID",
    entry_binding_status: "ALL_MATCH",
  };
}

export function validateAttestation({
  fixturePath = null,
  skipTaskManifest = false,
  requireAttestationProposal = true,
} = {}) {
  const fixture = loadFixture(fixturePath);
  const expectedHead = fixture?.expected_head ?? EXPECTED_HEAD;
  const expectedBranch = fixture?.expected_branch ?? EXPECTED_BRANCH;
  const expectedPathCount =
    fixture?.expected_path_count ?? EXPECTED_PATH_COUNT;
  const expectedSourceManifestSha256 =
    fixture?.expected_source_manifest_sha256 ??
    EXPECTED_SOURCE_MANIFEST_SHA256;

  need(
    posix(path.resolve(productRoot)) === EXPECTED_PRODUCT_ROOT,
    "PRODUCT_ROOT_BINDING_MISMATCH",
    { actual: posix(path.resolve(productRoot)) },
  );
  need(
    posix(path.resolve(gitRoot)) === EXPECTED_GIT_ROOT,
    "DERIVED_GIT_ROOT_BINDING_MISMATCH",
    { actual: posix(path.resolve(gitRoot)) },
  );
  need(
    posix(path.resolve(taskRoot)) ===
      `${EXPECTED_PRODUCT_ROOT}/.codex/tasks/${TASK_ID}`,
    "TASK_ROOT_BINDING_MISMATCH",
    { actual: posix(path.resolve(taskRoot)) },
  );

  const actualGitRoot = posix(path.resolve(gitText([
    "rev-parse",
    "--show-toplevel",
  ]).stdout));
  need(
    actualGitRoot === EXPECTED_GIT_ROOT,
    "ACTUAL_GIT_ROOT_BINDING_MISMATCH",
    { actual: actualGitRoot },
  );
  const actualHead = gitText(["rev-parse", "HEAD"]).stdout;
  const actualBranch = gitText([
    "symbolic-ref",
    "--quiet",
    "--short",
    "HEAD",
  ]).stdout;
  need(actualHead === expectedHead, "HEAD_BINDING_MISMATCH", {
    expected: expectedHead,
    actual: actualHead,
  });
  need(actualBranch === expectedBranch, "BRANCH_BINDING_MISMATCH", {
    expected: expectedBranch,
    actual: actualBranch,
  });
  need(
    expectedPathCount === EXPECTED_PATH_COUNT,
    "BOUND_PATH_COUNT_MISMATCH",
    { expected_path_count: expectedPathCount },
  );
  const actualHeadBinding = exactStringBinding(actualHead);
  const actualBranchBinding = exactStringBinding(actualBranch);
  need(
    actualHeadBinding === EXPECTED_HEAD_BINDING_SHA256,
    "HEAD_CANONICAL_BINDING_HASH_MISMATCH",
  );
  need(
    actualBranchBinding === EXPECTED_BRANCH_BINDING_SHA256,
    "BRANCH_CANONICAL_BINDING_HASH_MISMATCH",
  );

  const commitType = gitText(["cat-file", "-t", actualHead]).stdout;
  need(commitType === "commit", "HEAD_OBJECT_IS_NOT_COMMIT", {
    actual_type: commitType,
  });
  const treeOid = gitText(["rev-parse", `${actualHead}^{tree}`]).stdout;
  const treeType = gitText(["cat-file", "-t", treeOid]).stdout;
  need(treeType === "tree", "HEAD_TREE_OBJECT_INVALID", {
    actual_type: treeType,
  });
  const objectFormat = gitText(["rev-parse", "--show-object-format"]).stdout;
  need(["sha1", "sha256"].includes(objectFormat), "UNSUPPORTED_GIT_OBJECT_FORMAT", {
    object_format: objectFormat,
  });

  const sourceBytes = fs.readFileSync(sourceManifestPath);
  const sourceManifestSha256 = sha256(sourceBytes);
  need(
    sourceManifestSha256 === expectedSourceManifestSha256,
    "SOURCE_MANIFEST_SHA256_MISMATCH",
    {
      expected: expectedSourceManifestSha256,
      actual: sourceManifestSha256,
    },
  );
  const sourceExact = JSON.parse(sourceBytes.toString("utf8"));
  const exact = applyFixture(sourceExact, fixture);
  need(Array.isArray(exact.files), "SOURCE_MANIFEST_FILES_INVALID");

  const paths = exact.files.map((entry) => entry.repository_relative_path);
  const exactSeen = new Set();
  const collisionSeen = new Map();
  for (const candidatePath of paths) {
    validateRepositoryRelativePath(candidatePath);
    need(!exactSeen.has(candidatePath), "DUPLICATE_PATH", {
      path: candidatePath,
    });
    exactSeen.add(candidatePath);
    const collisionKey = candidatePath.normalize("NFC").toLocaleLowerCase("en-US");
    need(!collisionSeen.has(collisionKey), "CASE_OR_NFC_COLLISION", {
      first: collisionSeen.get(collisionKey),
      second: candidatePath,
    });
    collisionSeen.set(collisionKey, candidatePath);
  }
  need(paths.length === EXPECTED_PATH_COUNT, "EXACT_PATH_COUNT_MISMATCH", {
    expected: EXPECTED_PATH_COUNT,
    actual: paths.length,
  });
  need(exactSeen.size === EXPECTED_PATH_COUNT, "UNIQUE_PATH_COUNT_MISMATCH");

  const sourcePartitionCount = exact.files.filter(
    (entry) => entry.partition === "SOURCE_7A_2",
  ).length;
  const attemptPartitionCount = exact.files.filter(
    (entry) => entry.partition === "ATTEMPT_1",
  ).length;
  need(
    sourcePartitionCount === EXPECTED_SOURCE_PARTITION_COUNT &&
      attemptPartitionCount === EXPECTED_ATTEMPT_PARTITION_COUNT,
    "PARTITION_COUNT_MISMATCH",
    {
      source_7a_2: sourcePartitionCount,
      attempt_1: attemptPartitionCount,
    },
  );

  const treeRows = [];
  const indexRows = [];
  const statusRows = [];
  const worktreeChangedPaths = [];
  const indexChangedPaths = [];
  const headChangedPaths = [];
  const untrackedPaths = [];
  for (const group of batch(paths)) {
    treeRows.push(...parseTree(git([
      "ls-tree",
      "-z",
      actualHead,
      "--",
      ...group,
    ]).stdout));
    indexRows.push(...parseIndex(git([
      "ls-files",
      "--stage",
      "-z",
      "--",
      ...group,
    ]).stdout));
    statusRows.push(...parseStatus(git([
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--",
      ...group,
    ]).stdout));
    worktreeChangedPaths.push(...parseZeroList(git([
      "diff",
      "--name-only",
      "-z",
      "--",
      ...group,
    ]).stdout));
    indexChangedPaths.push(...parseZeroList(git([
      "diff",
      "--cached",
      "--name-only",
      "-z",
      "--",
      ...group,
    ]).stdout));
    headChangedPaths.push(...parseZeroList(git([
      "diff",
      "--name-only",
      "-z",
      actualHead,
      "--",
      ...group,
    ]).stdout));
    untrackedPaths.push(...parseZeroList(git([
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      ...group,
    ]).stdout));
  }
  const treeMap = new Map(
    treeRows.map((entry) => [entry.repository_relative_path, entry]),
  );
  const indexMap = new Map(
    indexRows.map((entry) => [entry.repository_relative_path, entry]),
  );
  need(treeMap.size === EXPECTED_PATH_COUNT, "HEAD_TREE_PATH_COUNT_MISMATCH", {
    actual: treeMap.size,
  });
  need(indexMap.size === EXPECTED_PATH_COUNT, "INDEX_PATH_COUNT_MISMATCH", {
    actual: indexMap.size,
  });
  need(statusRows.length === 0, "CANDIDATE_GIT_STATUS_NOT_CLEAN", {
    status_rows: statusRows,
  });
  need(worktreeChangedPaths.length === 0, "WORKING_TREE_CANDIDATE_CHANGED", {
    paths: worktreeChangedPaths,
  });
  need(indexChangedPaths.length === 0, "INDEX_CANDIDATE_CHANGED", {
    paths: indexChangedPaths,
  });
  need(headChangedPaths.length === 0, "HEAD_CANDIDATE_DELTA_EXISTS", {
    paths: headChangedPaths,
  });
  need(untrackedPaths.length === 0, "UNTRACKED_CANDIDATE_PATH_EXISTS", {
    paths: untrackedPaths,
  });

  const ignoreInput = Buffer.from(`${paths.join("\0")}\0`, "utf8");
  const ignoreResult = git(
    ["check-ignore", "-z", "-v", "--no-index", "--stdin"],
    { input: ignoreInput, allowedExitCodes: [0, 1] },
  );
  const ignoreRows = parseCheckIgnore(ignoreResult.stdout);
  const ignoreWarnings = ignoreResult.stderr
    .toString("utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  need(ignoreRows.length === 0, "IGNORED_CANDIDATE_PATH_EXISTS", {
    ignored: ignoreRows,
  });

  const attrInput = Buffer.from(`${paths.join("\0")}\0`, "utf8");
  const attrResult = git(
    [
      "check-attr",
      "-z",
      "--stdin",
      "text",
      "eol",
      "filter",
      "working-tree-encoding",
    ],
    { input: attrInput },
  );
  const attrMap = parseCheckAttr(attrResult.stdout);

  const candidateEvidence = [];
  const transformationRisks = [];
  for (const entry of exact.files) {
    const repositoryRelativePath = entry.repository_relative_path;
    const absolute = path.join(
      gitRoot,
      ...repositoryRelativePath.split("/"),
    );
    need(fs.existsSync(absolute), "CANDIDATE_FILE_MISSING", {
      path: repositoryRelativePath,
    });
    const stat = fs.lstatSync(absolute);
    need(stat.isFile() && !stat.isSymbolicLink(), "CANDIDATE_NOT_REGULAR_FILE", {
      path: repositoryRelativePath,
    });
    const real = fs.realpathSync.native(absolute);
    const relativeReal = path.relative(productRoot, real);
    need(
      relativeReal !== "" &&
        !relativeReal.startsWith("..") &&
        !path.isAbsolute(relativeReal),
      "CANDIDATE_REALPATH_ESCAPE",
      { path: repositoryRelativePath, realpath: posix(real) },
    );
    const bytes = fs.readFileSync(absolute);
    const actualSha256 = sha256(bytes);
    need(
      bytes.length === entry.file_size_bytes,
      "CANDIDATE_BYTE_SIZE_MISMATCH",
      {
        path: repositoryRelativePath,
        expected: entry.file_size_bytes,
        actual: bytes.length,
      },
    );
    need(actualSha256 === entry.sha256, "CANDIDATE_SHA256_MISMATCH", {
      path: repositoryRelativePath,
      expected: entry.sha256,
      actual: actualSha256,
    });
    const tree = treeMap.get(repositoryRelativePath);
    const index = indexMap.get(repositoryRelativePath);
    need(Boolean(tree), "CANDIDATE_MISSING_FROM_HEAD_TREE", {
      path: repositoryRelativePath,
    });
    need(Boolean(index), "CANDIDATE_MISSING_FROM_INDEX", {
      path: repositoryRelativePath,
    });
    need(tree.type === "blob", "HEAD_TREE_ENTRY_NOT_BLOB", {
      path: repositoryRelativePath,
      type: tree.type,
    });
    need(index.stage === 0, "INDEX_ENTRY_STAGE_NOT_ZERO", {
      path: repositoryRelativePath,
      stage: index.stage,
    });
    need(tree.oid === index.oid, "HEAD_TREE_INDEX_OID_MISMATCH", {
      path: repositoryRelativePath,
      head_oid: tree.oid,
      index_oid: index.oid,
    });
    if (entry.git_state?.tracked_oid) {
      need(
        tree.oid === entry.git_state.tracked_oid,
        "CANDIDATE_SOURCE_BLOB_OID_MISMATCH",
        {
          path: repositoryRelativePath,
          expected: entry.git_state.tracked_oid,
          actual: tree.oid,
        },
      );
    }
    const rawOid = gitBlobOid(objectFormat, bytes);
    const filtered = gitText([
      "hash-object",
      `--path=${repositoryRelativePath}`,
      "--",
      absolute,
    ]);
    const filteredOid = filtered.stdout;
    const attributes = attrMap.get(repositoryRelativePath) ?? {};
    const transformationPossible =
      rawOid !== filteredOid ||
      filteredOid !== tree.oid ||
      index.oid !== tree.oid;
    if (transformationPossible) {
      transformationRisks.push({
        repository_relative_path: repositoryRelativePath,
        raw_oid: rawOid,
        filtered_oid: filteredOid,
        index_oid: index.oid,
        head_blob_oid: tree.oid,
      });
    }
    const blobBytes = git([
      "cat-file",
      "blob",
      tree.oid,
    ]).stdout;
    need(
      sha256(blobBytes) === actualSha256 && blobBytes.equals(bytes),
      "HEAD_BLOB_BYTES_MISMATCH",
      { path: repositoryRelativePath },
    );
    candidateEvidence.push({
      repository_relative_path: repositoryRelativePath,
      nfc: true,
      partition: entry.partition,
      bytes: bytes.length,
      sha256: actualSha256,
      head_mode: tree.mode,
      head_blob_oid: tree.oid,
      index_mode: index.mode,
      index_blob_oid: index.oid,
      raw_working_tree_blob_oid: rawOid,
      filtered_projection_blob_oid: filteredOid,
      raw_index_blob_identity: rawOid === index.oid,
      index_head_blob_identity: index.oid === tree.oid,
      attributes: {
        text: attributes.text ?? "unspecified",
        eol: attributes.eol ?? "unspecified",
        filter: attributes.filter ?? "unspecified",
        working_tree_encoding:
          attributes["working-tree-encoding"] ?? "unspecified",
      },
      ignored: false,
      working_tree_changed: false,
      index_changed: false,
      tracked: true,
    });
  }
  need(
    transformationRisks.length === 0,
    "TRANSFORMATION_RISK_EXISTS",
    { risks: transformationRisks },
  );
  const candidateManifestSha256 = digestCandidateEntries(
    candidateEvidence.map((entry) => ({
      repository_relative_path: entry.repository_relative_path,
      sha256: entry.sha256,
      file_size_bytes: entry.bytes,
    })),
  );
  need(
    candidateManifestSha256 === EXPECTED_CANDIDATE_MANIFEST_SHA256,
    "CANDIDATE_MANIFEST_SHA256_MISMATCH",
    {
      expected: EXPECTED_CANDIDATE_MANIFEST_SHA256,
      actual: candidateManifestSha256,
    },
  );

  const stagedGovernance = parseZeroList(git([
    "diff",
    "--cached",
    "--name-only",
    "-z",
    "--",
    "輕軌系統/AGENTS.md",
    "輕軌系統/.codex",
    "輕軌系統/.agents",
  ]).stdout);
  need(
    stagedGovernance.length === 0,
    "STAGED_GOVERNANCE_PATH_EXISTS",
    { paths: stagedGovernance },
  );

  const phasePolicy = readJson(phasePolicyPath, "PHASE_POLICY_INVALID");
  const requiredProhibitedGitActions = [
    "stage",
    "commit",
    "push",
    "branch",
    "worktree",
    "merge",
    "stash",
    "reset",
    "restore",
    "clean",
  ];
  need(
    requiredProhibitedGitActions.every((action) =>
      phasePolicy.prohibited_git_actions.includes(action)),
    "PHASE_POLICY_GIT_PROHIBITION_MISSING",
  );
  need(
    phasePolicy.authorized_write_paths.includes(".codex/**") &&
      phasePolicy.product_write_allowed === false &&
      phasePolicy.database_write_allowed === false,
    "PHASE_POLICY_SCOPE_MISMATCH",
  );

  const historicalBaselines = verifyHistoricalBaselines();
  const dependencyEvidence = verifyDependencyClosure(sourceExact);

  const attestationBindingCore = {
    anchor_object_type: "EXISTING_GIT_COMMIT_AND_TREE",
    branch: actualBranch,
    exact_path_count: EXPECTED_PATH_COUNT,
    head: actualHead,
    head_tree_oid: treeOid,
    source_manifest_sha256: sourceManifestSha256,
    trust_anchor_model: "EXISTING_HEAD_EXACT_MANIFEST_ATTESTATION",
  };
  const attestationBindingSha256 =
    canonicalObjectBinding(attestationBindingCore);

  if (requireAttestationProposal) {
    const proposal = readJson(
      path.join(taskRoot, "existing-head-attestation-proposal.json"),
      "ATTESTATION_PROPOSAL_INVALID",
    );
    need(proposal.task_id === TASK_ID, "ATTESTATION_TASK_ID_MISMATCH");
    need(
      proposal.anchor_object_type === "EXISTING_GIT_COMMIT_AND_TREE",
      "ATTESTATION_OBJECT_TYPE_MISMATCH",
    );
    need(
      proposal.trust_anchor_candidate_status === "PROPOSED_NOT_ADOPTED",
      "ATTESTATION_STATUS_MISMATCH",
    );
    need(
      proposal.creates_new_commit === false &&
        proposal.empty_commit_used === false &&
        proposal.new_tree_delta_claimed === false,
      "ATTESTATION_DELTA_CLAIM_INVALID",
    );
    need(
      proposal.human_model_selection_is_adoption === false &&
        proposal.work_review_is_adoption === false,
      "ATTESTATION_ADOPTION_BOUNDARY_INVALID",
    );
    need(
      proposal.head === actualHead &&
        proposal.branch === actualBranch &&
        proposal.head_tree_oid === treeOid &&
        proposal.exact_path_count === EXPECTED_PATH_COUNT,
      "ATTESTATION_REPOSITORY_BINDING_MISMATCH",
    );
    need(
      proposal.head_binding_sha256 === actualHeadBinding &&
        proposal.branch_binding_sha256 === actualBranchBinding &&
        proposal.attestation_binding_sha256 === attestationBindingSha256,
      "ATTESTATION_CANONICAL_BINDING_MISMATCH",
    );
    need(
      proposal.source_manifest_sha256 === sourceManifestSha256 &&
        proposal.candidate_manifest_sha256 === candidateManifestSha256,
      "ATTESTATION_MANIFEST_BINDING_MISMATCH",
    );
    need(
      proposal.downstream_git_mutation_authorized === false &&
        proposal.product_implementation_authorized === false,
      "ATTESTATION_AUTHORITY_OVERREACH",
    );
  }

  const taskManifest = skipTaskManifest
    ? {
        status: "DEFERRED_UNTIL_FINAL_FREEZE",
        self_exclusion_contract:
          "task-artifact-manifest.json is generated last and excludes itself",
      }
    : verifyTaskManifest();

  return {
    schema_version: 1,
    validator: "PRODUCTION_INDEPENDENT_RECOMPUTATION_VALIDATOR",
    validator_status: "PASS",
    candidate_verdict: "READY_FOR_WORK_READ_ONLY_REVIEW",
    producer_summary_status_observed_but_not_trusted:
      fixture?.producer_summary_status ?? null,
    exact_bindings: {
      task_id: TASK_ID,
      task_allowed_path: taskRelativePath,
      product_root: EXPECTED_PRODUCT_ROOT,
      git_root: actualGitRoot,
      head: actualHead,
      branch: actualBranch,
      head_binding_sha256: actualHeadBinding,
      branch_binding_sha256: actualBranchBinding,
      head_commit_object_type: commitType,
      head_tree_oid: treeOid,
      head_tree_object_type: treeType,
      git_object_format: objectFormat,
      attestation_binding_core: attestationBindingCore,
      attestation_binding_contract:
        "RECURSIVE_LEXICOGRAPHIC_KEY_SORT_UTF8_JSON_NO_WHITESPACE_SHA256",
      rfc_8785_jcs_used: false,
      attestation_binding_sha256: attestationBindingSha256,
    },
    candidate_summary: {
      exact_path_count: candidateEvidence.length,
      unique_path_count: exactSeen.size,
      source_7a_2_count: sourcePartitionCount,
      attempt_1_count: attemptPartitionCount,
      head_tree_blob_count: treeMap.size,
      tracked_count: indexMap.size,
      untracked_count: untrackedPaths.length,
      working_tree_changed_count: worktreeChangedPaths.length,
      index_changed_count: indexChangedPaths.length,
      head_delta_count: headChangedPaths.length,
      ignored_count: ignoreRows.length,
      transformation_risk_count: transformationRisks.length,
      collision_count: 0,
      non_nfc_count: 0,
      candidate_manifest_sha256: candidateManifestSha256,
    },
    candidate_evidence: candidateEvidence,
    git_attribute_and_ignore_evidence: {
      ignored_entries: ignoreRows,
      ignore_query_warnings: ignoreWarnings,
      ignore_permission_limitation_count: ignoreWarnings.filter((line) =>
        /Permission denied/i.test(line)).length,
      attribute_query_entry_count: attrMap.size,
      git_config: {
        core_autocrlf: gitConfig("core.autocrlf"),
        core_eol: gitConfig("core.eol"),
        core_safecrlf: gitConfig("core.safecrlf"),
        core_attributesfile: gitConfig("core.attributesfile"),
        core_excludesfile: gitConfig("core.excludesfile"),
      },
      filter_projection_status: "147_RAW_INDEX_HEAD_IDENTITIES_RECOMPUTED",
    },
    dependency_evidence: dependencyEvidence,
    historical_baselines: historicalBaselines,
    staged_governance_path_count: stagedGovernance.length,
    phase_policy: {
      phase_id: phasePolicy.phase_id,
      task_local_governance_write_allowed: true,
      git_mutation_allowed: false,
      prohibited_git_actions: phasePolicy.prohibited_git_actions,
    },
    task_artifact_manifest: taskManifest,
    assurance_boundaries: {
      existing_head_model_selected: true,
      human_trust_anchor_adoption_completed: false,
      work_read_only_review_completed: false,
      git_mutation_executed: false,
      external_reference_content_read: false,
    },
  };
}

function parseArguments(argv) {
  const options = {
    fixturePath: null,
    skipTaskManifest: false,
    requireAttestationProposal: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--fixture") {
      options.fixturePath = argv[index + 1];
      index += 1;
    } else if (argument === "--skip-task-manifest") {
      options.skipTaskManifest = true;
    } else if (argument === "--discovery") {
      options.requireAttestationProposal = false;
      options.skipTaskManifest = true;
    } else {
      throw new ValidationError("UNKNOWN_ARGUMENT", { argument });
    }
  }
  return options;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const result = validateAttestation(parseArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const normalized = error instanceof ValidationError
      ? error
      : new ValidationError("UNEXPECTED_VALIDATOR_FAILURE", {
          message: error.message,
          stack: error.stack,
        });
    process.stdout.write(`${JSON.stringify({
      schema_version: 1,
      validator: "PRODUCTION_INDEPENDENT_RECOMPUTATION_VALIDATOR",
      validator_status: "BLOCKER",
      error_code: normalized.code,
      detail: normalized.detail,
      git_mutation_executed: false,
    }, null, 2)}\n`);
    process.exitCode = 2;
  }
}
