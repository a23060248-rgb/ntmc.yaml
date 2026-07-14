const test = require("node:test");
const assert = require("node:assert/strict");
const {
  hashEvidence,
  normalizeVerificationEvidence,
  recordPassedVerification,
} = require("../src/services/wordBlockVerificationService");

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

function validEvidence(overrides = {}) {
  return {
    formTemplateId: "template-1",
    printJobId: null,
    printStage: "POST_COMPLETION",
    runStatus: "PASSED",
    templateFileHash: HASH_A,
    outputFileHash: HASH_B,
    outputFilePath: "C:/qa/output.docx",
    pageCount: 8,
    evidenceFileName: "evidence.json",
    evidencePath: "C:/qa/evidence.json",
    evidenceHash: HASH_C,
    verifierName: "test-verifier",
    verifierVersion: "1",
    blocks: [{
      blockMappingId: "mapping-1",
      blockCode: "P1-SEAT",
      resultStatus: "PASSED",
      pageNumbers: [7],
      evidence: { markedSeats: 1 },
    }],
    ...overrides,
  };
}

test("verification evidence normalization requires hashes, output path, and positive page count", () => {
  const normalized = normalizeVerificationEvidence(validEvidence());
  assert.equal(normalized.printStage, "POST_COMPLETION");
  assert.equal(normalized.pageCount, 8);
  assert.equal(normalized.blocks[0].blockCode, "P1-SEAT");
  assert.throws(() => normalizeVerificationEvidence(validEvidence({ outputFileHash: "bad" })), /SHA256/);
  assert.throws(() => normalizeVerificationEvidence(validEvidence({ outputFilePath: "" })), /outputFilePath/);
  assert.throws(() => normalizeVerificationEvidence(validEvidence({ pageCount: 0 })), /positive integer/);
});

test("passed verification cannot contain a failed or duplicate block result", () => {
  assert.throws(() => normalizeVerificationEvidence(validEvidence({
    blocks: [{ blockMappingId: "mapping-1", blockCode: "P1-SEAT", resultStatus: "FAILED" }],
  })), /cannot contain failed/);
  assert.throws(() => normalizeVerificationEvidence(validEvidence({
    blocks: [
      { blockMappingId: "mapping-1", blockCode: "P1-SEAT", resultStatus: "PASSED" },
      { blockMappingId: "mapping-1", blockCode: "BRAKE", resultStatus: "PASSED" },
    ],
  })), /duplicate blockMappingId/);
});

test("evidence hash is deterministic for the same structured evidence", () => {
  assert.equal(hashEvidence({ b: 2, a: 1 }), hashEvidence({ b: 2, a: 1 }));
  assert.notEqual(hashEvidence({ b: 2 }), hashEvidence({ b: 3 }));
});

test("recording passed evidence writes one immutable run and verifies its mappings", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes("FROM form_template_block_mapping")) {
        return { rowCount: 1, rows: [{ id: "mapping-1", form_template_id: "template-1", block_code: "P1-SEAT" }] };
      }
      if (sql.includes("INSERT INTO form_template_verification_run")) {
        return { rowCount: 1, rows: [{ id: "run-1", form_template_id: "template-1", print_stage: "POST_COMPLETION", page_count: 8, output_file_hash: HASH_B, evidence_hash: HASH_C }] };
      }
      return { rowCount: 1, rows: [] };
    },
  };
  const run = await recordPassedVerification(client, validEvidence());
  assert.equal(run.id, "run-1");
  assert.equal(calls.filter((call) => call.sql.includes("INSERT INTO form_template_block_verification")).length, 1);
  assert.equal(calls.filter((call) => call.sql.includes("UPDATE form_template_block_mapping")).length, 1);
});
