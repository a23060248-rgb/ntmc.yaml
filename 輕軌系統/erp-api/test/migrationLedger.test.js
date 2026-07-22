const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { validateMigrationManifest } = require("../src/services/migrationLedger");

const dbDesignRoot = path.resolve(__dirname, "..", "..", "db-design");

test("migration manifest is ordered, unique, and references 32 existing migrations", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dbDesignRoot, "migration-manifest.json"), "utf8"),
  );
  const entries = validateMigrationManifest(manifest, dbDesignRoot);
  assert.equal(entries.length, 32);
  assert.deepEqual(entries.map((entry) => entry.sequence), [...entries]
    .map((entry) => entry.sequence)
    .sort((left, right) => left - right));
  assert.ok(entries.every((entry) => /^[0-9A-F]{64}$/.test(entry.sha256)));
  assert.equal(entries.find((entry) => entry.id === "equipment-alias").sequence, 130);
  assert.equal(entries.find((entry) => entry.id === "session-security").sequence, 240);
  assert.equal(entries.find((entry) => entry.id === "pm-template-maintenance").sequence, 250);
  assert.equal(entries.find((entry) => entry.id === "word-block-verification").sequence, 260);
  assert.equal(entries.find((entry) => entry.id === "pm-template-structure").sequence, 270);
  assert.equal(entries.find((entry) => entry.id === "pm-attachment-library").sequence, 280);
  assert.equal(entries.find((entry) => entry.id === "master-data-import-staging").sequence, 290);
  assert.equal(entries.find((entry) => entry.id === "master-data-import-row-quality").sequence, 300);
  assert.equal(entries.find((entry) => entry.id === "master-data-import-issue-resolution").sequence, 310);
  assert.equal(entries.find((entry) => entry.id === "c-work-order-workflow").sequence, 320);
});

test("migration manifest rejects duplicate history", () => {
  const duplicate = {
    manifestVersion: 1,
    migrations: [
      { sequence: 10, id: "auth", file: "migration-auth.sql", verifySql: "SELECT true AS ok" },
      { sequence: 10, id: "auth-copy", file: "migration-system-roles.sql", verifySql: "SELECT true AS ok" },
    ],
  };
  assert.throws(
    () => validateMigrationManifest(duplicate, dbDesignRoot),
    /strictly increasing|duplicate migration manifest entry/,
  );
});
