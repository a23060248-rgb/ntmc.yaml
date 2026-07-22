import { createHash } from "node:crypto";

function caseHash(item) {
  const core = {
    case_id: item.case_id,
    pass: item.pass,
    detail: item.detail,
    asserted_invariant: item.asserted_invariant,
    production_entrypoint: item.production_entrypoint,
    expected_exit: item.expected_exit,
    actual_exit: item.actual_exit
  };
  return createHash("sha256").update(JSON.stringify(core)).digest("hex").toUpperCase();
}

export function validateFixtureReport(report, suite) {
  const violations = [];
  if (!report || report.suite_id !== suite.suite_id || report.suite_version !== suite.suite_version) violations.push("FIXTURE_REPORT suite identity mismatch.");
  if (report?.case_manifest_sha256 !== suite.case_manifest_sha256) violations.push("FIXTURE_REPORT case manifest hash mismatch.");
  const cases = report?.cases ?? [];
  if (cases.length !== suite.expected_case_count) violations.push("FIXTURE_REPORT case count mismatch.");
  const ids = cases.map((item) => item.case_id);
  if (new Set(ids).size !== ids.length) violations.push("FIXTURE_REPORT duplicate case ID.");
  const expected = new Set(suite.expected_case_ids ?? []);
  const contracts = new Map((suite.case_contracts ?? []).map(([id, invariant, entrypoint]) => [id, { invariant, entrypoint }]));
  for (const id of ids) if (!expected.has(id)) violations.push(`FIXTURE_REPORT unexpected case ${id}.`);
  for (const id of expected) if (!ids.includes(id)) violations.push(`FIXTURE_REPORT missing case ${id}.`);
  if (!(suite.required_hash_case_ids ?? []).length) violations.push("FIXTURE_REPORT suite requires no artifact hashes.");
  for (const id of suite.required_hash_case_ids ?? []) {
    const item = cases.find((entry) => entry.case_id === id);
    if (!item || !/^[A-F0-9]{64}$/.test(item.artifact_hash ?? "")) violations.push(`FIXTURE_REPORT required hash invalid for ${id}.`);
  }
  for (const item of cases) {
    if (!item.pass) violations.push(`FIXTURE_REPORT case failed ${item.case_id}.`);
    if (item.expected_exit !== "control" && item.expected_exit !== item.actual_exit) violations.push(`FIXTURE_REPORT exit mismatch ${item.case_id}.`);
    if (!item.asserted_invariant || !item.production_entrypoint) violations.push(`FIXTURE_REPORT case ${item.case_id} lacks invariant or production entrypoint provenance.`);
    const contract = contracts.get(item.case_id);
    if (!contract || item.asserted_invariant !== contract.invariant || item.production_entrypoint !== contract.entrypoint) violations.push(`FIXTURE_REPORT case ${item.case_id} does not match the trusted invariant contract.`);
    if (item.artifact_hash !== caseHash(item)) violations.push(`FIXTURE_REPORT case ${item.case_id} artifact hash mismatch.`);
  }
  return violations;
}
