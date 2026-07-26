import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const TASK_ID =
  "GOV-MAGP-PHASE-0-1-EXISTING-HEAD-TRUST-ANCHOR-ATTESTATION-REMEDIATION-02";
const PREVIOUS_TASK_ID =
  "GOV-MAGP-PHASE-0-1-EXISTING-HEAD-TRUST-ANCHOR-ATTESTATION-REMEDIATION-01";
const HEAD = "22baa18784a081dd8c0d8a3ce177ba00363251de";
const TREE = "c6f30a81ff45273aca851126160f2588937d2550";
const BRANCH = "codex/precheck-template-maintenance";
const HEAD_BINDING =
  "529AE67219F970C5B3AFDD694D51384F5DC4290E3D13B36B3416946D25C2977D";
const BRANCH_BINDING =
  "6C1B53839F433463CCCA131A09A8DB3EE3B5387F0F2CCB67DCDE437984C2768D";
const SOURCE_MANIFEST =
  "輕軌系統/.codex/tasks/GOV-MAGP-PHASE-0-1-GIT-TRUST-ANCHOR-PROPOSAL-02/exact-commit-paths.json";
const SOURCE_MANIFEST_SHA256 =
  "5CE80FC02491E66701D9D5573DB3123561FE41C74BABE7C0D0F5496404207685";
const DEPENDENCY_SHA256 =
  "B320CEC8FAC46723D6BFD2D9726357A959DA14D1E8C06FD01D27037928F619E6";
const CANDIDATE_MANIFEST_SHA256 =
  "2C01A85E3348B174B7BFB1F3F1D0A26CAB485423297252C7C7F4F35C65702E5D";
const taskRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productRoot = path.resolve(taskRoot, "..", "..", "..");
const expectedProductRoot =
  path.resolve("C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統");

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function requireExactRoot() {
  if (productRoot !== expectedProductRoot) {
    throw new Error("PRODUCT_ROOT_BINDING_MISMATCH");
  }
  const expectedTaskRoot = path.join(
    expectedProductRoot,
    ".codex",
    "tasks",
    TASK_ID,
  );
  if (taskRoot !== expectedTaskRoot) {
    throw new Error("TASK_ROOT_BINDING_MISMATCH");
  }
}

function writeText(relative, text) {
  const absolute = path.join(taskRoot, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, text, { encoding: "utf8", flag: "w" });
}

function writeJson(relative, value) {
  writeText(relative, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture(fileName, mutation, expectedErrorCode) {
  writeJson(path.join("test-fixtures", fileName), {
    fixture_id: fileName.replace(/\.json$/u, ""),
    mutation: { kind: mutation },
    expected_error_code: expectedErrorCode,
  });
}

requireExactRoot();

writeText(
  "task-intent.yaml",
  `task_id: ${TASK_ID}
task_type: GOVERNANCE_EXISTING_HEAD_TRUST_ANCHOR_ATTESTATION_REMEDIATION
trust_anchor_model: EXISTING_HEAD_EXACT_MANIFEST_ATTESTATION
level: L3
classification_status: proposed
producer_artifact_status: DRAFT
assurance: INTERNAL_CONSISTENCY_ONLY
allowed_write_path: .codex/tasks/${TASK_ID}/**
formal_human_adoption_completed: false
git_mutation_authorized: false
product_implementation_authorized: false
`,
);

writeText(
  "classification.yaml",
  `task_id: ${TASK_ID}
level: L3
classification_status: proposed
rationale:
  - Git trust anchor candidate and exact commit/tree binding
  - 147-path manifest and release-gate evidence
  - Human approval boundary
producer_evidence_authority: NON_AUTHORITATIVE_CANDIDATE_EVIDENCE
`,
);

writeText(
  "blueprint.yaml",
  `task_id: ${TASK_ID}
status: DRAFT
objective: Remediate eight Work findings through one fail-closed production validator.
opening_contract:
  head: ${HEAD}
  branch: ${BRANCH}
  exact_path_count: 147
validation_contract:
  - no-argument production execution is the only complete candidate-verdict path
  - all other command-line modes are rejection-only or usage errors
  - manifest uses RFC8785 JCS with an omit-manifest_sha256 contract
  - opening and closing repository snapshots must match
  - producer summaries and PASS-shaped fields are non-authoritative
stop_boundary:
  highest_candidate_verdict: READY_FOR_WORK_READ_ONLY_REVIEW
  human_adoption_performed: false
  git_mutation_performed: false
`,
);

writeJson("human-model-selection-binding.json", {
  schema_version: 1,
  task_id: TASK_ID,
  transcription_status: "TASK_LOCAL_HUMAN_INSTRUCTION_TRANSCRIPTION",
  cryptographic_human_identity_claimed: false,
  trust_anchor_model: "EXISTING_HEAD_EXACT_MANIFEST_ATTESTATION",
  head: HEAD,
  head_binding_sha256: HEAD_BINDING,
  branch: BRANCH,
  branch_binding_sha256: BRANCH_BINDING,
  exact_path_count: 147,
  source_candidate_task_id: PREVIOUS_TASK_ID,
  allowed_write_path: `.codex/tasks/${TASK_ID}/**`,
  human_model_selection_is_adoption: false,
  work_review_is_adoption: false,
  formal_human_adoption_completed: false,
  git_mutation_authorized: false,
  product_implementation_authorized: false,
});

writeJson("existing-head-attestation-draft.json", {
  schema_version: 1,
  task_id: TASK_ID,
  producer_artifact_status: "DRAFT",
  producer_evidence_authority: "NON_AUTHORITATIVE_CANDIDATE_EVIDENCE",
  trust_anchor_model: "EXISTING_HEAD_EXACT_MANIFEST_ATTESTATION",
  anchor_object_type: "EXISTING_GIT_COMMIT_AND_TREE",
  trust_anchor_candidate_status: "PROPOSED_NOT_ADOPTED",
  creates_new_commit: false,
  empty_commit_used: false,
  new_tree_delta_claimed: false,
  head: HEAD,
  head_binding_sha256: HEAD_BINDING,
  head_tree_oid: TREE,
  branch: BRANCH,
  branch_binding_sha256: BRANCH_BINDING,
  exact_path_count: 147,
  source_7a_2_count: 106,
  attempt_1_count: 41,
  source_manifest_path: SOURCE_MANIFEST,
  source_manifest_sha256: SOURCE_MANIFEST_SHA256,
  candidate_manifest_sha256: CANDIDATE_MANIFEST_SHA256,
  assurance: "INTERNAL_CONSISTENCY_ONLY",
  human_model_selection_is_adoption: false,
  work_review_is_adoption: false,
  formal_human_adoption_completed: false,
  git_mutation_authorized: false,
  downstream_git_mutation_authorized: false,
  product_implementation_authorized: false,
  next_gate: "WORK_READ_ONLY_REVIEW_BEFORE_HUMAN_EXACT_TRUST_ANCHOR_ADOPTION",
});

writeJson("baseline-input-bindings.json", {
  schema_version: 1,
  task_id: TASK_ID,
  producer_evidence_authority: "NON_AUTHORITATIVE_CANDIDATE_EVIDENCE",
  production_verification_status: "NOT_VERIFIED",
  source_manifest: {
    repository_relative_path: SOURCE_MANIFEST,
    exact_bytes_sha256: SOURCE_MANIFEST_SHA256,
  },
  dependency_closure: {
    repository_relative_path:
      "輕軌系統/.codex/tasks/GOV-MAGP-PHASE-0-1-GIT-TRUST-ANCHOR-PROPOSAL-02/dependency-closure.json",
    exact_bytes_sha256: DEPENDENCY_SHA256,
    direct_count: 147,
    provenance_group_count: 17,
    provenance_entry_count: 1190,
    external_metadata_count: 11,
    external_content_status: "NOT_VERIFIED_CONTENT",
  },
  candidate_manifest_sha256: CANDIDATE_MANIFEST_SHA256,
  historical_expected_bindings: {
    remediation_01: {
      file_count: 35,
      manifest_sha256:
        "D1CBD110BD9921124DC935FB808152DB841B2EEAFB35AD857639AE503D0B3080",
    },
    proposal_02: {
      file_count: 23,
      manifest_sha256:
        "3D763DD0EFB76403D9AC8E64EA74B6BFF4ACD602C0650378FD87DA3243BA1FC4",
    },
    proposal_01: {
      file_count: 19,
      manifest_sha256:
        "487E221D9BE82E9F1E9A5F6A30D53711354B36DECFEDA14EE262D49B139835B7",
    },
    commit_01: {
      file_count: 16,
      manifest_sha256:
        "F2DB3ACA49A667704C221F35C36964C7F0C2A7BBFA016230F41A08BA69CF41F5",
    },
  },
});

const findings = [
  "VALIDATOR_CLI_BYPASS",
  "BARE_FIXTURE_FAIL_OPEN",
  "MANIFEST_CANONICAL_IDENTITY_NOT_ENFORCED",
  "PASS_SHAPED_EVIDENCE_TRUST",
  "FIXTURE_REPARSE_SCOPE_ESCAPE",
  "IGNORE_PERMISSION_FAIL_OPEN",
  "TOCTOU_NO_CLOSING_REBOUND",
  "REJECTION_COVERAGE_INCOMPLETE",
];
writeJson("work-finding-disposition.json", {
  schema_version: 1,
  task_id: TASK_ID,
  producer_evidence_authority: "NON_AUTHORITATIVE_CANDIDATE_EVIDENCE",
  disposition_status: "DRAFT_PENDING_PRODUCTION_VALIDATION_AND_WORK_REVIEW",
  findings: findings.map((finding_id) => ({
    finding_id,
    producer_remediation_claim: "IMPLEMENTED_NOT_AUTHORITATIVELY_VERIFIED",
    final_closure_authority: "WORK_READ_ONLY_REVIEW_THEN_HUMAN_GATE",
  })),
  finding_deleted: false,
  finding_waived: false,
});

writeJson("startup-reverification.json", {
  schema_version: 1,
  task_id: TASK_ID,
  producer_evidence_authority: "NON_AUTHORITATIVE_CANDIDATE_EVIDENCE",
  production_verification_status: "NOT_VERIFIED",
  expected_product_root:
    "C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統",
  expected_git_root: "C:/Users/a2306/Desktop/code/ntmc.yaml",
  expected_head: HEAD,
  expected_branch: BRANCH,
  expected_staged_governance_count: 0,
  git_mutation_performed: false,
});

writeJson("validation-results.json", {
  schema_version: 1,
  task_id: TASK_ID,
  evidence_authority: "NON_AUTHORITATIVE_CANDIDATE_EVIDENCE",
  production_contract_status: "NOT_VERIFIED",
  formal_candidate_verdict: "NOT_ISSUED",
  task_manifest_status: "NOT_GENERATED",
  production_positive_case_status: "NOT_RUN",
  rejection_matrix_status: "NOT_RUN",
  work_acceptance_status: "NOT_STARTED",
  human_adoption_status: "NOT_STARTED",
  git_mutation: "NO",
});

writeText(
  "final-summary.md",
  `# ${TASK_ID}

本 Task 建立 existing-HEAD exact-manifest attestation 的修正候選。所有 producer 工件均為 \`NON_AUTHORITATIVE_CANDIDATE_EVIDENCE\`，不得用來替代 production validator、Work 唯讀驗收或 Human 採用。

- Trust Anchor model: \`EXISTING_HEAD_EXACT_MANIFEST_ATTESTATION\`
- Anchor object: existing commit \`${HEAD}\` and tree \`${TREE}\`
- Branch: \`${BRANCH}\`
- Exact paths: 147 (106 + 41)
- New commit: false
- Empty commit: false
- New tree delta: false
- Assurance: \`INTERNAL_CONSISTENCY_ONLY\`
- Candidate status: \`PROPOSED_NOT_ADOPTED\`
- Current producer verdict: \`BLOCKER_PENDING_FAIL_CLOSED_PRODUCTION_OBSERVATION\`
- Git mutation: NO

只有無參數的 production validator 路徑可以產生完整候選判定；任何測試 fixture 或 discovery/bypass 形式都不能產生 PASS/READY。Task manifest 將在 HANDOFF 凍結後最後產生，並維持自排除與 JCS omit-field 契約。

下一 Gate：Work 唯讀驗收後，才可進行 Human Exact Trust Anchor Adoption Decision。
`,
);

writeText(
  "HANDOFF.md",
  `# HANDOFF

TASK_ID: ${TASK_ID}

CANDIDATE_VERDICT: BLOCKER

BLOCKER: IGNORE_EVIDENCE_NOT_VERIFIED must remain fail-closed if the complete production validator observes an inaccessible effective Git ignore source or any unexpected Git diagnostic. This producer statement is non-authoritative; inspect \`production-entry-observation.json\` and rerun the production entry read-only.

TRUST_ANCHOR_MODEL: EXISTING_HEAD_EXACT_MANIFEST_ATTESTATION

BOUND_HEAD: ${HEAD}

BOUND_TREE: ${TREE}

BOUND_BRANCH: ${BRANCH}

EXACT_PATH_COUNT: 147

PARTITION: 106 SOURCE_7A_2 + 41 ATTEMPT_1

ASSURANCE: INTERNAL_CONSISTENCY_ONLY

PRODUCER_EVIDENCE_AUTHORITY: NON_AUTHORITATIVE_CANDIDATE_EVIDENCE

ANCHOR_STATUS: PROPOSED_NOT_ADOPTED

GIT_MUTATION: NO

FILES_MODIFIED_OUTSIDE_TASK: 0

## Validation entry

\`node scripts/validate-production.mjs\`

This no-argument command is the only complete candidate-verdict route. It recomputes product/Git roots, HEAD/branch/commit/tree, all 147 HEAD/index/working-tree bindings, attributes/filter/ignore evidence, dependency/provenance/historical baselines, task manifest and closing-state rebound.

\`--skip-task-manifest\`, \`--discovery\`, bare \`--fixture\`, unknown flags and duplicate modes are usage errors. \`--self-test-fixture <exact task-local fixture>\` is rejection-only and always exits 2.

## Frozen boundary

HANDOFF and summary are completed before the final self-excluding task artifact manifest. Once the manifest is generated, no bound artifact may be modified.

Human model selection is not Human adoption. Work review is not Human adoption. No stage, commit, push, branch mutation, 8A-0GC or Product Implementation is authorized.

HUMAN_GATE: Work read-only acceptance, then Human Exact Trust Anchor Adoption Decision.
`,
);

const fixtures = [
  ["wrong-head.json", "wrong_head", "HEAD_BINDING_MISMATCH"],
  ["wrong-branch.json", "wrong_branch", "BRANCH_BINDING_MISMATCH"],
  ["missing-path.json", "candidate_missing", "CANDIDATE_PATH_COUNT_MISMATCH"],
  ["extra-path.json", "candidate_extra", "CANDIDATE_PATH_COUNT_MISMATCH"],
  ["duplicate-path.json", "candidate_duplicate", "CANDIDATE_PATH_DUPLICATE"],
  ["nfc-invalid-path.json", "path_nfc", "PATH_NOT_NFC"],
  ["absolute-path.json", "path_absolute", "PATH_ABSOLUTE_NOT_ALLOWED"],
  ["unc-path.json", "path_unc", "PATH_UNC_NOT_ALLOWED"],
  ["drive-path.json", "path_drive", "PATH_DRIVE_NOT_ALLOWED"],
  ["backslash-path.json", "path_backslash", "PATH_BACKSLASH_NOT_ALLOWED"],
  ["traversal-path.json", "path_traversal", "PATH_TRAVERSAL_NOT_ALLOWED"],
  [
    "case-collision.json",
    "path_case_collision",
    "CANDIDATE_CASE_OR_NFC_COLLISION",
  ],
  ["wrong-path-count.json", "wrong_path_count", "BOUND_PATH_COUNT_MISMATCH"],
  ["wrong-blob-oid.json", "wrong_blob_oid", "CANDIDATE_SOURCE_BLOB_OID_MISMATCH"],
  ["wrong-file-sha256.json", "wrong_file_sha256", "CANDIDATE_SHA256_MISMATCH"],
  [
    "wrong-source-manifest-hash.json",
    "wrong_source_manifest_hash",
    "SOURCE_MANIFEST_SHA256_MISMATCH",
  ],
  [
    "manifest-reordered.json",
    "manifest_reordered",
    "TASK_MANIFEST_ENTRY_ORDER_NOT_CANONICAL",
  ],
  ["manifest-schema.json", "manifest_schema", "TASK_MANIFEST_SCHEMA_INVALID"],
  [
    "manifest-generation.json",
    "manifest_generation",
    "TASK_MANIFEST_GENERATION_ORDER_INVALID",
  ],
  [
    "manifest-canonicalization.json",
    "manifest_canonicalization",
    "TASK_MANIFEST_CANONICALIZATION_INVALID",
  ],
  [
    "manifest-physical-count.json",
    "manifest_physical_count",
    "TASK_MANIFEST_PHYSICAL_COUNT_INVALID",
  ],
  [
    "manifest-wrong-hash.json",
    "manifest_wrong_hash",
    "TASK_MANIFEST_JCS_HASH_MISMATCH",
  ],
  [
    "producer-pass-underlying-mismatch.json",
    "producer_pass_underlying_mismatch",
    "CANDIDATE_SHA256_MISMATCH",
  ],
  ["index-changed.json", "index_changed", "CANDIDATE_INDEX_CHANGED"],
  ["worktree-changed.json", "worktree_changed", "CANDIDATE_WORKTREE_CHANGED"],
  [
    "filter-oid-mismatch.json",
    "filter_oid_mismatch",
    "CANDIDATE_FILTER_OR_RAW_IDENTITY_MISMATCH",
  ],
  [
    "attribute-incomplete.json",
    "attribute_incomplete",
    "ATTRIBUTE_EVIDENCE_INCOMPLETE",
  ],
  [
    "index-oid-mismatch.json",
    "index_oid_mismatch",
    "CANDIDATE_INDEX_HEAD_OID_MISMATCH",
  ],
  [
    "dependency-mismatch.json",
    "dependency_mismatch",
    "DEPENDENCY_DIRECT_BINDING_MISMATCH",
  ],
  [
    "provenance-mismatch.json",
    "provenance_mismatch",
    "PROVENANCE_MANIFEST_MISMATCH",
  ],
  [
    "historical-mismatch.json",
    "historical_mismatch",
    "HISTORICAL_MANIFEST_MISMATCH",
  ],
  [
    "ignore-permission-limitation.json",
    "ignore_permission_limitation",
    "IGNORE_EVIDENCE_NOT_VERIFIED",
  ],
  [
    "closing-state-mismatch.json",
    "closing_state_mismatch",
    "CLOSING_STATE_REBOUND_MISMATCH",
  ],
  ["manifest-missing.json", "manifest_missing", "TASK_MANIFEST_MISSING"],
  ["manifest-corrupt.json", "manifest_corrupt", "TASK_MANIFEST_INVALID_JSON"],
  [
    "manifest-self-included.json",
    "manifest_self_included",
    "TASK_MANIFEST_SELF_INCLUDED",
  ],
];
for (const [fileName, mutation, expectedErrorCode] of fixtures) {
  fixture(fileName, mutation, expectedErrorCode);
}

const generated = fs
  .readdirSync(taskRoot, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name));

process.stdout.write(
  `${JSON.stringify({
    task_id: TASK_ID,
    generator_status: "DRAFT_GENERATED",
    evidence_authority: "NON_AUTHORITATIVE_CANDIDATE_EVIDENCE",
    files_present: generated.length,
    generator_sha256: sha256(fs.readFileSync(fileURLToPath(import.meta.url))),
    git_mutation: "NO",
  }, null, 2)}\n`,
);
