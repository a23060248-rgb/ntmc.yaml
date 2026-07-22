import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

function safetyError(message) {
  const error = new Error(message);
  error.code = "PATH_SAFETY";
  return error;
}

function normalizedSegments(ref) {
  if (typeof ref !== "string" || !ref.trim()) throw safetyError("Path must be a non-empty relative string.");
  if (path.isAbsolute(ref) || path.win32.isAbsolute(ref) || /^[A-Za-z]:/.test(ref) || /^[/\\]{2}/.test(ref)) {
    throw safetyError(`Absolute, drive-letter, and UNC paths are forbidden: ${ref}`);
  }
  const normalized = ref.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === ".." || segment === "")) throw safetyError(`Traversal or empty path segment is forbidden: ${ref}`);
  if (segments.some((segment) => /^\.env(?:\.|$)/i.test(segment))) throw safetyError(`.env paths are forbidden: ${ref}`);
  return segments;
}

function isInside(root, candidate, allowRoot = false) {
  const relative = path.relative(root, candidate);
  return (allowRoot && relative === "") || (relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative));
}

async function assertNoLinks(root, segments, { allowMissingLeaf = false } = {}) {
  let current = root;
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw safetyError(`Symbolic links, junctions, and reparse-point links are forbidden: ${current}`);
      const canonical = await realpath(current);
      const canonicalRoot = await realpath(root);
      if (!isInside(canonicalRoot, canonical, true)) throw safetyError(`Canonical path escaped the product root: ${current}`);
    } catch (error) {
      if (error?.code === "ENOENT" && allowMissingLeaf) return { existingParent: path.dirname(current), missingFrom: index };
      throw error;
    }
  }
  return { existingParent: current, missingFrom: -1 };
}

export async function canonicalProductRoot(productRoot) {
  const rootStat = await lstat(productRoot);
  if (rootStat.isSymbolicLink()) throw safetyError("Product root cannot be a symbolic link, junction, or reparse-point link.");
  return realpath(productRoot);
}

export async function safeExistingPath(productRoot, ref) {
  const segments = normalizedSegments(ref);
  const canonicalRoot = await canonicalProductRoot(productRoot);
  await assertNoLinks(canonicalRoot, segments);
  const candidate = await realpath(path.join(canonicalRoot, ...segments));
  if (!isInside(canonicalRoot, candidate)) throw safetyError(`Path escaped canonical product root: ${ref}`);
  return candidate;
}

export async function safeNewPath(productRoot, ref) {
  const segments = normalizedSegments(ref);
  const canonicalRoot = await canonicalProductRoot(productRoot);
  await assertNoLinks(canonicalRoot, segments, { allowMissingLeaf: true });
  const candidate = path.join(canonicalRoot, ...segments);
  if (!isInside(canonicalRoot, candidate)) throw safetyError(`New path escaped canonical product root: ${ref}`);
  return candidate;
}

export async function verifyCreatedPath(productRoot, ref) {
  return safeExistingPath(productRoot, ref);
}

export function validateRelativeRef(ref) {
  normalizedSegments(ref);
  return ref.replaceAll("\\", "/");
}

export function relativeInside(root, candidate, allowRoot = false) {
  return isInside(root, candidate, allowRoot);
}
