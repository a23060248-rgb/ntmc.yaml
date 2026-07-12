const test = require("node:test");
const assert = require("node:assert/strict");

const { assertSafeDatabaseTarget, parseDatabaseTarget } = require("../src/config/databaseSafety");

test("rehearsal mode accepts only a local rehearsal database", () => {
  assert.doesNotThrow(() =>
    assertSafeDatabaseTarget({
      connectionString: "postgresql://postgres@127.0.0.1:5433/ntmc_erp_rehearsal_20260711_010000",
      safetyMode: "rehearsal"
    })
  );
});

test("rehearsal mode rejects the formal local database", () => {
  assert.throws(
    () =>
      assertSafeDatabaseTarget({
        connectionString: "postgresql://postgres@127.0.0.1:5433/ntmc_erp",
        safetyMode: "rehearsal"
      }),
    /rejected database ntmc_erp/
  );
});

test("rehearsal mode rejects remote hosts", () => {
  assert.throws(
    () =>
      assertSafeDatabaseTarget({
        connectionString: "postgresql://user:secret@example.invalid:5432/ntmc_erp_rehearsal",
        safetyMode: "rehearsal"
      }),
    /only permits a local PostgreSQL host/
  );
});

test("database target parser decodes the database name", () => {
  assert.deepEqual(parseDatabaseTarget("postgresql://postgres@localhost:5433/ntmc%5Ferp%5Frehearsal"), {
    host: "localhost",
    database: "ntmc_erp_rehearsal"
  });
});
