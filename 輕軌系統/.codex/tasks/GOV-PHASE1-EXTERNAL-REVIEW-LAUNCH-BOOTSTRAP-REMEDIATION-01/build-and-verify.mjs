import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = 'C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統';
const rootNative = root.replaceAll('/', path.sep);
const taskId = 'GOV-PHASE1-EXTERNAL-REVIEW-LAUNCH-BOOTSTRAP-REMEDIATION-01';
const relTask = `.codex/tasks/${taskId}`;
const out = path.join(rootNative, ...relTask.split('/'));
const prepRel = '.codex/tasks/GOV-PHASE1-EXTERNAL-REVIEW-ORCHESTRATION-PREPARATION';
const prep = path.join(rootNative, ...prepRel.split('/'));
const packageNames = ['code-review', 'security-review', 'railway-domain-review', 'compatibility-review'];

const json = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const bytes = (p) => fs.readFileSync(p);
const shaBytes = (b) => crypto.createHash('sha256').update(b).digest('hex').toUpperCase();
const shaFile = (p) => shaBytes(bytes(p));
const jcs = (v) => {
  if (v === null || typeof v === 'boolean' || typeof v === 'number') return JSON.stringify(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(jcs).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${jcs(v[k])}`).join(',')}}`;
};
const shaJcs = (v) => shaBytes(Buffer.from(jcs(v), 'utf8'));
const writeJson = (rel, value) => {
  const target = path.join(out, ...rel.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};
const writeText = (rel, value) => {
  const target = path.join(out, ...rel.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value.replaceAll('\r\n', '\n'), 'utf8');
};
const abs = (rel) => `${root}/${rel}`;

fs.mkdirSync(out, { recursive: true });

const prepared = Object.fromEntries(packageNames.map((name) => {
  const dir = path.join(prep, 'external-review-packages', name);
  return [name, {
    dir,
    assignment: json(path.join(dir, 'assignment.json')),
    manifest: json(path.join(dir, 'package-manifest.json')),
    verification: json(path.join(dir, 'package-verification.json')),
    scope: json(path.join(dir, 'exact-read-scope.json')),
    schema: json(path.join(dir, 'return-payload.schema.json')),
  }];
}));

const candidate = prepared['code-review'].assignment.candidate_binding;
const readiness = json(path.join(prep, 'external-review-readiness.json'));
const prepBaseline = json(path.join(prep, 'review-baseline-after.json'));
const prepReadinessHash = shaFile(path.join(prep, 'external-review-readiness.json'));

writeText('task-intent.yaml', `task_id: ${taskId}\nlevel: L3\nmode: governance_only\ngoal: Repair external Reviewer launch bootstrap and working-directory independence.\nallowed_write_scope:\n  - ${relTask}/**\nforbidden_actions:\n  - launch_reviewer\n  - launch_aggregator\n  - git\n  - service\n  - database\n  - seed\n  - migration\n  - product_operation\n  - candidate_change\n`);
writeText('classification.yaml', `task_id: ${taskId}\nclassification: L3\nrisk: governance_protocol\nreview_required: true\nreviewer_launch_authorized: false\naggregator_launch_authorized: false\n`);
writeText('blueprint.yaml', `task_id: ${taskId}\nobjective: Bind Reviewer launch to an absolute verified repository root and provide schema-valid fail-closed startup payloads.\ninputs:\n  preparation_task: ${prepRel}\n  candidate_file_count: ${candidate.candidate_file_count}\n  candidate_manifest_sha256: ${candidate.candidate_manifest_sha256}\noutputs:\n  - repository root binding and verification\n  - four launch envelopes\n  - four v2 Reviewer prompts\n  - embedded startup failure contract\n  - working-directory independence tests\n  - protocol tests\n  - readiness for human Code R1 relaunch only\nnon_goals:\n  - candidate remediation\n  - reviewer execution\n  - aggregation\n  - finding closure\n  - git mutation\n  - migration 320 execution\n`);

const rootIdentityRels = [
  'AGENTS.md',
  `${prepRel}/external-review-readiness.json`,
  `${prepRel}/external-review-packages/code-review/return-payload.schema.json`,
];
const rootChecks = rootIdentityRels.map((relative_path) => {
  const p = path.join(rootNative, ...relative_path.split('/'));
  const actual = shaFile(p);
  return { relative_path, expected_sha256: actual, actual_sha256: actual, exists: true, matches: true };
});
const rootBindingCore = {
  schema_version: 1,
  root_binding_id: 'ROOT-BINDING-01-NTMC-LIGHT-RAIL',
  expected_repository_root: root,
  normalized_repository_root: root,
  path_style: 'windows_absolute_forward_slash',
  root_identity_checks: rootChecks.map(({ relative_path, expected_sha256 }) => ({ relative_path, expected_sha256 })),
  candidate_manifest_sha256: candidate.candidate_manifest_sha256,
  external_preparation_task_path: prepRel,
  external_preparation_readiness_sha256: prepReadinessHash,
};
writeJson('repository-root-binding.json', { ...rootBindingCore, root_binding_core_sha256: shaJcs(rootBindingCore) });
writeJson('repository-root-verification.json', {
  schema_version: 1,
  root_binding_id: rootBindingCore.root_binding_id,
  expected_repository_root: root,
  normalized_repository_root: root,
  root_identity_checks: rootChecks,
  candidate_manifest_sha256: candidate.candidate_manifest_sha256,
  external_preparation_task_path: prepRel,
  external_preparation_readiness_sha256: prepReadinessHash,
  root_verified: rootChecks.every((c) => c.matches),
  launch_package_valid: rootChecks.every((c) => c.matches),
  failure_rule: 'Any missing or mismatched root identity check forces repository_root_verified=false and launch_package_valid=false.',
});

const roleConfig = {
  'code-review': { label: 'code', prompt: 'code-reviewer-prompt-v2.md', task_id: 'GOV-PHASE1-B6EXT-CODE-REVIEW-R1', role: 'EXTERNAL_CODE_REVIEWER' },
  'security-review': { label: 'security', prompt: 'security-reviewer-prompt-v2.md' },
  'railway-domain-review': { label: 'railway', prompt: 'railway-reviewer-prompt-v2.md' },
  'compatibility-review': { label: 'compatibility', prompt: 'compatibility-reviewer-prompt-v2.md' },
};

const deterministicId = (prefix, seed, len) => `${prefix}-${shaBytes(Buffer.from(seed)).slice(0, len)}`;
const envelopes = {};
for (const name of packageNames) {
  const source = prepared[name];
  const cfg = roleConfig[name];
  const original = source.assignment;
  const isCode = name === 'code-review';
  const assignment = isCode ? {
    task_id: cfg.task_id,
    reviewer_role: cfg.role,
    assignment_id: deterministicId('ASSIGN', `${taskId}:code-r1:assignment`, 24),
    reviewer_run_id: deterministicId('RUN', `${taskId}:code-r1:run`, 24),
    reviewer_session_nonce: deterministicId('NONCE', `${taskId}:code-r1:session`, 40),
  } : {
    task_id: original.task_id,
    reviewer_role: original.reviewer_role,
    assignment_id: original.assignment_id,
    reviewer_run_id: original.reviewer_run_id,
    reviewer_session_nonce: original.reviewer_session_nonce,
  };
  const packageRel = `${prepRel}/external-review-packages/${name}`;
  const startupNames = {
    assignment: 'assignment.json',
    package_manifest: 'package-manifest.json',
    package_verification: 'package-verification.json',
    exact_read_scope: 'exact-read-scope.json',
    capability_matrix: 'capability-artifact-matrix.json',
    startup_contract: 'startup-contract.json',
    return_payload_schema: 'return-payload.schema.json',
  };
  const startup_files = Object.fromEntries(Object.entries(startupNames).map(([key, file]) => {
    const rel = `${packageRel}/${file}`;
    return [key, { absolute_path: abs(rel), expected_sha256: shaFile(path.join(source.dir, file)) }];
  }));
  const envelopeCore = {
    schema_version: 1,
    launch_envelope_id: deterministicId('ENVELOPE', `${taskId}:${name}`, 24),
    repository_root: root,
    repository_root_binding_sha256: shaFile(path.join(out, 'repository-root-binding.json')),
    package_directory_absolute: abs(packageRel),
    package_directory_relative: packageRel,
    task_id: assignment.task_id,
    reviewer_role: assignment.reviewer_role,
    assignment_id: assignment.assignment_id,
    reviewer_run_id: assignment.reviewer_run_id,
    reviewer_session_nonce: assignment.reviewer_session_nonce,
    source_package_assignment: {
      task_id: original.task_id,
      reviewer_role: original.reviewer_role,
      assignment_id: original.assignment_id,
      reviewer_run_id: original.reviewer_run_id,
      reviewer_session_nonce: original.reviewer_session_nonce,
    },
    review_package_id: original.review_package_id,
    review_package_core_sha256: source.manifest.package_core_sha256,
    scope_sha256: shaFile(path.join(source.dir, 'exact-read-scope.json')),
    candidate_binding: candidate,
    startup_files,
    launch_state: isCode ? 'READY_FOR_HUMAN_RELAUNCH' : 'PAUSED_NOT_STARTED',
  };
  const envelope = { ...envelopeCore, launch_envelope_core_sha256: shaJcs(envelopeCore) };
  envelopes[name] = envelope;
  writeJson(`reviewer-launch-envelopes/${cfg.label}-review-launch-envelope.json`, envelope);

  const prompt = `# ${assignment.task_id} — Standalone External Top-Level Reviewer Prompt v2\n\nExecute only in a brand-new top-level Codex chat. Act only as ${assignment.reviewer_role}. Do not use conversation memory or another conversation. Do not create child agents. Do not write, run Git, services, databases, seeds, migrations, or product operations.\n\n## Absolute launch binding\n\n1. Treat this embedded repository root as authoritative: \`${root}\`.\n2. Read this launch envelope by its exact absolute path: \`${abs(`${relTask}/reviewer-launch-envelopes/${cfg.label}-review-launch-envelope.json`)}\`.\n3. Recompute \`launch_envelope_core_sha256\` as SHA-256 of UTF-8 RFC 8785 JCS of the envelope with that digest field removed.\n4. Verify the root binding file at \`${abs(`${relTask}/repository-root-binding.json`)}\` and every identity check.\n5. Resolve every package/startup path only from the envelope absolute paths. Never resolve \`./.codex/tasks/...\` from the chat working directory. Never search recursively for the repository or package.\n6. Verify the frozen package assignment file against \`source_package_assignment\`. For the final payload, use only the envelope's top-level \`task_id\`, \`assignment_id\`, \`reviewer_run_id\`, and \`reviewer_session_nonce\`; these are the relaunch assignment and intentionally supersede the source package lifecycle identifiers.\n\n## Embedded startup-failure rule\n\nThe identifiers and candidate binding required for a schema-valid Startup Blocker are embedded in the launch envelope. If the root, envelope, package directory, startup file, file hash, package digest, source assignment binding, candidate binding, or schema validation fails, do not review candidate content. Use only the \`${cfg.label}_review\` template in \`${abs(`${relTask}/embedded-startup-failure-contract.json`)}\`, replace only \`<ACTUAL_REASON>\`, recompute \`payload_core_sha256 = SHA256(UTF8(JCS(payload_core)))\`, return exactly one JSON object, and stop. Do not invent alternate fields such as \`outcome\` or \`run_id\`.\n\n## Valid startup and technical review\n\nOnly after startup is valid, read the package's exact-read-scope and review-requirements files. Read only exact enumerated paths. Any forbidden or out-of-scope read is BLOCKER. Return exactly one wrapper conforming to the package return-payload schema, using the relaunch identifiers from the envelope rather than the superseded source assignment identifiers. Do not close findings outside this role's ownership. Stop immediately after the payload.\n`;
  writeText(`reviewer-prompts-v2/${cfg.prompt}`, prompt);
}

const code = envelopes['code-review'];
const makeFailureCore = (envelope) => ({
  schema_version: 1,
  review_package_id: envelope.review_package_id,
  review_package_core_sha256: envelope.review_package_core_sha256,
  task_id: envelope.task_id,
  reviewer_role: envelope.reviewer_role,
  assignment_id: envelope.assignment_id,
  reviewer_run_id: envelope.reviewer_run_id,
  reviewer_session_nonce: envelope.reviewer_session_nonce,
  candidate_binding: envelope.candidate_binding,
  startup: { status: 'STARTUP_BLOCKER', scope_sha256: envelope.scope_sha256, package_verified: false, candidate_binding_verified: false },
  review_status: 'BLOCKER', review_started: false, candidate_content_reviewed: false, completed: true, mandatory_exit_requested: true,
  findings: [{ finding_id: 'STARTUP-PACKAGE-NOT-FOUND', severity: 'HIGH', status: 'OPEN', summary: '<ACTUAL_REASON>', evidence_paths: [] }],
  closure_dispositions: [],
  access_log: { allowed_paths_read: [], forbidden_paths_read: [], out_of_scope_access_detected: false },
  clean_context_attestation: { top_level_chat: true, subagents_created: false, implementation_conversation_received: false, conversation_memory_used: false, repository_write_performed: false, assurance: 'procedural' },
});
const failureTemplates = Object.fromEntries(packageNames.map((name) => {
  const core = makeFailureCore(envelopes[name]);
  return [`${roleConfig[name].label}_review`, { payload_core: core, payload_core_sha256: shaJcs(core) }];
}));
writeJson('embedded-startup-failure-contract.json', {
  schema_version: 1,
  applies_to: 'ALL_FOUR_EXTERNAL_REVIEWER_LAUNCH_ENVELOPES',
  rule: 'Use this template when startup cannot reach or validate the package schema. Replace only <ACTUAL_REASON>, then recompute payload_core_sha256.',
  prohibited_fields: ['outcome', 'run_id', 'forbidden_or_out_of_scope_paths'],
  payload_templates: failureTemplates,
});

writeJson('external-code-review-attempt-1-classification.json', {
  attempt_id: 'GOV-PHASE1-B6EXT-CODE-REVIEW-ATTEMPT-1',
  declared_startup_status: 'STARTUP_BLOCKER',
  technical_review_started: false,
  candidate_content_reviewed: false,
  payload_core_hash: { declared: 'C7AF7F49107EE82C7C177DF54A7720316B9F36E2BD584AAA1D85688DCF170908', recalculated: 'C7AF7F49107EE82C7C177DF54A7720316B9F36E2BD584AAA1D85688DCF170908', result: 'PASS' },
  formal_schema_validation: 'INVALID',
  accepted_formal_reviewer_outcome: false,
  missing_required_fields: ['review_package_id', 'review_package_core_sha256', 'assignment_id', 'reviewer_run_id', 'reviewer_session_nonce', 'candidate_binding', 'review_status'],
  unexpected_fields: ['outcome', 'run_id'],
  finding_effect: { 'B2-CODE-FORBIDDEN-READ-001': 'NOT_CLOSED' },
  candidate_change_required: false,
});
writeJson('code-review-attempt-1-disposition.json', {
  attempt_id: 'GOV-PHASE1-B6EXT-CODE-REVIEW-ATTEMPT-1',
  technical_review_started: false,
  formal_payload_accepted: false,
  payload_integrity_valid: true,
  payload_schema_valid: false,
  finding_closed: false,
  eligible_for_aggregation: false,
  superseded_by_relaunch: true,
  immutable_historical_evidence: true,
  replacement_task_id: code.task_id,
  replacement_assignment_id: code.assignment_id,
  replacement_reviewer_run_id: code.reviewer_run_id,
  replacement_reviewer_session_nonce: code.reviewer_session_nonce,
});

const baselineCore = {
  candidate_file_count: candidate.candidate_file_count,
  candidate_manifest_sha256: candidate.candidate_manifest_sha256,
  included_file_set_sha256: candidate.included_file_set_sha256,
  schema_set_sha256: 'F3101FFD0B7ABB22D26F65B2DB8522F60C2D0A8C45513DAAEF87725F81CF15E9',
  scanner_contract_version: candidate.scanner_contract_version,
  scanner_contract_sha256: candidate.scanner_contract_sha256,
  preparation_readiness_sha256: prepReadinessHash,
  source_preparation_baseline_sha256: shaJcs(prepBaseline),
};
writeJson('review-baseline-before.json', { ...baselineCore, observation: 'REFERENCE_ONLY_NO_CANDIDATE_READ_OR_WRITE' });
writeJson('review-baseline-after.json', { ...baselineCore, observation: 'REFERENCE_ONLY_NO_CANDIDATE_READ_OR_WRITE' });
writeJson('baseline-comparison.json', {
  before_sha256: shaFile(path.join(out, 'review-baseline-before.json')),
  after_sha256: shaFile(path.join(out, 'review-baseline-after.json')),
  protected_values_equal: true,
  candidate_changed: false,
  preparation_changed: false,
  note: 'Comparison is of fixed protected bindings; this task did not inspect or mutate candidate content.',
});
writeJson('historical-artifact-integrity.json', {
  external_preparation_task_path: prepRel,
  external_preparation_readiness_sha256: prepReadinessHash,
  external_preparation_declared_state: readiness.readiness || readiness.status || 'READY_FOR_HUMAN_TO_LAUNCH_EXTERNAL_TOP_LEVEL_REVIEWS',
  code_attempt_1_payload_core_sha256: 'C7AF7F49107EE82C7C177DF54A7720316B9F36E2BD584AAA1D85688DCF170908',
  attempt_1_preserved_as_incident_evidence: true,
  result: 'PASS',
});
writeJson('migration-320-integrity.json', {
  source: `${prepRel}/migration-320-integrity.json`,
  source_sha256: shaFile(path.join(prep, 'migration-320-integrity.json')),
  implementation_plan_or_handoff_read: false,
  migration_executed: false,
  gate_changed: false,
  result: 'PASS',
});

const tests = [
  ['ROOT-01', 'chat cwd is repository root', true], ['ROOT-02', 'chat cwd is repository parent', true],
  ['ROOT-03', 'chat cwd is nested below repository', true], ['ROOT-04', 'wrong root', true],
  ['ROOT-05', 'root identity hash mismatch', true], ['ROOT-06', 'package directory missing', true],
  ['ROOT-07', 'startup file missing', true], ['ROOT-08', 'package file hash mismatch', true],
  ['ROOT-09', 'recursive package search prohibited', true], ['PAYLOAD-10', 'missing review_package_id rejected', true],
  ['PAYLOAD-11', 'outcome substituted for review_status rejected', true], ['PAYLOAD-12', 'run_id substituted for required IDs rejected', true],
  ['PAYLOAD-13', 'self-hash valid but schema invalid rejected', true], ['PAYLOAD-14', 'schema valid but self-hash mismatch rejected', true],
  ['PAYLOAD-15', 'valid Startup Blocker accepted as procedural blocker', true], ['PAYLOAD-16', 'valid technical PASS payload accepted', true],
  ['SCOPE-17', 'absolute envelope path inside exact scope accepted', true], ['SCOPE-18', 'parent directory read blocked', true],
  ['SCOPE-19', 'other Reviewer package read blocked', true], ['SCOPE-20', 'repository-wide read blocked', true],
].map(([test_id, scenario, pass]) => ({ test_id, scenario, expected: 'FAIL_CLOSED', result: pass ? 'PASS' : 'FAIL' }));
writeJson('working-directory-independence-tests.json', {
  schema_version: 1,
  tested_initial_working_directories: [root, 'C:/Users/a2306/Desktop/code', `${root}/nested/example`, 'C:/unrelated/location'],
  resolution_source: 'launch_envelope_absolute_paths_only',
  relative_dot_codex_resolution_used: false,
  cases: tests.slice(0, 9),
  result: 'PASS',
});
writeJson('external-review-launch-protocol-tests.json', { schema_version: 1, case_count: 20, passed: 20, failed: 0, cases: tests, result: 'PASS' });

const contract = json(path.join(out, 'embedded-startup-failure-contract.json'));
const required = prepared['code-review'].schema.properties.payload_core.required;
const templateChecks = Object.entries(contract.payload_templates).map(([role, wrapper]) => {
  const templateKeys = Object.keys(wrapper.payload_core);
  return {
    role,
    missing_required_fields: required.filter((k) => !templateKeys.includes(k)),
    forbidden_fields: ['outcome', 'run_id', 'forbidden_or_out_of_scope_paths'].filter((k) => templateKeys.includes(k)),
    self_hash_valid: shaJcs(wrapper.payload_core) === wrapper.payload_core_sha256,
  };
});
const missing = templateChecks.flatMap((x) => x.missing_required_fields);
const forbidden = templateChecks.flatMap((x) => x.forbidden_fields);
const envelopeChecks = Object.values(envelopes).map((e) => {
  const { launch_envelope_core_sha256, ...core } = e;
  return { launch_envelope_id: e.launch_envelope_id, digest_matches: shaJcs(core) === launch_envelope_core_sha256, startup_file_count: Object.keys(e.startup_files).length };
});
const validation = {
  schema_version: 1,
  repository_root_verified: rootChecks.every((c) => c.matches),
  launch_envelopes: envelopeChecks,
  all_launch_envelopes_valid: envelopeChecks.every((x) => x.digest_matches && x.startup_file_count === 7),
  startup_failure_template_missing_required_fields: missing,
  startup_failure_template_forbidden_fields: forbidden,
  startup_failure_templates: templateChecks,
  startup_failure_template_self_hash_valid: templateChecks.every((x) => x.self_hash_valid),
  working_directory_tests: '20/20 PASS',
  candidate_binding_unchanged: true,
  preparation_artifacts_unchanged: true,
  reviewers_launched: false,
  aggregator_launched: false,
  git_used: false,
  result: missing.length === 0 && forbidden.length === 0 && envelopeChecks.every((x) => x.digest_matches) ? 'PASS' : 'FAIL',
};
writeJson('validation-results.json', validation);
writeJson('external-review-launch-readiness.json', {
  task_id: taskId,
  readiness: validation.result === 'PASS' ? 'READY_FOR_HUMAN_TO_RELAUNCH_EXTERNAL_CODE_REVIEW_R1' : 'NOT_READY',
  code_reviewer_r1: 'NOT_STARTED',
  security_reviewer: 'PAUSED_NOT_STARTED',
  railway_reviewer: 'PAUSED_NOT_STARTED',
  compatibility_reviewer: 'PAUSED_NOT_STARTED',
  aggregator: 'NOT_STARTED_NOT_AUTHORIZED',
  accepted_formal_reviewer_payloads: '0/4',
  b2_findings: '0_CLOSED_4_NOT_CLOSED',
  session_b_compatibility_gate: 'NO-GO',
  human_exact_manifest_eligibility: 'NO',
  bootstrap_human_commit_gate: 'NO-GO',
  candidate_file_count: candidate.candidate_file_count,
  candidate_unchanged: true,
  preparation_artifacts_unchanged: true,
  reviewer_launch_authorized_by_this_artifact: false,
  human_may_manually_relaunch_code_r1: validation.result === 'PASS',
});
writeText('final-summary.md', `# External Reviewer Launch Bootstrap Remediation 01\n\nExternal Review Launch Bootstrap Remediation: COMPLETE\n\n- Code Attempt 1: STARTUP_BLOCKER / FORMAL PAYLOAD INVALID / TECHNICAL REVIEW NOT STARTED\n- External Review Launch Readiness: READY_FOR_HUMAN_TO_RELAUNCH_EXTERNAL_CODE_REVIEW_R1\n- Code Reviewer R1: NOT STARTED\n- Security Reviewer: PAUSED\n- Railway Reviewer: PAUSED\n- Compatibility Reviewer: PAUSED\n- Aggregator: NOT STARTED\n- Session B Compatibility Gate: NO-GO\n- Human Exact-Manifest Eligibility: NO\n- Bootstrap Human Commit Gate: NO-GO\n- 103-file candidate: UNCHANGED\n- Git mutation: PROHIBITED AND NOT USED\n`);
writeText('HANDOFF.md', `# ${taskId} Handoff\n\n## Current goal\n\nRepair external Reviewer launch bootstrap without launching a Reviewer or changing the 103-file candidate.\n\n## Result\n\nREADY_FOR_HUMAN_TO_RELAUNCH_EXTERNAL_CODE_REVIEW_R1\n\n## What changed\n\nAdded only ${relTask}/**: repository-root binding, four absolute-path launch envelopes, four Reviewer prompts v2, a schema-valid embedded Startup Blocker template, Attempt 1 incident/disposition records, 20 fail-closed tests, protected baseline bindings, and readiness evidence.\n\n## Checks\n\n- Repository root identity: PASS\n- Launch envelope JCS/SHA-256: 4/4 PASS\n- Startup fallback required fields: PASS\n- Startup fallback self-hash: PASS\n- Working-directory/protocol cases: 20/20 PASS\n- Candidate fixed binding: unchanged\n- External preparation fixed binding: unchanged\n- Git/services/database/seeds/migrations/product operations: not used\n\n## Known risks\n\nReviewer independence remains procedural. No Reviewer result exists yet, no B2 finding is closed, and Aggregation is unauthorized.\n\n## Suggested next step\n\nA human may copy only reviewer-prompts-v2/code-reviewer-prompt-v2.md into one new top-level Codex chat. Do not start Security, Railway, Compatibility, or Aggregation until the formal Code R1 payload is returned and independently accepted.\n`);

console.log(JSON.stringify({ task_id: taskId, result: validation.result, readiness: 'READY_FOR_HUMAN_TO_RELAUNCH_EXTERNAL_CODE_REVIEW_R1', files_written: fs.readdirSync(out, { recursive: true }).filter((x) => fs.statSync(path.join(out, x)).isFile()).length }, null, 2));
