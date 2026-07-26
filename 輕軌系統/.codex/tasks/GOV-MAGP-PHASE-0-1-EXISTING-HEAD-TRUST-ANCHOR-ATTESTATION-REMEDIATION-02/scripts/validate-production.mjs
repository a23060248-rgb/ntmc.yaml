import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TASK_ID =
  "GOV-MAGP-PHASE-0-1-EXISTING-HEAD-TRUST-ANCHOR-ATTESTATION-REMEDIATION-02";
const PREVIOUS_TASK_ID =
  "GOV-MAGP-PHASE-0-1-EXISTING-HEAD-TRUST-ANCHOR-ATTESTATION-REMEDIATION-01";
const EXPECTED_PRODUCT_ROOT =
  "C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統";
const EXPECTED_GIT_ROOT = "C:/Users/a2306/Desktop/code/ntmc.yaml";
const EXPECTED_HEAD = "22baa18784a081dd8c0d8a3ce177ba00363251de";
const EXPECTED_BRANCH = "codex/precheck-template-maintenance";
const EXPECTED_TREE = "c6f30a81ff45273aca851126160f2588937d2550";
const EXPECTED_HEAD_BINDING =
  "529AE67219F970C5B3AFDD694D51384F5DC4290E3D13B36B3416946D25C2977D";
const EXPECTED_BRANCH_BINDING =
  "6C1B53839F433463CCCA131A09A8DB3EE3B5387F0F2CCB67DCDE437984C2768D";
const EXPECTED_PATH_COUNT = 147;
const EXPECTED_SOURCE_COUNT = 106;
const EXPECTED_ATTEMPT_COUNT = 41;
const EXPECTED_SOURCE_MANIFEST_SHA256 =
  "5CE80FC02491E66701D9D5573DB3123561FE41C74BABE7C0D0F5496404207685";
const EXPECTED_DEPENDENCY_SHA256 =
  "B320CEC8FAC46723D6BFD2D9726357A959DA14D1E8C06FD01D27037928F619E6";
const EXPECTED_CANDIDATE_MANIFEST_SHA256 =
  "2C01A85E3348B174B7BFB1F3F1D0A26CAB485423297252C7C7F4F35C65702E5D";
const EXPECTED_HISTORICAL = {
  remediation_01: {
    task_id: PREVIOUS_TASK_ID,
    file_count: 35,
    manifest_sha256:
      "D1CBD110BD9921124DC935FB808152DB841B2EEAFB35AD857639AE503D0B3080",
  },
  proposal_02: {
    task_id: "GOV-MAGP-PHASE-0-1-GIT-TRUST-ANCHOR-PROPOSAL-02",
    file_count: 23,
    manifest_sha256:
      "3D763DD0EFB76403D9AC8E64EA74B6BFF4ACD602C0650378FD87DA3243BA1FC4",
  },
  proposal_01: {
    task_id: "GOV-MAGP-PHASE-0-1-GIT-TRUST-ANCHOR-PROPOSAL-01",
    file_count: 19,
    manifest_sha256:
      "487E221D9BE82E9F1E9A5F6A30D53711354B36DECFEDA14EE262D49B139835B7",
  },
  commit_01: {
    task_id: "GOV-MAGP-PHASE-0-1-GIT-TRUST-ANCHOR-COMMIT-01",
    file_count: 16,
    manifest_sha256:
      "F2DB3ACA49A667704C221F35C36964C7F0C2A7BBFA016230F41A08BA69CF41F5",
  },
};
const PRODUCT_PREFIX = "輕軌系統/";
const TASK_REPO_PREFIX =
  `輕軌系統/.codex/tasks/${TASK_ID}/`;
const TASK_MANIFEST_REPO_PATH =
  `${TASK_REPO_PREFIX}task-artifact-manifest.json`;
const TASK_MANIFEST_KEYS = [
  "schema_version",
  "task_id",
  "generation_order",
  "assurance",
  "authority_boundary",
  "self_path",
  "self_exclusion",
  "path_scope",
  "path_sort",
  "canonicalization",
  "hash_contract",
  "entry_count",
  "physical_file_count",
  "entries",
  "manifest_sha256",
].sort();

const taskRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productRoot = path.resolve(taskRoot, "..", "..", "..");
const gitRoot = path.resolve(productRoot, "..");
const tasksRoot = path.join(productRoot, ".codex", "tasks");
const sourceManifestPath = path.join(
  tasksRoot,
  "GOV-MAGP-PHASE-0-1-GIT-TRUST-ANCHOR-PROPOSAL-02",
  "exact-commit-paths.json",
);
const dependencyPath = path.join(
  tasksRoot,
  "GOV-MAGP-PHASE-0-1-GIT-TRUST-ANCHOR-PROPOSAL-02",
  "dependency-closure.json",
);
const previousProposalPath = path.join(
  tasksRoot,
  PREVIOUS_TASK_ID,
  "existing-head-attestation-proposal.json",
);
const phasePolicyPath = path.join(
  productRoot,
  ".codex",
  "governance",
  "phase-policy.yaml",
);
const fixtureRoot = path.join(taskRoot, "test-fixtures");
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

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex").toUpperCase();
}

function compareCodePoints(left, right) {
  const a = Array.from(left, (character) => character.codePointAt(0));
  const b = Array.from(right, (character) => character.codePointAt(0));
  const count = Math.min(a.length, b.length);
  for (let index = 0; index < count; index += 1) {
    if (a[index] < b[index]) return -1;
    if (a[index] > b[index]) return 1;
  }
  return a.length - b.length;
}

function jcs(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    need(Number.isFinite(value), "JCS_NON_FINITE_NUMBER");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  need(typeof value === "object", "JCS_UNSUPPORTED_TYPE");
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`)
    .join(",")}}`;
}

function jcsSha256(value) {
  return sha256(Buffer.from(jcs(value), "utf8"));
}

function sameStat(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs
  );
}

function isWithin(absolute, root) {
  const relative = path.relative(root, absolute);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function assertNoReparseLayers(absolute, allowedRoot, codePrefix) {
  const resolvedAbsolute = path.resolve(absolute);
  const resolvedRoot = path.resolve(allowedRoot);
  need(isWithin(resolvedAbsolute, resolvedRoot), `${codePrefix}_LEXICAL_ESCAPE`, {
    path: posix(resolvedAbsolute),
    allowed_root: posix(resolvedRoot),
  });
  need(fs.existsSync(resolvedRoot), `${codePrefix}_ALLOWED_ROOT_MISSING`);
  const rootStat = fs.lstatSync(resolvedRoot);
  need(!rootStat.isSymbolicLink(), `${codePrefix}_ROOT_REPARSE_POINT`);
  const rootReal = fs.realpathSync.native(resolvedRoot);
  need(
    path.resolve(rootReal) === resolvedRoot,
    `${codePrefix}_ROOT_REALPATH_MISMATCH`,
    { expected: posix(resolvedRoot), actual: posix(rootReal) },
  );
  const relative = path.relative(resolvedRoot, resolvedAbsolute);
  let current = resolvedRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    need(fs.existsSync(current), `${codePrefix}_LAYER_MISSING`, {
      path: posix(current),
    });
    const layerStat = fs.lstatSync(current);
    need(!layerStat.isSymbolicLink(), `${codePrefix}_REPARSE_POINT_NOT_ALLOWED`, {
      path: posix(current),
    });
  }
  const real = fs.realpathSync.native(resolvedAbsolute);
  need(isWithin(real, rootReal), `${codePrefix}_REALPATH_ESCAPE`, {
    path: posix(resolvedAbsolute),
    realpath: posix(real),
  });
  return real;
}

function secureReadFile(absolute, allowedRoot, codePrefix) {
  assertNoReparseLayers(absolute, allowedRoot, codePrefix);
  const handle = fs.openSync(absolute, "r");
  try {
    const before = fs.fstatSync(handle);
    need(before.isFile(), `${codePrefix}_NOT_REGULAR_FILE`);
    const bytes = fs.readFileSync(handle);
    const after = fs.fstatSync(handle);
    need(sameStat(before, after), `${codePrefix}_HANDLE_CHANGED_DURING_READ`);
    need(bytes.length === before.size, `${codePrefix}_SHORT_READ`);
    return {
      bytes,
      handle_binding: {
        dev: before.dev,
        ino: before.ino,
        size: before.size,
        mtime_ms: before.mtimeMs,
        status: "OPEN_FSTAT_READ_FSTAT_STABLE",
      },
    };
  } finally {
    fs.closeSync(handle);
  }
}

function secureReadJson(absolute, allowedRoot, codePrefix) {
  const read = secureReadFile(absolute, allowedRoot, codePrefix);
  try {
    return {
      ...read,
      value: JSON.parse(read.bytes.toString("utf8")),
    };
  } catch (error) {
    throw new ValidationError(`${codePrefix}_INVALID_JSON`, {
      error: error.message,
    });
  }
}

function validateRepositoryPath(value, requiredPrefix = PRODUCT_PREFIX) {
  need(typeof value === "string" && value.length > 0, "PATH_NOT_STRING");
  need(!value.includes("\0"), "PATH_CONTAINS_NUL", { path: value });
  need(!value.includes("\\"), "PATH_BACKSLASH_NOT_ALLOWED", { path: value });
  need(!value.startsWith("//"), "PATH_UNC_NOT_ALLOWED", { path: value });
  need(!/^[A-Za-z]:/.test(value), "PATH_DRIVE_NOT_ALLOWED", { path: value });
  need(!path.posix.isAbsolute(value), "PATH_ABSOLUTE_NOT_ALLOWED", { path: value });
  need(value.normalize("NFC") === value, "PATH_NOT_NFC", { path: value });
  const parts = value.split("/");
  need(
    !parts.some((part) => part === "" || part === "." || part === ".."),
    "PATH_TRAVERSAL_NOT_ALLOWED",
    { path: value },
  );
  need(value.startsWith(requiredPrefix), "PATH_SCOPE_PREFIX_MISMATCH", {
    path: value,
    required_prefix: requiredPrefix,
  });
  need(
    !parts.some((part) => part.toLowerCase().startsWith(".env")),
    "FORBIDDEN_ENV_PATH",
    { path: value },
  );
}

function git(args, diagnostics, {
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
  const stderr = Buffer.isBuffer(result.stderr)
    ? result.stderr.toString("utf8")
    : result.stderr;
  if (stderr?.trim()) {
    diagnostics.push({
      args,
      stderr: stderr.trim(),
    });
  }
  need(
    allowedExitCodes.includes(result.status),
    "READ_ONLY_GIT_QUERY_FAILED",
    { args, status: result.status, stderr },
  );
  return result;
}

function gitText(args, diagnostics, options = {}) {
  const result = git(args, diagnostics, { ...options, encoding: "utf8" });
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function batch(items, size = 20) {
  const groups = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function zeroList(buffer) {
  return buffer.toString("utf8").split("\0").filter(Boolean);
}

function parseTree(buffer) {
  return zeroList(buffer).map((record) => {
    const match = record.match(/^(\d{6}) ([^ ]+) ([0-9a-f]+)\t([\s\S]+)$/);
    need(Boolean(match), "HEAD_TREE_PARSE_FAILURE", { record });
    return {
      mode: match[1],
      type: match[2],
      oid: match[3],
      repository_relative_path: match[4],
    };
  });
}

function parseIndex(buffer) {
  return zeroList(buffer).map((record) => {
    const match = record.match(/^(\d{6}) ([0-9a-f]+) (\d)\t([\s\S]+)$/);
    need(Boolean(match), "INDEX_PARSE_FAILURE", { record });
    return {
      mode: match[1],
      oid: match[2],
      stage: Number(match[3]),
      repository_relative_path: match[4],
    };
  });
}

function parseStatus(buffer) {
  const fields = buffer.toString("utf8").split("\0");
  const rows = [];
  for (let index = 0; index < fields.length; index += 1) {
    if (!fields[index]) continue;
    const row = {
      xy: fields[index].slice(0, 2),
      repository_relative_path: fields[index].slice(3),
    };
    if (/[RC]/.test(row.xy) && fields[index + 1]) {
      row.source = fields[index + 1];
      index += 1;
    }
    rows.push(row);
  }
  return rows;
}

function parseIgnore(buffer) {
  const fields = buffer.toString("utf8").split("\0").filter(Boolean);
  need(fields.length % 4 === 0, "IGNORE_PARSE_FAILURE");
  const rows = [];
  for (let index = 0; index < fields.length; index += 4) {
    rows.push({
      source: fields[index],
      line: Number(fields[index + 1]),
      pattern: fields[index + 2],
      repository_relative_path: fields[index + 3],
    });
  }
  return rows;
}

function parseAttributes(buffer) {
  const fields = buffer.toString("utf8").split("\0").filter(Boolean);
  need(fields.length % 3 === 0, "ATTRIBUTE_PARSE_FAILURE");
  const map = new Map();
  for (let index = 0; index < fields.length; index += 3) {
    if (!map.has(fields[index])) map.set(fields[index], {});
    map.get(fields[index])[fields[index + 1]] = fields[index + 2];
  }
  return map;
}

function gitBlobOid(format, bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
  return crypto
    .createHash(format)
    .update(Buffer.concat([header, bytes]))
    .digest("hex");
}

function listFilesStrict(root, codePrefix) {
  assertNoReparseLayers(root, productRoot, codePrefix);
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      const relative = posix(path.relative(root, absolute));
      need(!entry.isSymbolicLink(), `${codePrefix}_REPARSE_POINT_NOT_ALLOWED`, {
        path: relative,
      });
      need(
        !relative.split("/").some((segment) =>
          segment.toLowerCase().startsWith(".env")),
        `${codePrefix}_FORBIDDEN_ENV_PATH`,
        { path: relative },
      );
      if (entry.isDirectory()) stack.push(absolute);
      else {
        need(entry.isFile(), `${codePrefix}_NON_FILE_ENTRY`, { path: relative });
        files.push(absolute);
      }
    }
  }
  return files.sort((left, right) =>
    compareCodePoints(posix(left), posix(right)));
}

function digestTree(root, codePrefix) {
  const entries = listFilesStrict(root, codePrefix).map((absolute) => {
    const read = secureReadFile(absolute, root, `${codePrefix}_FILE`);
    return {
      relative_path: posix(path.relative(root, absolute)),
      sha256: sha256(read.bytes),
      bytes: read.bytes.length,
    };
  });
  entries.sort((left, right) =>
    compareCodePoints(left.relative_path, right.relative_path));
  const canonical = entries
    .map((entry) => `${entry.relative_path}|${entry.sha256}|${entry.bytes}`)
    .join("\n");
  return {
    file_count: entries.length,
    manifest_sha256: sha256(Buffer.from(canonical, "utf8")),
    entries,
  };
}

function candidateDigest(entries) {
  const rows = [...entries]
    .sort((left, right) =>
      compareCodePoints(
        left.repository_relative_path,
        right.repository_relative_path,
      ))
    .map((entry) =>
      `${entry.repository_relative_path}|${entry.sha256}|${entry.bytes}`)
    .join("\n");
  return sha256(Buffer.from(rows, "utf8"));
}

function exactKeys(value, expected, code) {
  need(
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort()),
    code,
    { actual: Object.keys(value).sort(), expected: [...expected].sort() },
  );
}

function recomputeManifestHash(manifest) {
  const core = structuredClone(manifest);
  delete core.manifest_sha256;
  return jcsSha256(core);
}

function applyManifestMutation(manifest, fixture) {
  const kind = fixture?.mutation?.kind;
  if (!kind) return manifest;
  const result = structuredClone(manifest);
  if (kind === "manifest_missing") {
    throw new ValidationError("TASK_MANIFEST_MISSING");
  }
  if (kind === "manifest_corrupt") {
    throw new ValidationError("TASK_MANIFEST_INVALID_JSON");
  }
  if (kind === "manifest_reordered") {
    [result.entries[0], result.entries[1]] =
      [result.entries[1], result.entries[0]];
    result.manifest_sha256 = recomputeManifestHash(result);
  } else if (kind === "manifest_schema") {
    result.schema_version = 999;
  } else if (kind === "manifest_generation") {
    result.generation_order = "NOT_LAST";
  } else if (kind === "manifest_canonicalization") {
    result.canonicalization = "JSON_STRINGIFY_INSERTION_ORDER";
  } else if (kind === "manifest_physical_count") {
    result.physical_file_count += 1;
  } else if (kind === "manifest_wrong_hash") {
    result.manifest_sha256 = "0".repeat(64);
  } else if (kind === "manifest_self_included") {
    result.entries.push({
      repository_relative_path: TASK_MANIFEST_REPO_PATH,
      bytes: 0,
      sha256: "0".repeat(64),
    });
    result.entry_count = result.entries.length;
    result.physical_file_count = result.entry_count + 1;
    result.manifest_sha256 = recomputeManifestHash(result);
  }
  return result;
}

function verifyTaskManifest(fixture) {
  const manifestPath = path.join(taskRoot, "task-artifact-manifest.json");
  if (fixture?.mutation?.kind === "manifest_missing") {
    throw new ValidationError("TASK_MANIFEST_MISSING");
  }
  if (fixture?.mutation?.kind === "manifest_corrupt") {
    throw new ValidationError("TASK_MANIFEST_INVALID_JSON");
  }
  const read = secureReadJson(
    manifestPath,
    taskRoot,
    "TASK_MANIFEST",
  );
  const manifest = applyManifestMutation(read.value, fixture);
  exactKeys(manifest, TASK_MANIFEST_KEYS, "TASK_MANIFEST_FIELD_SET_INVALID");
  need(manifest.schema_version === 2, "TASK_MANIFEST_SCHEMA_INVALID");
  need(manifest.task_id === TASK_ID, "TASK_MANIFEST_TASK_ID_INVALID");
  need(
    manifest.generation_order === "LAST_AFTER_HANDOFF_FREEZE",
    "TASK_MANIFEST_GENERATION_ORDER_INVALID",
  );
  need(
    manifest.assurance === "INTERNAL_CONSISTENCY_ONLY",
    "TASK_MANIFEST_ASSURANCE_INVALID",
  );
  need(
    manifest.authority_boundary?.external_immutable_binding_status ===
      "NOT_PROVIDED" &&
      manifest.authority_boundary?.human_identity_claimed === false &&
      manifest.authority_boundary?.adopted_authority_claimed === false,
    "TASK_MANIFEST_AUTHORITY_BOUNDARY_INVALID",
  );
  need(manifest.self_path === TASK_MANIFEST_REPO_PATH,
    "TASK_MANIFEST_SELF_PATH_INVALID");
  need(
    manifest.self_exclusion?.excluded_path === TASK_MANIFEST_REPO_PATH &&
      manifest.self_exclusion?.reason === "SELF_REFERENCE_AVOIDANCE" &&
      manifest.self_exclusion?.self_entry_present === false,
    "TASK_MANIFEST_SELF_EXCLUSION_INVALID",
  );
  need(
    manifest.path_scope === "REPOSITORY_RELATIVE_WITHIN_EXACT_TASK_ROOT" &&
      manifest.path_sort === "UNICODE_NFC_ORDINAL_CODE_POINT",
    "TASK_MANIFEST_PATH_CONTRACT_INVALID",
  );
  need(
    manifest.canonicalization === "RFC8785_JCS" &&
      manifest.hash_contract ===
        "SHA256_OF_RFC8785_JCS_MANIFEST_CORE_OMITTING_MANIFEST_SHA256",
    "TASK_MANIFEST_CANONICALIZATION_INVALID",
  );
  need(Array.isArray(manifest.entries), "TASK_MANIFEST_ENTRIES_INVALID");
  need(
    manifest.entry_count === manifest.entries.length,
    "TASK_MANIFEST_ENTRY_COUNT_INVALID",
  );
  need(
    manifest.physical_file_count === manifest.entry_count + 1,
    "TASK_MANIFEST_PHYSICAL_COUNT_INVALID",
  );

  const declared = new Map();
  let previousPath = null;
  const collision = new Map();
  for (const entry of manifest.entries) {
    exactKeys(
      entry,
      ["repository_relative_path", "bytes", "sha256"],
      "TASK_MANIFEST_ENTRY_FIELD_SET_INVALID",
    );
    validateRepositoryPath(entry.repository_relative_path, TASK_REPO_PREFIX);
    need(
      entry.repository_relative_path !== TASK_MANIFEST_REPO_PATH,
      "TASK_MANIFEST_SELF_INCLUDED",
    );
    need(
      previousPath === null ||
        compareCodePoints(previousPath, entry.repository_relative_path) < 0,
      "TASK_MANIFEST_ENTRY_ORDER_NOT_CANONICAL",
      { previous: previousPath, current: entry.repository_relative_path },
    );
    previousPath = entry.repository_relative_path;
    need(
      !declared.has(entry.repository_relative_path),
      "TASK_MANIFEST_DUPLICATE_PATH",
    );
    const collisionKey =
      entry.repository_relative_path.normalize("NFC").toLocaleLowerCase("en-US");
    need(!collision.has(collisionKey), "TASK_MANIFEST_CASE_OR_NFC_COLLISION");
    collision.set(collisionKey, entry.repository_relative_path);
    need(Number.isInteger(entry.bytes) && entry.bytes >= 0,
      "TASK_MANIFEST_ENTRY_BYTES_INVALID");
    need(/^[A-F0-9]{64}$/.test(entry.sha256),
      "TASK_MANIFEST_ENTRY_SHA256_INVALID");
    declared.set(entry.repository_relative_path, entry);
  }

  const actualFiles = listFilesStrict(taskRoot, "TASK_ARTIFACT")
    .filter((absolute) =>
      posix(path.relative(gitRoot, absolute)) !== TASK_MANIFEST_REPO_PATH)
    .map((absolute) => {
      const readFile = secureReadFile(absolute, taskRoot, "TASK_ARTIFACT_FILE");
      return {
        repository_relative_path: posix(path.relative(gitRoot, absolute)),
        bytes: readFile.bytes.length,
        sha256: sha256(readFile.bytes),
      };
    })
    .sort((left, right) =>
      compareCodePoints(
        left.repository_relative_path,
        right.repository_relative_path,
      ));
  need(
    actualFiles.length === manifest.entry_count,
    "TASK_MANIFEST_ACTUAL_COUNT_MISMATCH",
    { declared: manifest.entry_count, actual: actualFiles.length },
  );
  const actualMap = new Map(
    actualFiles.map((entry) => [entry.repository_relative_path, entry]),
  );
  for (const [entryPath, entry] of declared) {
    const actual = actualMap.get(entryPath);
    need(Boolean(actual), "TASK_MANIFEST_EXTRA_DECLARED_PATH", {
      path: entryPath,
    });
    need(
      actual.bytes === entry.bytes && actual.sha256 === entry.sha256,
      "TASK_MANIFEST_ENTRY_BINDING_MISMATCH",
      { path: entryPath },
    );
  }
  need(
    declared.size === actualMap.size,
    "TASK_MANIFEST_MISSING_DECLARED_PATH",
  );
  const calculatedHash = recomputeManifestHash(manifest);
  need(
    calculatedHash === manifest.manifest_sha256,
    "TASK_MANIFEST_JCS_HASH_MISMATCH",
    { expected: manifest.manifest_sha256, actual: calculatedHash },
  );
  return {
    exact_bytes_sha256: sha256(read.bytes),
    manifest_sha256: calculatedHash,
    entry_count: manifest.entry_count,
    physical_file_count: manifest.physical_file_count,
    assurance: manifest.assurance,
    handle_binding: read.handle_binding,
    entries_digest: jcsSha256(manifest.entries),
  };
}

function loadFixtureSecure(fixturePath) {
  const resolved = path.resolve(fixturePath);
  const lexicalRelative = path.relative(fixtureRoot, resolved);
  need(
    lexicalRelative !== "" &&
      !lexicalRelative.startsWith("..") &&
      !path.isAbsolute(lexicalRelative),
    "FIXTURE_SCOPE_ESCAPE",
  );
  assertNoReparseLayers(resolved, fixtureRoot, "FIXTURE");
  const read = secureReadJson(resolved, fixtureRoot, "FIXTURE");
  exactKeys(
    read.value,
    ["fixture_id", "mutation", "expected_error_code"],
    "FIXTURE_FIELD_SET_INVALID",
  );
  need(
    typeof read.value.fixture_id === "string" &&
      typeof read.value.expected_error_code === "string" &&
      typeof read.value.mutation === "object" &&
      read.value.mutation !== null,
    "FIXTURE_SCHEMA_INVALID",
  );
  const serialized = JSON.stringify(read.value.mutation);
  need(
    !/(task_root|product_root|git_root|allowed_path|allowed_scope)/i.test(serialized),
    "FIXTURE_SCOPE_WIDENING_FIELD_NOT_ALLOWED",
  );
  return read.value;
}

function applyCandidateMutation(exact, fixture) {
  const result = structuredClone(exact);
  const mutation = fixture?.mutation;
  if (!mutation) return result;
  const firstPath = result.files[0]?.repository_relative_path;
  if (mutation.kind === "candidate_missing") result.files.shift();
  else if (mutation.kind === "candidate_extra") {
    result.files.push({
      ...structuredClone(result.files[0]),
      repository_relative_path:
        "輕軌系統/.codex/tasks/GOV-MAGP-PHASE-0-1-IMPLEMENTATION-01/EXTRA.json",
    });
  } else if (mutation.kind === "candidate_duplicate") {
    result.files.push(structuredClone(result.files[0]));
  } else if (mutation.kind === "path_nfc") {
    result.files[0].repository_relative_path =
      `${TASK_REPO_PREFIX}Cafe\u0301.json`;
  } else if (mutation.kind === "path_absolute") {
    result.files[0].repository_relative_path = "/absolute/path.json";
  } else if (mutation.kind === "path_unc") {
    result.files[0].repository_relative_path = "//server/share/path.json";
  } else if (mutation.kind === "path_drive") {
    result.files[0].repository_relative_path = "C:relative.json";
  } else if (mutation.kind === "path_backslash") {
    result.files[0].repository_relative_path =
      "輕軌系統\\.codex\\tasks\\bad.json";
  } else if (mutation.kind === "path_traversal") {
    result.files[0].repository_relative_path =
      "輕軌系統/.codex/../escape.json";
  } else if (mutation.kind === "path_case_collision") {
    result.files.push({
      ...structuredClone(result.files[0]),
      repository_relative_path: firstPath.toLocaleLowerCase("en-US"),
    });
  } else if (mutation.kind === "wrong_file_sha256" ||
      mutation.kind === "producer_pass_underlying_mismatch") {
    result.files[0].sha256 = "0".repeat(64);
  } else if (mutation.kind === "wrong_blob_oid") {
    result.files[0].git_state.tracked_oid = "0".repeat(40);
  }
  return result;
}

function verifyHistorical(fixture) {
  const expected = structuredClone(EXPECTED_HISTORICAL);
  if (fixture?.mutation?.kind === "historical_mismatch") {
    expected.remediation_01.manifest_sha256 = "0".repeat(64);
  }
  const results = {};
  for (const [key, binding] of Object.entries(expected)) {
    const root = path.join(tasksRoot, binding.task_id);
    const actual = digestTree(root, `HISTORICAL_${key.toUpperCase()}`);
    need(
      actual.file_count === binding.file_count,
      "HISTORICAL_FILE_COUNT_MISMATCH",
      { key, expected: binding.file_count, actual: actual.file_count },
    );
    need(
      actual.manifest_sha256 === binding.manifest_sha256,
      "HISTORICAL_MANIFEST_MISMATCH",
      {
        key,
        expected: binding.manifest_sha256,
        actual: actual.manifest_sha256,
      },
    );
    results[key] = {
      task_id: binding.task_id,
      file_count: actual.file_count,
      manifest_sha256: actual.manifest_sha256,
    };
  }
  return results;
}

function verifyDependency(exact, fixture) {
  const read = secureReadJson(
    dependencyPath,
    path.dirname(dependencyPath),
    "DEPENDENCY_SOURCE",
  );
  need(
    sha256(read.bytes) === EXPECTED_DEPENDENCY_SHA256,
    "DEPENDENCY_SOURCE_HASH_MISMATCH",
  );
  const dependency = structuredClone(read.value);
  if (fixture?.mutation?.kind === "dependency_mismatch") {
    dependency.direct_replay_inputs[0].sha256 = "0".repeat(64);
  }
  if (fixture?.mutation?.kind === "provenance_mismatch") {
    dependency.transitive_provenance_groups[0].expected_manifest_sha256 =
      "0".repeat(64);
  }
  need(
    dependency.direct_replay_inputs.length === EXPECTED_PATH_COUNT,
    "DEPENDENCY_DIRECT_COUNT_MISMATCH",
  );
  const exactMap = new Map(
    exact.files.map((entry) => [entry.repository_relative_path, entry]),
  );
  const direct = new Set();
  for (const entry of dependency.direct_replay_inputs) {
    validateRepositoryPath(entry.repository_relative_path);
    need(!direct.has(entry.repository_relative_path),
      "DEPENDENCY_DIRECT_DUPLICATE");
    direct.add(entry.repository_relative_path);
    const candidate = exactMap.get(entry.repository_relative_path);
    need(Boolean(candidate), "DEPENDENCY_DIRECT_EXTRA");
    need(
      candidate.sha256 === entry.sha256 &&
        candidate.file_size_bytes === entry.file_size_bytes,
      "DEPENDENCY_DIRECT_BINDING_MISMATCH",
    );
  }
  need(direct.size === exactMap.size, "DEPENDENCY_DIRECT_MISSING");
  need(
    dependency.transitive_provenance_groups.length === 17,
    "PROVENANCE_GROUP_COUNT_MISMATCH",
  );
  const declared = new Map();
  for (const entry of dependency.transitive_provenance_entries) {
    validateRepositoryPath(entry.repository_relative_path);
    need(!declared.has(entry.repository_relative_path),
      "PROVENANCE_ENTRY_DUPLICATE");
    declared.set(entry.repository_relative_path, entry);
  }
  const actualPaths = new Set();
  const groups = [];
  for (const group of dependency.transitive_provenance_groups) {
    validateRepositoryPath(`${group.repository_relative_root}/_root`);
    const root = path.join(gitRoot, ...group.repository_relative_root.split("/"));
    const actual = digestTree(
      root,
      `PROVENANCE_${group.task_id.replace(/[^A-Za-z0-9]/g, "_")}`,
    );
    need(
      actual.file_count === group.expected_file_count,
      "PROVENANCE_FILE_COUNT_MISMATCH",
      { task_id: group.task_id },
    );
    need(
      actual.manifest_sha256 === group.expected_manifest_sha256,
      "PROVENANCE_MANIFEST_MISMATCH",
      { task_id: group.task_id },
    );
    for (const file of actual.entries) {
      const repositoryPath =
        `${group.repository_relative_root}/${file.relative_path}`;
      actualPaths.add(repositoryPath);
      const expected = declared.get(repositoryPath);
      need(Boolean(expected), "PROVENANCE_ENTRY_MISSING");
      need(
        expected.sha256 === file.sha256 &&
          expected.file_size_bytes === file.bytes &&
          expected.task_id === group.task_id,
        "PROVENANCE_ENTRY_BINDING_MISMATCH",
      );
    }
    groups.push({
      task_id: group.task_id,
      file_count: actual.file_count,
      manifest_sha256: actual.manifest_sha256,
    });
  }
  need(actualPaths.size === declared.size, "PROVENANCE_ENTRY_EXTRA");
  need(
    dependency.external_hash_bound_references.length === 11,
    "EXTERNAL_REFERENCE_METADATA_COUNT_MISMATCH",
  );
  const external = dependency.external_hash_bound_references.map((entry) => {
    need(
      typeof entry.normalized_absolute_path === "string" &&
        /^[A-F0-9]{64}$/.test(entry.sha256_recorded) &&
        Number.isInteger(entry.file_size_bytes_recorded),
      "EXTERNAL_REFERENCE_METADATA_INVALID",
    );
    need(
      entry.repository_external === true &&
        entry.dereferenced_during_proposal_02 === false &&
        entry.required_for_replay === false,
      "EXTERNAL_REFERENCE_BOUNDARY_INVALID",
    );
    return {
      normalized_absolute_path: entry.normalized_absolute_path,
      sha256_recorded: entry.sha256_recorded,
      file_size_bytes_recorded: entry.file_size_bytes_recorded,
      content_status: "NOT_VERIFIED_CONTENT",
      metadata_status: "BOUND_ONLY",
    };
  });
  return {
    source_exact_bytes_sha256: sha256(read.bytes),
    direct_count: direct.size,
    provenance_group_count: groups.length,
    provenance_entry_count: actualPaths.size,
    provenance_groups: groups,
    external_reference_count: external.length,
    external_references: external,
    external_content_read: false,
    blocking_unresolved_count: 0,
    handle_binding: read.handle_binding,
  };
}

function snapshotRepository(fixture, phase) {
  assertNoReparseLayers(gitRoot, gitRoot, "GIT_ROOT");
  assertNoReparseLayers(productRoot, gitRoot, "PRODUCT_ROOT");
  assertNoReparseLayers(taskRoot, productRoot, "TASK_ROOT");
  assertNoReparseLayers(path.dirname(sourceManifestPath), productRoot,
    "SOURCE_TASK_ROOT");
  assertNoReparseLayers(path.dirname(previousProposalPath), productRoot,
    "PREVIOUS_TASK_ROOT");
  assertNoReparseLayers(path.dirname(phasePolicyPath), productRoot,
    "PHASE_POLICY_ROOT");
  const diagnostics = [];
  const actualGitRoot = posix(path.resolve(
    gitText(["rev-parse", "--show-toplevel"], diagnostics).stdout,
  ));
  need(actualGitRoot === EXPECTED_GIT_ROOT, "GIT_ROOT_BINDING_MISMATCH");
  const actualHead = gitText(["rev-parse", "HEAD"], diagnostics).stdout;
  const actualBranch = gitText(
    ["symbolic-ref", "--quiet", "--short", "HEAD"],
    diagnostics,
  ).stdout;
  const expectedHead =
    fixture?.mutation?.kind === "wrong_head" ? "0".repeat(40) : EXPECTED_HEAD;
  const expectedBranch =
    fixture?.mutation?.kind === "wrong_branch"
      ? "codex/not-the-bound-branch"
      : EXPECTED_BRANCH;
  need(actualHead === expectedHead, "HEAD_BINDING_MISMATCH");
  need(actualBranch === expectedBranch, "BRANCH_BINDING_MISMATCH");
  need(sha256(Buffer.from(actualHead, "utf8")) === EXPECTED_HEAD_BINDING,
    "HEAD_BINDING_HASH_MISMATCH");
  need(sha256(Buffer.from(actualBranch, "utf8")) === EXPECTED_BRANCH_BINDING,
    "BRANCH_BINDING_HASH_MISMATCH");
  const commitType = gitText(
    ["cat-file", "-t", actualHead],
    diagnostics,
  ).stdout;
  need(commitType === "commit", "HEAD_OBJECT_NOT_COMMIT");
  const treeOid = gitText(
    ["rev-parse", `${actualHead}^{tree}`],
    diagnostics,
  ).stdout;
  need(treeOid === EXPECTED_TREE, "HEAD_TREE_BINDING_MISMATCH");
  const treeType = gitText(["cat-file", "-t", treeOid], diagnostics).stdout;
  need(treeType === "tree", "HEAD_TREE_OBJECT_INVALID");
  const objectFormat = gitText(
    ["rev-parse", "--show-object-format"],
    diagnostics,
  ).stdout;
  need(["sha1", "sha256"].includes(objectFormat),
    "GIT_OBJECT_FORMAT_UNSUPPORTED");

  const sourceRead = secureReadJson(
    sourceManifestPath,
    path.dirname(sourceManifestPath),
    "SOURCE_MANIFEST",
  );
  const expectedSourceHash =
    fixture?.mutation?.kind === "wrong_source_manifest_hash"
      ? "0".repeat(64)
      : EXPECTED_SOURCE_MANIFEST_SHA256;
  need(
    sha256(sourceRead.bytes) === expectedSourceHash,
    "SOURCE_MANIFEST_SHA256_MISMATCH",
  );
  const exact = applyCandidateMutation(sourceRead.value, fixture);
  need(Array.isArray(exact.files), "SOURCE_MANIFEST_FILES_INVALID");
  const expectedPathCount =
    fixture?.mutation?.kind === "wrong_path_count" ? 146 : EXPECTED_PATH_COUNT;
  need(expectedPathCount === EXPECTED_PATH_COUNT, "BOUND_PATH_COUNT_MISMATCH");
  const pathSet = new Set();
  const collision = new Map();
  for (const entry of exact.files) {
    validateRepositoryPath(entry.repository_relative_path);
    need(!pathSet.has(entry.repository_relative_path), "CANDIDATE_PATH_DUPLICATE");
    pathSet.add(entry.repository_relative_path);
    const collisionKey =
      entry.repository_relative_path.normalize("NFC").toLocaleLowerCase("en-US");
    need(!collision.has(collisionKey), "CANDIDATE_CASE_OR_NFC_COLLISION");
    collision.set(collisionKey, entry.repository_relative_path);
  }
  need(exact.files.length === EXPECTED_PATH_COUNT, "CANDIDATE_PATH_COUNT_MISMATCH");
  need(pathSet.size === EXPECTED_PATH_COUNT, "CANDIDATE_UNIQUE_COUNT_MISMATCH");
  const sourceCount = exact.files.filter(
    (entry) => entry.partition === "SOURCE_7A_2",
  ).length;
  const attemptCount = exact.files.filter(
    (entry) => entry.partition === "ATTEMPT_1",
  ).length;
  need(
    sourceCount === EXPECTED_SOURCE_COUNT &&
      attemptCount === EXPECTED_ATTEMPT_COUNT,
    "CANDIDATE_PARTITION_MISMATCH",
  );
  const paths = exact.files.map((entry) => entry.repository_relative_path);

  const treeRows = [];
  const indexRows = [];
  const statusRows = [];
  const worktreeChanged = [];
  const indexChanged = [];
  const headDelta = [];
  const untracked = [];
  for (const group of batch(paths)) {
    treeRows.push(...parseTree(git([
      "ls-tree", "-z", actualHead, "--", ...group,
    ], diagnostics).stdout));
    indexRows.push(...parseIndex(git([
      "ls-files", "--stage", "-z", "--", ...group,
    ], diagnostics).stdout));
    statusRows.push(...parseStatus(git([
      "status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ...group,
    ], diagnostics).stdout));
    worktreeChanged.push(...zeroList(git([
      "diff", "--name-only", "-z", "--", ...group,
    ], diagnostics).stdout));
    indexChanged.push(...zeroList(git([
      "diff", "--cached", "--name-only", "-z", "--", ...group,
    ], diagnostics).stdout));
    headDelta.push(...zeroList(git([
      "diff", "--name-only", "-z", actualHead, "--", ...group,
    ], diagnostics).stdout));
    untracked.push(...zeroList(git([
      "ls-files", "--others", "--exclude-standard", "-z", "--", ...group,
    ], diagnostics).stdout));
  }
  if (fixture?.mutation?.kind === "index_changed") indexChanged.push(paths[0]);
  if (fixture?.mutation?.kind === "worktree_changed") {
    worktreeChanged.push(paths[0]);
  }
  need(statusRows.length === 0, "CANDIDATE_STATUS_NOT_CLEAN");
  need(worktreeChanged.length === 0, "CANDIDATE_WORKTREE_CHANGED");
  need(indexChanged.length === 0, "CANDIDATE_INDEX_CHANGED");
  need(headDelta.length === 0, "CANDIDATE_HEAD_DELTA_EXISTS");
  need(untracked.length === 0, "CANDIDATE_UNTRACKED_EXISTS");
  const treeMap = new Map(
    treeRows.map((entry) => [entry.repository_relative_path, entry]),
  );
  const indexMap = new Map(
    indexRows.map((entry) => [entry.repository_relative_path, entry]),
  );
  need(treeMap.size === EXPECTED_PATH_COUNT, "HEAD_TREE_ENTRY_COUNT_MISMATCH");
  need(indexMap.size === EXPECTED_PATH_COUNT, "INDEX_ENTRY_COUNT_MISMATCH");

  const ignoreInput = Buffer.from(`${paths.join("\0")}\0`, "utf8");
  const ignoreResult = git(
    ["check-ignore", "-z", "-v", "--no-index", "--stdin"],
    diagnostics,
    { input: ignoreInput, allowedExitCodes: [0, 1] },
  );
  if (fixture?.mutation?.kind === "ignore_permission_limitation") {
    diagnostics.push({
      args: ["check-ignore", "--self-test-permission-limitation"],
      stderr: "Permission denied while reading an effective ignore source",
    });
  }
  const ignored = parseIgnore(ignoreResult.stdout);
  need(ignored.length === 0, "CANDIDATE_IGNORED_PATH_EXISTS");
  const attrInput = Buffer.from(`${paths.join("\0")}\0`, "utf8");
  const attributes = parseAttributes(git([
    "check-attr",
    "-z",
    "--stdin",
    "text",
    "eol",
    "filter",
    "working-tree-encoding",
  ], diagnostics, { input: attrInput }).stdout);
  if (fixture?.mutation?.kind === "attribute_incomplete") {
    attributes.delete(paths[0]);
  }
  need(attributes.size === EXPECTED_PATH_COUNT,
    "ATTRIBUTE_EVIDENCE_INCOMPLETE");
  for (const repositoryPath of paths) {
    const value = attributes.get(repositoryPath);
    need(
      value &&
        ["text", "eol", "filter", "working-tree-encoding"].every(
          (name) => Object.hasOwn(value, name),
        ),
      "ATTRIBUTE_EVIDENCE_INCOMPLETE",
      { repository_relative_path: repositoryPath },
    );
  }

  const evidence = [];
  for (const sourceEntry of exact.files) {
    const repositoryPath = sourceEntry.repository_relative_path;
    const absolute = path.join(gitRoot, ...repositoryPath.split("/"));
    const read = secureReadFile(absolute, productRoot, "CANDIDATE");
    const actualSha = sha256(read.bytes);
    need(read.bytes.length === sourceEntry.file_size_bytes,
      "CANDIDATE_BYTES_MISMATCH");
    need(actualSha === sourceEntry.sha256, "CANDIDATE_SHA256_MISMATCH");
    const tree = treeMap.get(repositoryPath);
    const index = indexMap.get(repositoryPath);
    need(Boolean(tree), "CANDIDATE_MISSING_FROM_HEAD_TREE");
    need(Boolean(index), "CANDIDATE_MISSING_FROM_INDEX");
    need(tree.type === "blob" && index.stage === 0,
      "CANDIDATE_GIT_ENTRY_TYPE_INVALID");
    if (fixture?.mutation?.kind === "index_oid_mismatch" &&
        repositoryPath === paths[0]) {
      index.oid = "0".repeat(index.oid.length);
    }
    need(tree.oid === index.oid, "CANDIDATE_INDEX_HEAD_OID_MISMATCH");
    need(
      !sourceEntry.git_state?.tracked_oid ||
        tree.oid === sourceEntry.git_state.tracked_oid,
      "CANDIDATE_SOURCE_BLOB_OID_MISMATCH",
    );
    const rawOid = gitBlobOid(objectFormat, read.bytes);
    let filteredOid = gitText([
      "hash-object",
      `--path=${repositoryPath}`,
      "--",
      absolute,
    ], diagnostics).stdout;
    if (fixture?.mutation?.kind === "filter_oid_mismatch" &&
        repositoryPath === paths[0]) {
      filteredOid = "0".repeat(filteredOid.length);
    }
    need(
      rawOid === filteredOid && filteredOid === index.oid &&
        index.oid === tree.oid,
      "CANDIDATE_FILTER_OR_RAW_IDENTITY_MISMATCH",
    );
    const blobBytes = git(
      ["cat-file", "blob", tree.oid],
      diagnostics,
    ).stdout;
    need(blobBytes.equals(read.bytes), "CANDIDATE_HEAD_BLOB_BYTES_MISMATCH");
    evidence.push({
      repository_relative_path: repositoryPath,
      partition: sourceEntry.partition,
      bytes: read.bytes.length,
      sha256: actualSha,
      head_mode: tree.mode,
      head_blob_oid: tree.oid,
      index_mode: index.mode,
      index_blob_oid: index.oid,
      raw_blob_oid: rawOid,
      filtered_blob_oid: filteredOid,
      attributes: attributes.get(repositoryPath),
      handle_binding: read.handle_binding,
    });
  }
  const computedCandidateDigest = candidateDigest(evidence);
  need(
    computedCandidateDigest === EXPECTED_CANDIDATE_MANIFEST_SHA256,
    "CANDIDATE_MANIFEST_DIGEST_MISMATCH",
  );

  const dependency = verifyDependency(sourceRead.value, fixture);
  const historical = verifyHistorical(fixture);
  const taskManifest = verifyTaskManifest(fixture);
  const previous = secureReadJson(
    previousProposalPath,
    path.dirname(previousProposalPath),
    "PREVIOUS_ATTESTATION",
  );
  need(
    previous.value.trust_anchor_model ===
      "EXISTING_HEAD_EXACT_MANIFEST_ATTESTATION" &&
      previous.value.head === EXPECTED_HEAD &&
      previous.value.branch === EXPECTED_BRANCH &&
      previous.value.exact_path_count === EXPECTED_PATH_COUNT,
    "PREVIOUS_CANDIDATE_BINDING_MISMATCH",
  );
  const draft = secureReadJson(
    path.join(taskRoot, "existing-head-attestation-draft.json"),
    taskRoot,
    "ATTESTATION_DRAFT",
  );
  need(
    draft.value.anchor_object_type === "EXISTING_GIT_COMMIT_AND_TREE" &&
      draft.value.task_id === TASK_ID &&
      draft.value.trust_anchor_model ===
        "EXISTING_HEAD_EXACT_MANIFEST_ATTESTATION" &&
      draft.value.trust_anchor_candidate_status === "PROPOSED_NOT_ADOPTED" &&
      draft.value.creates_new_commit === false &&
      draft.value.empty_commit_used === false &&
      draft.value.new_tree_delta_claimed === false &&
      draft.value.head === EXPECTED_HEAD &&
      draft.value.head_binding_sha256 === EXPECTED_HEAD_BINDING &&
      draft.value.head_tree_oid === EXPECTED_TREE &&
      draft.value.branch === EXPECTED_BRANCH &&
      draft.value.branch_binding_sha256 === EXPECTED_BRANCH_BINDING &&
      draft.value.exact_path_count === EXPECTED_PATH_COUNT &&
      draft.value.source_7a_2_count === EXPECTED_SOURCE_COUNT &&
      draft.value.attempt_1_count === EXPECTED_ATTEMPT_COUNT &&
      draft.value.source_manifest_path ===
        "輕軌系統/.codex/tasks/GOV-MAGP-PHASE-0-1-GIT-TRUST-ANCHOR-PROPOSAL-02/exact-commit-paths.json" &&
      draft.value.source_manifest_sha256 ===
        EXPECTED_SOURCE_MANIFEST_SHA256 &&
      draft.value.candidate_manifest_sha256 ===
        EXPECTED_CANDIDATE_MANIFEST_SHA256 &&
      draft.value.assurance === "INTERNAL_CONSISTENCY_ONLY" &&
      draft.value.producer_evidence_authority ===
        "NON_AUTHORITATIVE_CANDIDATE_EVIDENCE" &&
      draft.value.human_model_selection_is_adoption === false &&
      draft.value.work_review_is_adoption === false &&
      draft.value.formal_human_adoption_completed === false &&
      draft.value.git_mutation_authorized === false,
    "ATTESTATION_DRAFT_BOUNDARY_INVALID",
  );
  const phasePolicy = secureReadJson(
    phasePolicyPath,
    path.dirname(phasePolicyPath),
    "PHASE_POLICY",
  );
  need(
    phasePolicy.value.authorized_write_paths.includes(".codex/**") &&
      phasePolicy.value.product_write_allowed === false &&
      phasePolicy.value.database_write_allowed === false &&
      ["stage", "commit", "push", "branch", "worktree", "merge", "stash",
        "reset", "restore", "clean"].every((action) =>
        phasePolicy.value.prohibited_git_actions.includes(action)),
    "PHASE_POLICY_BOUNDARY_INVALID",
  );

  const stagedGovernance = zeroList(git([
    "diff",
    "--cached",
    "--name-only",
    "-z",
    "--",
    "輕軌系統/AGENTS.md",
    "輕軌系統/.codex",
    "輕軌系統/.agents",
  ], diagnostics).stdout);
  need(stagedGovernance.length === 0, "STAGED_GOVERNANCE_PATH_EXISTS");

  const ignoreDiagnostics = diagnostics.filter((entry) =>
    /ignore|exclude|permission denied/i.test(entry.stderr));
  const otherDiagnostics = diagnostics.filter((entry) =>
    !/ignore|exclude|permission denied/i.test(entry.stderr));
  const comparable = {
    product_root: EXPECTED_PRODUCT_ROOT,
    git_root: actualGitRoot,
    head: actualHead,
    branch: actualBranch,
    commit_type: commitType,
    tree_oid: treeOid,
    tree_type: treeType,
    object_format: objectFormat,
    source_manifest_exact_bytes_sha256: sha256(sourceRead.bytes),
    source_manifest_handle: sourceRead.handle_binding,
    candidate_evidence_digest: jcsSha256(evidence),
    candidate_manifest_digest: computedCandidateDigest,
    dependency_digest: jcsSha256(dependency),
    historical_digest: jcsSha256(historical),
    task_manifest_exact_bytes_sha256: taskManifest.exact_bytes_sha256,
    task_manifest_core_sha256: taskManifest.manifest_sha256,
    task_manifest_entries_digest: taskManifest.entries_digest,
    previous_attestation_sha256: sha256(previous.bytes),
    previous_attestation_handle: previous.handle_binding,
    draft_attestation_sha256: sha256(draft.bytes),
    draft_attestation_handle: draft.handle_binding,
    phase_policy_sha256: sha256(phasePolicy.bytes),
    phase_policy_handle: phasePolicy.handle_binding,
    staged_governance_count: stagedGovernance.length,
    status_count: statusRows.length,
    worktree_changed_count: worktreeChanged.length,
    index_changed_count: indexChanged.length,
    head_delta_count: headDelta.length,
    untracked_count: untracked.length,
    ignored_count: ignored.length,
    ignore_diagnostics: ignoreDiagnostics,
    other_git_diagnostics: otherDiagnostics,
  };
  if (
    phase === "closing" &&
    fixture?.mutation?.kind === "closing_state_mismatch"
  ) {
    comparable.head = "f".repeat(40);
  }
  return {
    comparable,
    evidence: {
      exact_path_count: evidence.length,
      source_7a_2_count: sourceCount,
      attempt_1_count: attemptCount,
      candidate_manifest_digest: computedCandidateDigest,
      candidate_entries: evidence,
      dependency,
      historical,
      task_manifest: taskManifest,
      ignore_evidence: {
        status: ignoreDiagnostics.length === 0
          ? "VERIFIED"
          : "NOT_VERIFIED",
        ignored_count: ignoreDiagnostics.length === 0 ? ignored.length : null,
        diagnostics: ignoreDiagnostics,
      },
      unexpected_git_stderr: otherDiagnostics,
    },
    blockers: [
      ...(ignoreDiagnostics.length > 0
        ? [{
            code: "IGNORE_EVIDENCE_NOT_VERIFIED",
            detail: ignoreDiagnostics,
          }]
        : []),
      ...(otherDiagnostics.length > 0
        ? [{
            code: "GIT_QUERY_STDERR_NOT_EMPTY",
            detail: otherDiagnostics,
          }]
        : []),
    ],
  };
}

function runCompleteValidation(fixture = null) {
  need(
    posix(path.resolve(productRoot)) === EXPECTED_PRODUCT_ROOT,
    "PRODUCT_ROOT_BINDING_MISMATCH",
  );
  need(
    posix(path.resolve(gitRoot)) === EXPECTED_GIT_ROOT,
    "DERIVED_GIT_ROOT_BINDING_MISMATCH",
  );
  need(
    posix(path.resolve(taskRoot)) ===
      `${EXPECTED_PRODUCT_ROOT}/.codex/tasks/${TASK_ID}`,
    "TASK_ROOT_BINDING_MISMATCH",
  );
  const opening = snapshotRepository(fixture, "opening");
  const closing = snapshotRepository(fixture, "closing");
  const openingBinding = jcsSha256(opening.comparable);
  const closingBinding = jcsSha256(closing.comparable);
  need(
    openingBinding === closingBinding,
    "CLOSING_STATE_REBOUND_MISMATCH",
    { opening: openingBinding, closing: closingBinding },
  );
  const blockerMap = new Map();
  for (const blocker of [...opening.blockers, ...closing.blockers]) {
    if (!blockerMap.has(blocker.code)) blockerMap.set(blocker.code, blocker);
  }
  const blockers = [...blockerMap.values()];
  if (fixture?.mutation?.kind === "ignore_permission_limitation") {
    need(
      blockers.some((blocker) => blocker.code === "IGNORE_EVIDENCE_NOT_VERIFIED"),
      "IGNORE_PERMISSION_LIMITATION_NOT_DETECTED",
    );
  }
  return {
    schema_version: 1,
    validator: "SINGLE_FORMAL_PRODUCTION_ENTRY",
    execution_mode: "COMPLETE_CONTRACT_ONLY",
    production_contract_status: blockers.length === 0 ? "VALID" : "BLOCKER",
    ...(blockers.length === 0
      ? { candidate_verdict: "READY_FOR_WORK_READ_ONLY_REVIEW" }
      : {}),
    assurance: "INTERNAL_CONSISTENCY_ONLY",
    opening_snapshot_binding_sha256: openingBinding,
    closing_snapshot_binding_sha256: closingBinding,
    closing_rebound_status: "MATCH",
    opening_evidence: opening.evidence,
    blockers,
    not_verified_items: [
      ...blockers.map((blocker) => blocker.code),
      "EXTERNAL_REFERENCE_CONTENT",
    ],
    authority_boundaries: {
      human_model_selection_is_adoption: false,
      work_review_is_adoption: false,
      formal_human_adoption_completed: false,
      git_mutation_executed: false,
      product_implementation_authorized: false,
    },
  };
}

function cliUsage(detail = null) {
  return {
    schema_version: 1,
    validator: "SINGLE_FORMAL_PRODUCTION_ENTRY",
    execution_mode: "USAGE_ERROR",
    error_code: "CLI_USAGE_ERROR",
    detail,
    exit_code: 2,
  };
}

function writeJsonStdout(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function runCli(argv) {
  if (argv.length === 0) {
    const result = runCompleteValidation();
    writeJsonStdout(result);
    process.exitCode = result.production_contract_status === "VALID" ? 0 : 1;
    return;
  }
  if (argv.length === 2 && argv[0] === "--self-test-fixture") {
    try {
      const fixture = loadFixtureSecure(argv[1]);
      try {
        const result = runCompleteValidation(fixture);
        const matchingBlocker = result.blockers.find(
          (blocker) => blocker.code === fixture.expected_error_code,
        );
        if (matchingBlocker) {
          writeJsonStdout({
            schema_version: 1,
            validator: "SINGLE_FORMAL_PRODUCTION_ENTRY",
            execution_mode: "SELF_TEST_REJECTION",
            error_code: matchingBlocker.code,
            result: "REJECTED",
            exit_code: 2,
          });
          process.exitCode = 2;
          return;
        }
        throw new ValidationError("SELF_TEST_DID_NOT_REJECT", {
          fixture_id: fixture.fixture_id,
          contract_status: result.production_contract_status,
        });
      } catch (error) {
        if (
          error instanceof ValidationError &&
          error.code === fixture.expected_error_code
        ) {
          writeJsonStdout({
            schema_version: 1,
            validator: "SINGLE_FORMAL_PRODUCTION_ENTRY",
            execution_mode: "SELF_TEST_REJECTION",
            error_code: error.code,
            result: "REJECTED",
            exit_code: 2,
          });
          process.exitCode = 2;
          return;
        }
        throw error;
      }
    } catch (error) {
      const normalized = error instanceof ValidationError
        ? error
        : new ValidationError("SELF_TEST_UNEXPECTED_ERROR", {
            message: error.message,
          });
      writeJsonStdout({
        schema_version: 1,
        validator: "SINGLE_FORMAL_PRODUCTION_ENTRY",
        execution_mode: "SELF_TEST_REJECTION",
        error_code: normalized.code,
        detail: normalized.detail,
        result: "REJECTED",
        exit_code: 2,
      });
      process.exitCode = 2;
      return;
    }
  }
  writeJsonStdout(cliUsage({ argv }));
  process.exitCode = 2;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invoked === fileURLToPath(import.meta.url)) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    const normalized = error instanceof ValidationError
      ? error
      : new ValidationError("PRODUCTION_VALIDATOR_UNEXPECTED_FAILURE", {
          message: error.message,
          stack: error.stack,
        });
    writeJsonStdout({
      schema_version: 1,
      validator: "SINGLE_FORMAL_PRODUCTION_ENTRY",
      execution_mode: "COMPLETE_CONTRACT_ONLY",
      production_contract_status: "BLOCKER",
      error_code: normalized.code,
      detail: normalized.detail,
      assurance: "INTERNAL_CONSISTENCY_ONLY",
      git_mutation_executed: false,
    });
    process.exitCode = 1;
  }
}

export {
  TASK_ID,
  TASK_REPO_PREFIX,
  TASK_MANIFEST_REPO_PATH,
  compareCodePoints,
  jcs,
  recomputeManifestHash,
};
