import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const TASK_ID =
  "GOV-MAGP-PHASE-0-1-EXISTING-HEAD-TRUST-ANCHOR-ATTESTATION-REMEDIATION-03";
export const PREDECESSOR_ID =
  "GOV-MAGP-PHASE-0-1-EXISTING-HEAD-TRUST-ANCHOR-ATTESTATION-REMEDIATION-02";
export const EXPECTED_HEAD = "22baa18784a081dd8c0d8a3ce177ba00363251de";
export const EXPECTED_BRANCH = "codex/precheck-template-maintenance";
export const EXPECTED_TREE = "c6f30a81ff45273aca851126160f2588937d2550";
export const EXPECTED_PREDECESSOR_MANIFEST_FILE_SHA256 =
  "768B32301C8A8F6D79A3CEA00287882D5A13C75DE8FD3E1BD4CE7338C0C2D842";
export const EXPECTED_PREDECESSOR_INTERNAL_MANIFEST_SHA256 =
  "1818373460317FD1B82321A63DF2034862167EC7076EFC9F84F759A911BBC826";
export const EXPECTED_PREDECESSOR_MATRIX_SHA256 =
  "2ECD72BAF53115D59BDE242AF84F465734F51016BDFF888B139F9EA0D1EA2598";
export const EXPECTED_AUTHORIZATION_ATTACHMENT_SHA256 =
  "A5F631432CF5A860A29A462ABC3FFD9666F34F198C936A585DF6C532B737C6AD";

export const taskRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const productRoot = path.resolve(taskRoot, "..", "..", "..");
export const gitRoot = path.resolve(productRoot, "..");
export const predecessorRoot = path.join(
  productRoot,
  ".codex",
  "tasks",
  PREDECESSOR_ID,
);
export const expectedTaskRoot = path.resolve(
  "C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統/.codex/tasks",
  TASK_ID,
);
export const expectedProductRoot = path.resolve(
  "C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統",
);
export const expectedGitRoot = path.resolve(
  "C:/Users/a2306/Desktop/code/ntmc.yaml",
);
export const safeDirectory = "safe.directory=C:/Users/a2306/Desktop/code/ntmc.yaml";
export const taskRepoPrefix =
  `輕軌系統/.codex/tasks/${TASK_ID}/`;
export const subjectManifestRepoPath =
  `${taskRepoPrefix}verification-subject-manifest.json`;
export const taskManifestRepoPath =
  `${taskRepoPrefix}task-artifact-manifest.json`;

export class ValidationError extends Error {
  constructor(code, detail = null) {
    super(code);
    this.name = "ValidationError";
    this.code = code;
    this.detail = detail;
  }
}

export function need(condition, code, detail = null) {
  if (!condition) throw new ValidationError(code, detail);
}

export function posix(value) {
  return value.split(path.sep).join("/");
}

export function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

export function compareCodePoints(left, right) {
  const a = Array.from(left, (character) => character.codePointAt(0));
  const b = Array.from(right, (character) => character.codePointAt(0));
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] < b[index]) return -1;
    if (a[index] > b[index]) return 1;
  }
  return a.length - b.length;
}

export function jcs(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    need(Number.isFinite(value), "JCS_NON_FINITE_NUMBER");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  need(typeof value === "object", "JCS_UNSUPPORTED_TYPE");
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`)
    .join(",")}}`;
}

export function jcsSha256(value) {
  return sha256(Buffer.from(jcs(value), "utf8"));
}

export function ensureRoots() {
  need(taskRoot === expectedTaskRoot, "TASK_ROOT_BINDING_MISMATCH", {
    expected: posix(expectedTaskRoot),
    actual: posix(taskRoot),
  });
  need(productRoot === expectedProductRoot, "PRODUCT_ROOT_BINDING_MISMATCH");
  need(gitRoot === expectedGitRoot, "GIT_ROOT_BINDING_MISMATCH");
}

function isWithin(absolute, root) {
  const relative = path.relative(root, absolute);
  return relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function assertNoReparse(absolute, allowedRoot, codePrefix) {
  const target = path.resolve(absolute);
  const root = path.resolve(allowedRoot);
  need(isWithin(target, root), `${codePrefix}_LEXICAL_ESCAPE`);
  need(fs.existsSync(root), `${codePrefix}_ROOT_MISSING`);
  const rootStat = fs.lstatSync(root);
  need(!rootStat.isSymbolicLink(), `${codePrefix}_ROOT_REPARSE`);
  const rootReal = fs.realpathSync.native(root);
  need(path.resolve(rootReal) === root, `${codePrefix}_ROOT_REALPATH_MISMATCH`);
  let current = root;
  for (const segment of path.relative(root, target).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    need(fs.existsSync(current), `${codePrefix}_LAYER_MISSING`, {
      path: posix(current),
    });
    need(
      !fs.lstatSync(current).isSymbolicLink(),
      `${codePrefix}_REPARSE_POINT_NOT_ALLOWED`,
      { path: posix(current) },
    );
  }
  const real = fs.realpathSync.native(target);
  need(isWithin(real, rootReal), `${codePrefix}_REALPATH_ESCAPE`);
  return real;
}

export function secureRead(absolute, allowedRoot, codePrefix) {
  assertNoReparse(absolute, allowedRoot, codePrefix);
  const handle = fs.openSync(absolute, "r");
  try {
    const before = fs.fstatSync(handle);
    need(before.isFile(), `${codePrefix}_NOT_FILE`);
    const bytes = fs.readFileSync(handle);
    const after = fs.fstatSync(handle);
    need(
      before.dev === after.dev &&
        before.ino === after.ino &&
        before.size === after.size &&
        before.mtimeMs === after.mtimeMs,
      `${codePrefix}_HANDLE_CHANGED`,
    );
    need(bytes.length === before.size, `${codePrefix}_SHORT_READ`);
    return {
      bytes,
      handle_binding: {
        dev: before.dev,
        ino: before.ino,
        size: before.size,
        mtime_ms: before.mtimeMs,
      },
    };
  } finally {
    fs.closeSync(handle);
  }
}

export function secureJson(absolute, allowedRoot, codePrefix) {
  const read = secureRead(absolute, allowedRoot, codePrefix);
  try {
    return { ...read, value: JSON.parse(read.bytes.toString("utf8")) };
  } catch (error) {
    throw new ValidationError(`${codePrefix}_INVALID_JSON`, {
      message: error.message,
    });
  }
}

export function listFilesStrict(root, codePrefix) {
  assertNoReparse(root, root, codePrefix);
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      need(!entry.isSymbolicLink(), `${codePrefix}_REPARSE_POINT_NOT_ALLOWED`, {
        path: posix(absolute),
      });
      need(!entry.name.toLowerCase().startsWith(".env"),
        `${codePrefix}_FORBIDDEN_ENV_PATH`);
      if (entry.isDirectory()) stack.push(absolute);
      else {
        need(entry.isFile(), `${codePrefix}_NON_FILE_ENTRY`);
        files.push(absolute);
      }
    }
  }
  return files.sort((left, right) => compareCodePoints(posix(left), posix(right)));
}

export function writeJson(relative, value) {
  const absolute = path.join(taskRoot, relative);
  need(path.resolve(absolute).startsWith(`${taskRoot}${path.sep}`),
    "WRITE_SCOPE_ESCAPE");
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function writeText(relative, value) {
  const absolute = path.join(taskRoot, relative);
  need(path.resolve(absolute).startsWith(`${taskRoot}${path.sep}`),
    "WRITE_SCOPE_ESCAPE");
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, value, "utf8");
}

export function git(args, options = {}) {
  const result = spawnSync(
    "git",
    ["-c", safeDirectory, "-C", posix(gitRoot), ...args],
    {
      cwd: productRoot,
      input: options.input,
      encoding: options.encoding ?? "utf8",
      windowsHide: true,
      maxBuffer: 512 * 1024 * 1024,
    },
  );
  const allowed = options.allowedExitCodes ?? [0];
  need(allowed.includes(result.status), "READ_ONLY_GIT_QUERY_FAILED", {
    args,
    status: result.status,
    stderr: String(result.stderr ?? ""),
  });
  return {
    exit_code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    args,
  };
}

export function gitText(args, options = {}) {
  const result = git(args, { ...options, encoding: "utf8" });
  return {
    ...result,
    stdout: String(result.stdout).trim(),
    stderr: String(result.stderr).trim(),
  };
}

export function validateRepoPath(value, prefix = "輕軌系統/") {
  need(typeof value === "string" && value.length > 0, "PATH_NOT_STRING");
  need(value.normalize("NFC") === value, "PATH_NOT_NFC", { path: value });
  need(!value.includes("\\"), "PATH_BACKSLASH_NOT_ALLOWED", { path: value });
  need(!value.startsWith("//"), "PATH_UNC_NOT_ALLOWED", { path: value });
  need(!/^[A-Za-z]:/.test(value), "PATH_DRIVE_NOT_ALLOWED", { path: value });
  need(!path.posix.isAbsolute(value), "PATH_ABSOLUTE_NOT_ALLOWED", { path: value });
  need(
    !value.split("/").some((segment) => ["", ".", ".."].includes(segment)),
    "PATH_TRAVERSAL_NOT_ALLOWED",
    { path: value },
  );
  need(value.startsWith(prefix), "PATH_SCOPE_PREFIX_MISMATCH", { path: value });
  need(
    !value.split("/").some((segment) =>
      segment.toLowerCase().startsWith(".env")),
    "FORBIDDEN_ENV_PATH",
    { path: value },
  );
}

export function predecessorBaseline() {
  const manifestPath = path.join(predecessorRoot, "task-artifact-manifest.json");
  const matrixPath = path.join(
    predecessorRoot,
    "production-rejection-matrix-results.json",
  );
  const manifestRead = secureJson(manifestPath, predecessorRoot, "PREDECESSOR_MANIFEST");
  const matrixRead = secureRead(matrixPath, predecessorRoot, "PREDECESSOR_MATRIX");
  need(
    sha256(manifestRead.bytes) === EXPECTED_PREDECESSOR_MANIFEST_FILE_SHA256,
    "PREDECESSOR_MANIFEST_FILE_HASH_MISMATCH",
  );
  need(
    sha256(matrixRead.bytes) === EXPECTED_PREDECESSOR_MATRIX_SHA256,
    "PREDECESSOR_MATRIX_HASH_MISMATCH",
  );
  const manifest = manifestRead.value;
  need(manifest.manifest_sha256 === EXPECTED_PREDECESSOR_INTERNAL_MANIFEST_SHA256,
    "PREDECESSOR_INTERNAL_MANIFEST_BINDING_MISMATCH");
  const core = structuredClone(manifest);
  delete core.manifest_sha256;
  need(jcsSha256(core) === manifest.manifest_sha256,
    "PREDECESSOR_INTERNAL_MANIFEST_RECOMPUTE_MISMATCH");
  need(manifest.entry_count === 54 && manifest.physical_file_count === 55,
    "PREDECESSOR_COUNT_MISMATCH");
  need(Array.isArray(manifest.entries) && manifest.entries.length === 54,
    "PREDECESSOR_ENTRIES_INVALID");
  const files = listFilesStrict(predecessorRoot, "PREDECESSOR_TREE");
  need(files.length === 55, "PREDECESSOR_PHYSICAL_COUNT_MISMATCH");
  const verified = [];
  for (const entry of manifest.entries) {
    validateRepoPath(entry.repository_relative_path,
      `輕軌系統/.codex/tasks/${PREDECESSOR_ID}/`);
    const absolute = path.join(
      gitRoot,
      ...entry.repository_relative_path.split("/"),
    );
    const read = secureRead(absolute, predecessorRoot, "PREDECESSOR_ENTRY");
    need(read.bytes.length === entry.bytes, "PREDECESSOR_ENTRY_BYTES_MISMATCH", {
      path: entry.repository_relative_path,
    });
    need(sha256(read.bytes) === entry.sha256,
      "PREDECESSOR_ENTRY_HASH_MISMATCH", {
        path: entry.repository_relative_path,
      });
    verified.push({
      repository_relative_path: entry.repository_relative_path,
      bytes: read.bytes.length,
      sha256: sha256(read.bytes),
    });
  }
  return {
    task_id: PREDECESSOR_ID,
    disposition: "CLOSED_AS_FAILED_AND_FROZEN",
    manifest_file_sha256: sha256(manifestRead.bytes),
    internal_manifest_sha256: manifest.manifest_sha256,
    physical_file_count: files.length,
    manifest_entry_count: verified.length,
    matrix_file_sha256: sha256(matrixRead.bytes),
    entries: verified,
  };
}

export function openingGitBindings() {
  const head = gitText(["rev-parse", "HEAD"]);
  const branch = gitText(["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const tree = gitText(["rev-parse", `${EXPECTED_HEAD}^{tree}`]);
  const root = gitText(["rev-parse", "--show-toplevel"]);
  need(head.stdout === EXPECTED_HEAD, "HEAD_BINDING_MISMATCH");
  need(branch.stdout === EXPECTED_BRANCH, "BRANCH_BINDING_MISMATCH");
  need(tree.stdout === EXPECTED_TREE, "TREE_BINDING_MISMATCH");
  need(path.resolve(root.stdout) === expectedGitRoot, "GIT_ROOT_BINDING_MISMATCH");
  return {
    head: head.stdout,
    branch: branch.stdout,
    tree: tree.stdout,
    git_root: posix(path.resolve(root.stdout)),
    diagnostics: [head.stderr, branch.stderr, tree.stderr, root.stderr]
      .filter(Boolean),
  };
}

export function verificationSubjectHash(manifest) {
  const core = structuredClone(manifest);
  delete core.verification_subject_manifest_hash;
  return jcsSha256(core);
}

export function taskManifestHash(manifest) {
  const core = structuredClone(manifest);
  delete core.internal_manifest_sha256;
  return jcsSha256(core);
}

export function verifySubjectManifest() {
  const absolute = path.join(taskRoot, "verification-subject-manifest.json");
  const read = secureJson(absolute, taskRoot, "SUBJECT_MANIFEST");
  const manifest = read.value;
  need(manifest.schema_version === 1, "SUBJECT_MANIFEST_SCHEMA_INVALID");
  need(manifest.task_id === TASK_ID, "SUBJECT_MANIFEST_TASK_ID_INVALID");
  need(manifest.freeze_stage === "STAGE_A_VERIFICATION_SUBJECT_FREEZE",
    "SUBJECT_MANIFEST_STAGE_INVALID");
  need(manifest.self_exclusion?.excluded_path === subjectManifestRepoPath,
    "SUBJECT_MANIFEST_SELF_EXCLUSION_INVALID");
  need(manifest.path_sort === "UNICODE_NFC_ORDINAL_CODE_POINT",
    "SUBJECT_MANIFEST_SORT_CONTRACT_INVALID");
  need(manifest.canonicalization === "RFC8785_JCS",
    "SUBJECT_MANIFEST_CANONICALIZATION_INVALID");
  need(Array.isArray(manifest.entries), "SUBJECT_MANIFEST_ENTRIES_INVALID");
  need(manifest.entry_count === manifest.entries.length,
    "SUBJECT_MANIFEST_ENTRY_COUNT_INVALID");
  let previous = null;
  const seen = new Set();
  for (const entry of manifest.entries) {
    validateRepoPath(entry.repository_relative_path, taskRepoPrefix);
    need(entry.repository_relative_path !== subjectManifestRepoPath,
      "SUBJECT_MANIFEST_SELF_INCLUDED");
    need(
      previous === null ||
        compareCodePoints(previous, entry.repository_relative_path) < 0,
      "SUBJECT_MANIFEST_ORDER_INVALID",
    );
    previous = entry.repository_relative_path;
    need(!seen.has(entry.repository_relative_path),
      "SUBJECT_MANIFEST_DUPLICATE_PATH");
    seen.add(entry.repository_relative_path);
    const absoluteEntry = path.join(
      gitRoot,
      ...entry.repository_relative_path.split("/"),
    );
    const entryRead = secureRead(absoluteEntry, taskRoot, "SUBJECT_ENTRY");
    need(entryRead.bytes.length === entry.bytes,
      "SUBJECT_ENTRY_BYTES_MISMATCH", { path: entry.repository_relative_path });
    need(sha256(entryRead.bytes) === entry.sha256,
      "SUBJECT_ENTRY_HASH_MISMATCH", { path: entry.repository_relative_path });
  }
  need(
    verificationSubjectHash(manifest) ===
      manifest.verification_subject_manifest_hash,
    "SUBJECT_MANIFEST_HASH_MISMATCH",
  );
  return {
    manifest,
    exact_file_sha256: sha256(read.bytes),
    internal_hash: manifest.verification_subject_manifest_hash,
  };
}

export function detectEncoding(bytes) {
  if (bytes.length >= 3 &&
      bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return "UTF-8-BOM";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return "UTF-16LE";
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return "UTF-16BE";
  }
  return Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes)
    ? "UTF-8"
    : "BINARY_OR_UNKNOWN";
}

export function batch(items, size = 20) {
  const groups = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

export function parseTreeLine(line) {
  const match = line.match(/^(\d{6})\|([^|]+)\|([0-9a-f]+)\|([\s\S]+)$/);
  need(Boolean(match), "TREE_LINE_PARSE_FAILURE", { line });
  return { mode: match[1], type: match[2], oid: match[3], path: match[4] };
}

export function parseIndexLine(line) {
  const match = line.match(/^(\d{6}) ([0-9a-f]+) (\d)\t([\s\S]+)$/);
  need(Boolean(match), "INDEX_LINE_PARSE_FAILURE", { line });
  return { mode: match[1], oid: match[2], stage: Number(match[3]), path: match[4] };
}
