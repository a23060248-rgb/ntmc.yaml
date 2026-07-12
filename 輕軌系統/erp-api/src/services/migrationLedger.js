const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
}

function validateMigrationManifest(manifest, dbDesignRoot) {
  if (!manifest || manifest.manifestVersion !== 1 || !Array.isArray(manifest.migrations)) {
    throw new Error("migration manifest must use manifestVersion 1 and contain migrations");
  }

  const ids = new Set();
  const sequences = new Set();
  const files = new Set();
  let previousSequence = -1;

  return manifest.migrations.map((entry) => {
    if (!Number.isInteger(entry.sequence) || entry.sequence <= previousSequence) {
      throw new Error(`migration sequence must be strictly increasing: ${entry.sequence}`);
    }
    if (!/^[a-z0-9-]+$/.test(String(entry.id || ""))) {
      throw new Error(`invalid migration id: ${entry.id}`);
    }
    if (!/^migration-[a-z0-9-]+\.sql$/.test(String(entry.file || ""))) {
      throw new Error(`invalid migration file: ${entry.file}`);
    }
    if (typeof entry.verifySql !== "string" || !/^\s*select\b/i.test(entry.verifySql)) {
      throw new Error(`migration ${entry.id} requires a SELECT verification query`);
    }
    if (ids.has(entry.id) || sequences.has(entry.sequence) || files.has(entry.file)) {
      throw new Error(`duplicate migration manifest entry: ${entry.id}`);
    }

    const filePath = path.resolve(dbDesignRoot, entry.file);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new Error(`migration file does not exist: ${entry.file}`);
    }

    ids.add(entry.id);
    sequences.add(entry.sequence);
    files.add(entry.file);
    previousSequence = entry.sequence;
    return { ...entry, filePath, sha256: sha256File(filePath) };
  });
}

async function verifyMigration(client, entry) {
  const result = await client.query(entry.verifySql);
  return result.rowCount === 1 && result.rows[0].ok === true;
}

module.exports = {
  sha256File,
  validateMigrationManifest,
  verifyMigration,
};
