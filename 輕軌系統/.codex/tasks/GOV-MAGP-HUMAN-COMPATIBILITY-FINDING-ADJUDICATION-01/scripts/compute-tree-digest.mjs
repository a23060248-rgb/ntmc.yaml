import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function listFilesRecursive(root) {
  const files = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) files.push(absolutePath);
    }
  }
  visit(root);
  return files;
}

function treeDigest(root) {
  const rows = listFilesRecursive(root)
    .map((absolutePath) => ({
      relative_path: path.relative(root, absolutePath).split(path.sep).join("/"),
      sha256: crypto.createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex").toUpperCase(),
      bytes: fs.statSync(absolutePath).size,
    }))
    .sort((a, b) => (a.relative_path < b.relative_path ? -1 : a.relative_path > b.relative_path ? 1 : 0));
  const canonical = rows.map((row) => `${row.relative_path}|${row.sha256}|${row.bytes}`).join("\n");
  return {
    absolute_root: root.split(path.sep).join("/"),
    file_count: rows.length,
    canonical_manifest_sha256: crypto.createHash("sha256").update(canonical, "utf8").digest("hex").toUpperCase(),
  };
}

if (process.argv.length < 3) {
  throw new Error("At least one absolute task root is required.");
}

console.log(JSON.stringify(process.argv.slice(2).map((root) => treeDigest(path.resolve(root))), null, 2));
