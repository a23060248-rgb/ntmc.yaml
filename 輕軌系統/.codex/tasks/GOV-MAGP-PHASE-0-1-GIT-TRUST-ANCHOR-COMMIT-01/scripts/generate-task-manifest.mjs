import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const taskRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex").toUpperCase();
}

function listFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  return files;
}

const entries = listFiles(taskRoot)
  .map((absolute) => ({
    relative_path: path.relative(taskRoot, absolute).split(path.sep).join("/"),
    absolute,
  }))
  .filter((entry) => entry.relative_path !== "task-artifact-manifest.json")
  .map((entry) => {
    const bytes = fs.readFileSync(entry.absolute);
    return {
      relative_path: entry.relative_path,
      bytes: bytes.length,
      sha256: sha256(bytes),
    };
  })
  .sort((left, right) =>
    left.relative_path < right.relative_path
      ? -1
      : left.relative_path > right.relative_path
        ? 1
        : 0,
  );

const canonical = entries
  .map((entry) => `${entry.relative_path}|${entry.sha256}|${entry.bytes}`)
  .join("\n");

const manifest = {
  schema_version: 1,
  task_id: "GOV-MAGP-PHASE-0-1-GIT-TRUST-ANCHOR-COMMIT-01",
  canonicalization_method: "RELATIVE_PATH_PIPE_SHA256_PIPE_BYTES_NEWLINE",
  exclusions: ["task-artifact-manifest.json"],
  file_count: entries.length,
  manifest_sha256: sha256(Buffer.from(canonical, "utf8")),
  entries,
};

fs.writeFileSync(
  path.join(taskRoot, "task-artifact-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

console.log(JSON.stringify({
  file_count: manifest.file_count,
  manifest_sha256: manifest.manifest_sha256,
}, null, 2));
