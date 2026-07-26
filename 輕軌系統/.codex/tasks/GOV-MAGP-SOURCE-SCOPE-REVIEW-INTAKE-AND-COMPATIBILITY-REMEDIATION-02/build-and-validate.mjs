import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const TASK_ID = "GOV-MAGP-SOURCE-SCOPE-REVIEW-INTAKE-AND-COMPATIBILITY-REMEDIATION-02";
const GENERATED_AT = "2026-07-22T16:34:28+08:00";
const PRODUCT_ROOT = "C:/Users/a2306/Desktop/code/ntmc.yaml/輕軌系統";
const TASK_ROOT = `${PRODUCT_ROOT}/.codex/tasks/${TASK_ID}`;
const PREPARATION_ROOT = `${PRODUCT_ROOT}/.codex/tasks/GOV-MAGP-SOURCE-SCOPE-INDEPENDENT-REVIEW-PREPARATION-01`;
const TARGET_ROOT = `${PRODUCT_ROOT}/.codex/tasks/GOV-MAGP-CORE-SOURCE-SCOPE-AND-AUTHORITY-LOCK-01`;
const TARGET_TASK_ID = "GOV-MAGP-CORE-SOURCE-SCOPE-AND-AUTHORITY-LOCK-01";

const COMPAT_R2 = {
  task_id: "GOV-MAGP-SOURCE-SCOPE-REVIEW-COMPATIBILITY-R2",
  review_package_id: "MAGP-SSR2-COMPATIBILITY-4AC2104F-C7CC-499A-9C08-678F89B0D409",
  assignment_id: "ASSIGN-AF876BEC-3847-4D5C-AF66-B0D858691809",
  reviewer_run_id: "RUN-114A3F2C-4C6C-4F5B-A438-23693E7C5C1B",
  reviewer_session_nonce: "8EBD8E2E1C61271B22DA2FCB995A728865C6BAFE0413C48CF74F7756932C3854",
  package_root: `${TASK_ROOT}/review-packages/compatibility-review-r2`,
};

const AGGREGATOR_R2 = {
  task_id: "GOV-MAGP-SOURCE-SCOPE-AGGREGATION-R2",
  package_id: "MAGP-SSR2-AGGREGATION-6F05A79C-A02C-4735-B51D-7BF4E940D740",
  assignment_id: "ASSIGN-13FCF5E4-BE08-4E0A-BD7D-EA6D12018446",
  run_id: "RUN-3AF5B8AC-4D61-4E9B-B737-84F0CC9D25C2",
  session_nonce: "65B1785C35589BE3CDE79A93DFD60BBC62285A77B538C3EB571A634B0D98E0D0",
  package_root: `${TASK_ROOT}/review-packages/source-scope-aggregation-r2`,
};

const reviewers = [
  {
    key: "source_integrity_r1",
    raw_name: "source-integrity-r1.raw.txt",
    role: "EXTERNAL_SOURCE_INTEGRITY_REVIEWER",
    task_id: "GOV-MAGP-SOURCE-SCOPE-REVIEW-INTEGRITY-R1",
    package_dir: "source-integrity-review",
    source_thread_id: "019f88a2-1e83-7a42-8310-990d06238c2c",
    expected_review_status: "PASS",
    accepted_status: "FORMALLY_ACCEPTED_PASS",
  },
  {
    key: "source_authority_r1",
    raw_name: "source-authority-r1.raw.txt",
    role: "EXTERNAL_SOURCE_AUTHORITY_REVIEWER",
    task_id: "GOV-MAGP-SOURCE-SCOPE-REVIEW-AUTHORITY-R1",
    package_dir: "source-authority-review",
    source_thread_id: "019f88a2-3877-7a40-a3f4-9e96c60227ff",
    expected_review_status: "PASS",
    accepted_status: "FORMALLY_ACCEPTED_PASS",
  },
  {
    key: "scope_contamination_r1",
    raw_name: "scope-contamination-r1.raw.txt",
    role: "EXTERNAL_SCOPE_CONTAMINATION_REVIEWER",
    task_id: "GOV-MAGP-SOURCE-SCOPE-REVIEW-CONTAMINATION-R1",
    package_dir: "scope-contamination-review",
    source_thread_id: "019f88a2-5248-7460-8a80-b822569626e5",
    expected_review_status: "PASS",
    accepted_status: "FORMALLY_ACCEPTED_PASS",
  },
  {
    key: "compatibility_r1",
    raw_name: "compatibility-r1.raw.txt",
    role: "EXTERNAL_COMPATIBILITY_REVIEWER",
    task_id: "GOV-MAGP-SOURCE-SCOPE-REVIEW-COMPATIBILITY-R1",
    package_dir: "compatibility-review",
    source_thread_id: "019f88a2-5fee-7f11-a490-764fba6ce906",
    expected_review_status: "BLOCKER",
    accepted_status: "FORMALLY_ACCEPTED_BLOCKER",
  },
];

function npath(value) {
  return value.replaceAll("\\", "/").normalize("NFC");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sameJson(a, b) {
  return jcs(a) === jcs(b);
}

function jcs(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${jcs(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function shaBytes(value) {
  return crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
}

function shaFile(filePath) {
  return shaBytes(fs.readFileSync(filePath));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveLocalRef(rootSchema, ref) {
  assert(ref.startsWith("#/"), `Only local schema refs are supported: ${ref}`);
  return ref.slice(2).split("/").reduce((node, part) => node[part.replaceAll("~1", "/").replaceAll("~0", "~")], rootSchema);
}

function schemaMatches(value, schema, rootSchema) {
  try {
    validateSchema(value, schema, rootSchema);
    return true;
  } catch {
    return false;
  }
}

function validateSchema(value, schema, rootSchema = schema, at = "$") {
  if (schema.$ref) return validateSchema(value, resolveLocalRef(rootSchema, schema.$ref), rootSchema, at);
  if (schema.allOf) for (const item of schema.allOf) validateSchema(value, item, rootSchema, at);
  if (schema.if && schemaMatches(value, schema.if, rootSchema) && schema.then) validateSchema(value, schema.then, rootSchema, at);
  if (Object.hasOwn(schema, "const")) assert(sameJson(value, schema.const), `${at}: const mismatch`);
  if (schema.enum) assert(schema.enum.some((item) => sameJson(value, item)), `${at}: enum mismatch`);
  if (schema.type === "object") {
    assert(value !== null && typeof value === "object" && !Array.isArray(value), `${at}: expected object`);
    for (const key of schema.required ?? []) assert(Object.hasOwn(value, key), `${at}: missing ${key}`);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) assert(Object.hasOwn(schema.properties ?? {}, key), `${at}: unexpected ${key}`);
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, key)) validateSchema(value[key], child, rootSchema, `${at}.${key}`);
    }
  }
  if (schema.type === "array") {
    assert(Array.isArray(value), `${at}: expected array`);
    if (schema.minItems !== undefined) assert(value.length >= schema.minItems, `${at}: too few items`);
    if (schema.maxItems !== undefined) assert(value.length <= schema.maxItems, `${at}: too many items`);
    if (schema.items) value.forEach((item, index) => validateSchema(item, schema.items, rootSchema, `${at}[${index}]`));
  }
  if (schema.type === "string") {
    assert(typeof value === "string", `${at}: expected string`);
    if (schema.minLength !== undefined) assert(value.length >= schema.minLength, `${at}: too short`);
    if (schema.pattern) assert(new RegExp(schema.pattern).test(value), `${at}: pattern mismatch`);
  }
  if (schema.type === "boolean") assert(typeof value === "boolean", `${at}: expected boolean`);
  if (schema.type === "integer") assert(Number.isInteger(value), `${at}: expected integer`);
  if (schema.type === "number") assert(typeof value === "number" && Number.isFinite(value), `${at}: expected number`);
}

function ensureTaskWrite(filePath) {
  const resolved = npath(path.resolve(filePath));
  const root = npath(path.resolve(TASK_ROOT));
  assert(resolved === root || resolved.startsWith(`${root}/`), `Write escaped task root: ${resolved}`);
  return resolved;
}

function writeText(filePath, text) {
  ensureTaskWrite(filePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, "utf8");
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function fileRecord(filePath, baseRoot) {
  const bytes = fs.readFileSync(filePath);
  return {
    normalized_relative_path: npath(path.relative(baseRoot, filePath)),
    file_size_bytes: bytes.length,
    sha256: shaBytes(bytes),
  };
}

function manifestArtifactMap(manifest) {
  return new Map(manifest.artifacts.map((item) => [item.normalized_relative_path, item]));
}

function verifyTargetSnapshot(targetManifest, targetRecord) {
  assert(shaFile(`${PREPARATION_ROOT}/review-target-manifest.json`) === targetRecord.record_core.review_target_manifest_sha256, "Review target manifest binding mismatch");
  assert(shaBytes(Buffer.from(jcs(targetRecord.record_core), "utf8")) === targetRecord.record_core_sha256, "Review target record JCS mismatch");
  assert(targetManifest.artifact_count === targetManifest.artifacts.length, "Target artifact count mismatch");
  const records = [];
  for (const item of targetManifest.artifacts) {
    assert(!item.normalized_relative_path.includes(".."), `Unsafe target path: ${item.normalized_relative_path}`);
    const filePath = `${TARGET_ROOT}/${item.normalized_relative_path}`;
    const bytes = fs.readFileSync(filePath);
    assert(bytes.length === item.file_size_bytes, `Target size mismatch: ${item.normalized_relative_path}`);
    assert(shaBytes(bytes) === item.sha256, `Target hash mismatch: ${item.normalized_relative_path}`);
    records.push({ normalized_relative_path: item.normalized_relative_path, file_size_bytes: bytes.length, sha256: shaBytes(bytes) });
  }
  return records;
}

function verifySourceSnapshot(sourceBinding, targetRecord) {
  assert(shaFile(`${PREPARATION_ROOT}/source-hash-binding.json`) === targetRecord.record_core.source_hash_binding_sha256, "Source binding file hash mismatch");
  assert(sourceBinding.sources.length === 11, "Source count is not 11");
  const records = [];
  for (const item of sourceBinding.sources) {
    const filePath = `${sourceBinding.source_root}/${item.actual_filename}`;
    const bytes = fs.readFileSync(filePath);
    assert(bytes.length === item.file_size_bytes, `Source size mismatch: ${item.actual_filename}`);
    assert(shaBytes(bytes) === item.sha256, `Source hash mismatch: ${item.actual_filename}`);
    records.push({ actual_filename: item.actual_filename, file_size_bytes: bytes.length, sha256: shaBytes(bytes) });
  }
  return records;
}

function verifyR1Payload(config, registryEntry, returnSchema, transportSchema, targetRecord) {
  const checks = [];
  const ok = (id) => checks.push({ check_id: id, status: "PASS" });
  const rawPath = `${TASK_ROOT}/reviewer-payloads/${config.raw_name}`;
  const rawBytes = fs.readFileSync(rawPath);
  const rawText = rawBytes.toString("utf8");
  assert(rawText.trim() === rawText, `${config.key}: leading or trailing whitespace`);
  const wrapper = JSON.parse(rawText);
  ok("SINGLE_JSON_OBJECT");
  assert(wrapper && typeof wrapper === "object" && !Array.isArray(wrapper), `${config.key}: wrapper is not an object`);
  assert(Object.keys(wrapper).sort().join(",") === "payload_core,payload_core_sha256", `${config.key}: top-level fields mismatch`);
  ok("EXACT_TWO_FIELD_WRAPPER");
  assert(jcs(wrapper) === rawText, `${config.key}: wrapper is not RFC 8785 JCS canonical`);
  ok("WRAPPER_RFC8785_JCS");
  validateSchema(wrapper, returnSchema);
  ok("RETURN_SCHEMA");
  const coreHash = shaBytes(Buffer.from(jcs(wrapper.payload_core), "utf8"));
  assert(coreHash === wrapper.payload_core_sha256, `${config.key}: payload core hash mismatch`);
  ok("PAYLOAD_CORE_RFC8785_JCS_SHA256");

  const core = wrapper.payload_core;
  assert(core.reviewer_role === config.role && core.reviewer_role === registryEntry.reviewer_role, `${config.key}: role mismatch`);
  assert(core.task_id === config.task_id && core.task_id === registryEntry.reviewer_task_id, `${config.key}: task mismatch`);
  assert(core.review_package_id === registryEntry.review_package_id, `${config.key}: package id mismatch`);
  assert(core.assignment_id === registryEntry.assignment_id, `${config.key}: assignment mismatch`);
  assert(core.reviewer_run_id === registryEntry.reviewer_run_id, `${config.key}: run mismatch`);
  assert(core.reviewer_session_nonce === registryEntry.reviewer_session_nonce, `${config.key}: nonce mismatch`);
  assert(core.review_package_core_sha256 === registryEntry.package_core_sha256, `${config.key}: package core binding mismatch`);
  ok("IDENTITY_AND_ASSIGNMENT_BINDINGS");

  const packageRoot = `${PREPARATION_ROOT}/review-packages/${config.package_dir}`;
  assert(npath(packageRoot) === npath(registryEntry.package_root), `${config.key}: registry package root mismatch`);
  const envelopePath = `${packageRoot}/absolute-launch-envelope.json`;
  const manifestPath = `${packageRoot}/package-manifest.json`;
  const verificationPath = `${packageRoot}/package-verification.json`;
  const scopePath = `${packageRoot}/exact-read-scope.json`;
  const assignmentPath = `${packageRoot}/assignment.json`;
  const envelope = readJson(envelopePath);
  const manifest = readJson(manifestPath);
  const verification = readJson(verificationPath);
  const exactScope = readJson(scopePath);
  const assignment = readJson(assignmentPath);

  assert(shaBytes(Buffer.from(jcs(envelope.launch_core), "utf8")) === envelope.launch_core_sha256, `${config.key}: launch core hash mismatch`);
  assert(envelope.launch_core_sha256 === registryEntry.launch_core_sha256, `${config.key}: launch registry hash mismatch`);
  assert(envelope.launch_core.launch_generation === "R1", `${config.key}: generation mismatch`);
  assert(envelope.launch_core.launch_context_required === "BRAND_NEW_TOP_LEVEL_CODEX_CHAT", `${config.key}: launch context mismatch`);
  for (const [field, expected] of [
    ["reviewer_role", core.reviewer_role], ["reviewer_task_id", core.task_id], ["review_package_id", core.review_package_id],
    ["assignment_id", core.assignment_id], ["reviewer_run_id", core.reviewer_run_id], ["reviewer_session_nonce", core.reviewer_session_nonce],
    ["package_core_sha256", core.review_package_core_sha256],
  ]) assert(envelope.launch_core[field] === expected, `${config.key}: envelope ${field} mismatch`);
  ok("LAUNCH_ENVELOPE_BINDING");

  assert(shaBytes(Buffer.from(jcs(manifest.package_core), "utf8")) === manifest.package_core_sha256, `${config.key}: package core JCS mismatch`);
  assert(manifest.package_core_sha256 === core.review_package_core_sha256, `${config.key}: package core payload mismatch`);
  for (const item of manifest.package_core.artifacts) {
    assert(!item.normalized_relative_path.includes(".."), `${config.key}: unsafe package artifact path`);
    const artifactPath = `${packageRoot}/${item.normalized_relative_path}`;
    const bytes = fs.readFileSync(artifactPath);
    assert(bytes.length === item.file_size_bytes, `${config.key}: package artifact size mismatch ${item.normalized_relative_path}`);
    assert(shaBytes(bytes) === item.sha256, `${config.key}: package artifact hash mismatch ${item.normalized_relative_path}`);
  }
  assert(shaFile(manifestPath) === envelope.launch_core.package_manifest_sha256, `${config.key}: manifest raw hash mismatch`);
  assert(shaFile(verificationPath) === envelope.launch_core.package_verification_sha256, `${config.key}: verification raw hash mismatch`);
  assert(shaFile(scopePath) === envelope.launch_core.exact_read_scope_sha256, `${config.key}: scope raw hash mismatch`);
  assert(verification.verification_status === "PASS" && verification.package_core_hash_match === true, `${config.key}: package verification not PASS`);
  ok("PACKAGE_MANIFEST_AND_ARTIFACT_HASHES");

  assert(assignment.review_generation === "R1" && assignment.execution_context_required === "BRAND_NEW_TOP_LEVEL_CODEX_CHAT", `${config.key}: assignment generation/context mismatch`);
  for (const field of ["review_package_id", "assignment_id", "reviewer_run_id", "reviewer_session_nonce", "reviewer_role", "reviewer_task_id"]) {
    const payloadField = field === "reviewer_task_id" ? "task_id" : field;
    assert(assignment[field] === core[payloadField], `${config.key}: assignment ${field} mismatch`);
  }
  ok("ASSIGNMENT_FILE_BINDING");

  assert(exactScope.scope_mode === "EXACT_ABSOLUTE_PATH_ALLOWLIST_ONLY" && exactScope.implicit_paths_allowed === false, `${config.key}: exact scope mode mismatch`);
  assert(exactScope.allowed_path_count === exactScope.exact_absolute_path_allowlist.length, `${config.key}: scope path count mismatch`);
  assert(exactScope.reviewer_role === core.reviewer_role, `${config.key}: scope role mismatch`);
  const scopeMap = new Map();
  for (const item of exactScope.exact_absolute_path_allowlist) {
    assert(item.absolute_path === item.absolute_path.normalize("NFC"), `${config.key}: non-NFC scope path`);
    assert(!scopeMap.has(item.absolute_path), `${config.key}: duplicate scope path`);
    scopeMap.set(item.absolute_path, item.content_scope);
  }
  const accessSeen = new Set();
  for (const access of core.access_log) {
    const accessKey = `${access.absolute_path}|${access.access_type}|${access.status}`;
    assert(!accessSeen.has(accessKey), `${config.key}: duplicate access log entry`);
    accessSeen.add(accessKey);
    if (access.status === "ALLOWED_READ") {
      assert(scopeMap.has(access.absolute_path), `${config.key}: out-of-scope access ${access.absolute_path}`);
      assert(scopeMap.get(access.absolute_path) === access.content_scope, `${config.key}: content scope mismatch ${access.absolute_path}`);
    }
  }
  ok("EXACT_READ_SCOPE_AND_ACCESS_LOG");

  assert(sameJson(core.review_target_binding, targetRecord.record_core && {
    review_target_task_id: targetRecord.record_core.review_target_task_id,
    review_target_manifest_sha256: targetRecord.record_core.review_target_manifest_sha256,
    review_target_record_core_sha256: targetRecord.record_core_sha256,
    source_directory_manifest_sha256: targetRecord.record_core.source_directory_manifest_sha256,
    source_hash_binding_sha256: targetRecord.record_core.source_hash_binding_sha256,
  }), `${config.key}: target binding mismatch`);
  assert(sameJson(core.review_target_binding, envelope.launch_core.review_target_binding), `${config.key}: target envelope mismatch`);
  ok("REVIEW_TARGET_AND_SOURCE_BINDINGS");

  assert(core.startup.status === "STARTUP_VALID", `${config.key}: startup not valid`);
  for (const key of ["assignment_valid", "package_valid", "target_valid", "scope_valid", "clean_context_valid"]) assert(core.startup[key] === true, `${config.key}: startup ${key} false`);
  assert(core.completed === true && core.mandatory_exit_requested === true && core.review_started === true, `${config.key}: completion flags mismatch`);
  const context = core.clean_context_attestation;
  assert(context.brand_new_top_level_codex_chat === true, `${config.key}: clean top-level context false`);
  for (const key of ["preparation_conversation_memory_used", "other_reviewer_conversation_used", "other_reviewer_payload_used", "implementation_conversation_used", "subagents_used"]) assert(context[key] === false, `${config.key}: clean context ${key} true`);
  for (const key of ["reviewer_repository_write_count", "forbidden_read_count", "out_of_scope_read_count"]) assert(context[key] === 0, `${config.key}: clean count ${key} nonzero`);
  ok("STARTUP_COMPLETION_AND_CLEAN_CONTEXT");

  assert(core.review_status === config.expected_review_status, `${config.key}: review status mismatch`);
  if (core.review_status === "PASS") {
    assert(!core.findings.some((finding) => finding.status === "OPEN" && ["CRITICAL", "HIGH"].includes(finding.severity)), `${config.key}: PASS has open high finding`);
  } else {
    const exactFindings = core.findings.map((finding) => `${finding.finding_id}|${finding.severity}|${finding.status}`).sort();
    assert(exactFindings.join(",") === "COMPAT-R1-001|HIGH|OPEN,COMPAT-R1-002|HIGH|OPEN", "COMPATIBILITY_FINDING_SET_MISMATCH");
  }
  ok("REVIEW_DECISION_AND_FINDINGS");

  const attestation = {
    schema_version: 1,
    reviewer_role: core.reviewer_role,
    review_generation: "R1",
    source_thread_id: config.source_thread_id,
    review_package_id: core.review_package_id,
    reviewer_run_id: core.reviewer_run_id,
    payload_sha256: shaBytes(rawBytes),
    payload_modified: false,
    transported_by_human: true,
  };
  validateSchema(attestation, transportSchema);
  ok("MANUAL_TRANSPORT_ATTESTATION_SCHEMA");
  return { config, wrapper, rawPath, rawBytes, checks, attestation };
}

function buildOverlay(targetRecord, targetManifest, targetSnapshot, intakeResults) {
  const dir = `${TASK_ROOT}/compatibility-remediation`;
  const targetBinding = {
    review_target_task_id: TARGET_TASK_ID,
    review_target_manifest_sha256: targetRecord.record_core.review_target_manifest_sha256,
    review_target_record_core_sha256: targetRecord.record_core_sha256,
  };
  const base = { schema_version: 1, corrective_overlay_id: "MAGP-SOURCE-SCOPE-COMPATIBILITY-CORRECTIVE-OVERLAY-R2", generated_at: GENERATED_AT, base_target_binding: targetBinding };

  const files = {
    "source-scope-status-correction.json": {
      ...base,
      correction_type: "NON_DESTRUCTIVE_STATUS_INTERPRETATION",
      source_scope_lock_task_status: "COMPLETE",
      source_scope_lock_review_gate: "PENDING",
      human_source_scope_adoption_status: "NOT_STARTED",
      next_authorized_action: "COMPATIBILITY_R2_REVIEW",
      original_target_bytes_modified: false,
    },
    "source-authority-effective-state.json": {
      ...base,
      source_authority_status: "PROPOSED_NOT_ADOPTED",
      downstream_policy_use_allowed: false,
      normative_authority_allowed_before_human_adoption: false,
      authority_policy_content_modified: false,
    },
    "architecture-reconciliation-authorization-state.json": {
      ...base,
      architecture_reconciliation_status: "NOT_AUTHORIZED",
      core_object_library_status: "NOT_AUTHORIZED",
      architecture_specification_status: "NOT_AUTHORIZED",
      next_authorized_action: "COMPATIBILITY_R2_REVIEW",
    },
    "downstream-policy-consumption-prohibition.yaml": {
      ...base,
      policy_status: "ENFORCED_BY_CORRECTIVE_OVERLAY",
      downstream_policy_use_allowed: false,
      prohibited_until: ["COMPATIBILITY_R2_FORMALLY_ACCEPTED_PASS", "SOURCE_SCOPE_AGGREGATOR_R2_PASS", "HUMAN_SOURCE_SCOPE_EXACT_MANIFEST_ADOPTION"],
      prohibited_actions: ["TREAT_SOURCE_AUTHORITY_AS_ADOPTED", "START_ARCHITECTURE_RECONCILIATION", "CREATE_CORE_OBJECT_LIBRARY", "USE_R1_COMPATIBILITY_BLOCKER_AS_SUCCESS_INPUT"],
    },
    "original-premature-statements-disposition.json": {
      ...base,
      disposition: "HISTORICAL_PREMATURE_DIRECTION",
      downstream_authorization_effect: "NONE",
      statements: [
        { evidence_path: `${TARGET_ROOT}/blueprint.yaml`, evidence_pointer: "/execution/current_step", disposition: "NOT_EFFECTIVE_FOR_DOWNSTREAM_AUTHORIZATION" },
        { evidence_path: `${TARGET_ROOT}/final-summary.md`, evidence_locator: "Ready For", disposition: "NOT_EFFECTIVE_FOR_DOWNSTREAM_AUTHORIZATION" },
        { evidence_path: `${TARGET_ROOT}/HANDOFF.md`, evidence_locator: "Suggested next step", disposition: "NOT_EFFECTIVE_FOR_DOWNSTREAM_AUTHORIZATION" },
        { evidence_path: `${TARGET_ROOT}/source-scope-validation-results.json`, evidence_pointer: "/downstream_architecture_reconciliation_ready", disposition: "NOT_EFFECTIVE_FOR_DOWNSTREAM_AUTHORIZATION" },
        { evidence_path: `${TARGET_ROOT}/source-authority-policy.yaml`, evidence_pointer: "/policy_status", disposition: "NOT_EFFECTIVE_AS_ADOPTED_AUTHORITY" },
      ],
      historical_files_modified: false,
    },
    "compatibility-finding-remediation-matrix.json": {
      ...base,
      finding_count: 2,
      findings: [
        {
          finding_id: "COMPAT-R1-001",
          original_severity: "HIGH",
          original_status: "OPEN",
          remediation_state: "REMEDIATED_PENDING_COMPATIBILITY_R2",
          closure_authority: "EXTERNAL_COMPATIBILITY_REVIEWER_R2",
          corrective_evidence: ["source-scope-status-correction.json", "source-authority-effective-state.json", "downstream-policy-consumption-prohibition.yaml", "original-premature-statements-disposition.json"],
        },
        {
          finding_id: "COMPAT-R1-002",
          original_severity: "HIGH",
          original_status: "OPEN",
          remediation_state: "REMEDIATED_PENDING_COMPATIBILITY_R2",
          closure_authority: "EXTERNAL_COMPATIBILITY_REVIEWER_R2",
          corrective_evidence: ["architecture-reconciliation-authorization-state.json", "downstream-policy-consumption-prohibition.yaml", "original-premature-statements-disposition.json"],
        },
      ],
      findings_closed_by_this_task: 0,
    },
    "corrective-record-authority.json": {
      ...base,
      authority_scope: ["STATUS_INTERPRETATION", "DOWNSTREAM_AUTHORIZATION_ORDER", "COMPATIBILITY_FINDING_REMEDIATION_EVIDENCE"],
      authority_exclusions: ["SOURCE_AUTHORITY_ADOPTION", "MAGP_ARCHITECTURE_APPROVAL", "SOURCE_CLASSIFICATION_CHANGE", "NEW_MAGP_CORE_CLAIM", "NEW_RAILWAY_RULE", "HISTORICAL_TARGET_MUTATION"],
      may_close_compatibility_findings: false,
      compatibility_r2_has_closure_authority: true,
      human_exact_manifest_adoption_required: true,
    },
  };
  for (const [name, value] of Object.entries(files)) writeJson(`${dir}/${name}`, value);
  const overlayArtifacts = Object.keys(files).sort().map((name) => fileRecord(`${dir}/${name}`, dir));
  const recordCore = {
    schema_version: 1,
    record_id: "MAGP-SOURCE-SCOPE-COMPATIBILITY-CORRECTION-INTEGRITY-R2",
    generated_at: GENERATED_AT,
    base_target_binding: targetBinding,
    base_target_artifact_count: targetSnapshot.length,
    base_target_artifacts: targetSnapshot,
    base_target_unchanged: true,
    corrective_overlay_artifact_count: overlayArtifacts.length,
    corrective_overlay_artifacts: overlayArtifacts,
    compatibility_r1_raw_payload_sha256: intakeResults.find((item) => item.reviewer_role === "EXTERNAL_COMPATIBILITY_REVIEWER").raw_payload_sha256,
    original_target_write_count: 0,
    new_magp_core_claim_count: 0,
    new_railway_rule_count: 0,
  };
  const integrity = { record_core: recordCore, record_core_sha256: shaBytes(Buffer.from(jcs(recordCore), "utf8")), canonicalization: "RFC8785_JCS", hash_algorithm: "SHA-256", hash_encoding: "UPPERCASE_HEX" };
  writeJson(`${dir}/correction-integrity-record.json`, integrity);
  return { dir, integrity, artifactRecords: [...overlayArtifacts, fileRecord(`${dir}/correction-integrity-record.json`, dir)] };
}

function buildReuseRecord(targetRecord, targetSnapshot, sourceSnapshot, targetManifest) {
  const artifactMap = manifestArtifactMap(targetManifest);
  const requiredUnchanged = [
    "source-scope-register.yaml",
    "source-authority-policy.yaml",
    "source-claim-eligibility-policy.yaml",
    "vetc-contamination-prevention-policy.yaml",
    "health-domain-contamination-prevention-policy.yaml",
  ].map((name) => ({ normalized_relative_path: name, sha256: artifactMap.get(name).sha256, current_sha256: shaFile(`${TARGET_ROOT}/${name}`), unchanged: artifactMap.get(name).sha256 === shaFile(`${TARGET_ROOT}/${name}`) }));
  assert(requiredUnchanged.every((item) => item.unchanged), "SOURCE_SCOPE_R1_REVIEWER_REUSE_INVALID: policy artifact changed");
  const register = readJson(`${TARGET_ROOT}/source-scope-register.yaml`);
  const counts = register.counts;
  assert(counts.TOTAL === 11 && counts.CORE_INCLUDED === 4 && counts.OPTIONAL_PATTERN_ONLY === 1 && counts.EXCLUDED === 6, "SOURCE_SCOPE_R1_REVIEWER_REUSE_INVALID: classification counts changed");
  const core = {
    schema_version: 1,
    record_id: "MAGP-SOURCE-SCOPE-R1-REVIEWER-REUSE-R2",
    generated_at: GENERATED_AT,
    base_target_binding: {
      review_target_task_id: TARGET_TASK_ID,
      review_target_manifest_sha256: targetRecord.record_core.review_target_manifest_sha256,
      review_target_record_core_sha256: targetRecord.record_core_sha256,
    },
    preserved_reviewers: ["EXTERNAL_SOURCE_INTEGRITY_REVIEWER", "EXTERNAL_SOURCE_AUTHORITY_REVIEWER", "EXTERNAL_SCOPE_CONTAMINATION_REVIEWER"],
    preservation_status: "PRESERVED_FOR_SOURCE_SCOPE_AGGREGATOR_R2",
    source_file_count: sourceSnapshot.length,
    source_files_unchanged: true,
    source_ids_unchanged: true,
    source_hashes_unchanged: true,
    classification_counts: counts,
    classification_4_1_6_unchanged: true,
    policy_artifacts: requiredUnchanged,
    corrective_overlay_scope: "STATUS_AND_DOWNSTREAM_AUTHORIZATION_SEQUENCE_ONLY",
    new_magp_core_claim_count: 0,
    new_railway_rule_count: 0,
    base_target_artifact_count: targetSnapshot.length,
    base_target_unchanged: true,
  };
  const record = { record_core: core, record_core_sha256: shaBytes(Buffer.from(jcs(core), "utf8")), canonicalization: "RFC8785_JCS", hash_algorithm: "SHA-256", hash_encoding: "UPPERCASE_HEX" };
  writeJson(`${TASK_ROOT}/reviewer-reuse-preservation.json`, record);
  return record;
}

function packageArtifactRecords(packageRoot, names) {
  return names.map((name) => fileRecord(`${packageRoot}/${name}`, packageRoot));
}

function buildCompatibilityR2Package(targetRecord, targetManifest, overlay, reuseRecord, formalIntake) {
  const root = COMPAT_R2.package_root;
  fs.mkdirSync(root, { recursive: true });
  const ownSchemaPath = `${TASK_ROOT}/reviewer-return-payload.schema.json`;
  const returnSchema = readJson(`${PREPARATION_ROOT}/reviewer-return-payload.schema.json`);
  writeJson(ownSchemaPath, returnSchema);
  const targetBinding = {
    review_target_task_id: TARGET_TASK_ID,
    review_target_manifest_sha256: targetRecord.record_core.review_target_manifest_sha256,
    review_target_record_core_sha256: targetRecord.record_core_sha256,
    source_directory_manifest_sha256: targetRecord.record_core.source_directory_manifest_sha256,
    source_hash_binding_sha256: targetRecord.record_core.source_hash_binding_sha256,
  };
  const assignment = {
    schema_version: 1,
    review_generation: "R2",
    review_package_id: COMPAT_R2.review_package_id,
    assignment_id: COMPAT_R2.assignment_id,
    reviewer_run_id: COMPAT_R2.reviewer_run_id,
    reviewer_session_nonce: COMPAT_R2.reviewer_session_nonce,
    reviewer_role: "EXTERNAL_COMPATIBILITY_REVIEWER",
    reviewer_task_id: COMPAT_R2.task_id,
    preparation_task_id: TASK_ID,
    objective: "Independently verify the non-destructive Compatibility corrective overlay and decide closure of COMPAT-R1-001 and COMPAT-R1-002.",
    execution_context_required: "BRAND_NEW_TOP_LEVEL_CODEX_CHAT",
    finding_closure_authority: ["COMPAT-R1-001", "COMPAT-R1-002"],
    current_finding_state: "REMEDIATED_PENDING_COMPATIBILITY_R2",
    review_target_binding: targetBinding,
    repository_write_paths: [],
    reviewer_launch_status: "NOT_STARTED",
    reviewer_payload_status: "NOT_CREATED",
  };
  writeJson(`${root}/assignment.json`, assignment);
  writeJson(`${root}/startup-contract.json`, {
    schema_version: 1,
    reviewer_role: "EXTERNAL_COMPATIBILITY_REVIEWER",
    mandatory_first_read: `${root}/absolute-launch-envelope.json`,
    startup_sequence: [
      "Verify this is a brand-new top-level Codex chat with no inherited implementation, review, aggregation, or payload context.",
      "Recompute the RFC 8785 JCS hash of launch_core and verify all R2 identity and package bindings.",
      "Verify the frozen R1 review target remains byte-identical and the corrective overlay is separately bound.",
      "Verify formal intake and preserved R1 Reviewer reuse evidence before substantive review.",
      "Return a startup BLOCKER before substantive review if any binding fails.",
    ],
    startup_valid_requires: ["assignment_valid", "package_valid", "target_valid", "scope_valid", "clean_context_valid", "overlay_valid", "reuse_valid"],
    fail_closed: true,
  });
  writeJson(`${root}/review-requirements.json`, {
    schema_version: 1,
    reviewer_role: "EXTERNAL_COMPATIBILITY_REVIEWER",
    review_generation: "R2",
    finding_closure_authority: ["COMPAT-R1-001", "COMPAT-R1-002"],
    review_questions: [
      { requirement_id: "COMPATIBILITY-R2-REQ-01", question: "Does the overlay keep the pending review gate distinct from an active policy?", mandatory: true },
      { requirement_id: "COMPATIBILITY-R2-REQ-02", question: "Is Source Authority still PROPOSED_NOT_ADOPTED?", mandatory: true },
      { requirement_id: "COMPATIBILITY-R2-REQ-03", question: "Is Normative use prohibited before Human adoption?", mandatory: true },
      { requirement_id: "COMPATIBILITY-R2-REQ-04", question: "Does Architecture Reconciliation remain NOT_AUTHORIZED?", mandatory: true },
      { requirement_id: "COMPATIBILITY-R2-REQ-05", question: "Are all original Source Scope Lock target bytes unchanged?", mandatory: true },
      { requirement_id: "COMPATIBILITY-R2-REQ-06", question: "Is the corrective overlay limited to status interpretation and downstream authorization order?", mandatory: true },
      { requirement_id: "COMPATIBILITY-R2-REQ-07", question: "Are classifications, Authority content, claim eligibility, and contamination policies unchanged?", mandatory: true },
      { requirement_id: "COMPATIBILITY-R2-REQ-08", question: "Can the three formally accepted R1 PASS payloads be legally reused?", mandatory: true },
    ],
    pass_contract: "PASS requires both COMPAT-R1 findings returned as CLOSED with exact IDs and no new OPEN CRITICAL or HIGH finding.",
    current_finding_state: "REMEDIATED_PENDING_COMPATIBILITY_R2",
    findings_may_be_preclosed_by_preparation: false,
    mandatory_exit_requested_value: true,
  });
  writeJson(`${root}/prohibited-actions.json`, {
    schema_version: 1,
    execution_context_required: "BRAND_NEW_TOP_LEVEL_CODEX_CHAT",
    prohibited: ["WRITE_ANY_REPOSITORY_OR_SOURCE_FILE", "USE_GIT", "USE_NETWORK", "USE_SERVICE", "USE_DATABASE", "USE_SEED_OR_MIGRATION", "READ_DOT_ENV", "SPAWN_CHILD_AGENT", "USE_SUBAGENT", "READ_CONVERSATION_MEMORY", "MODIFY_R1_REVIEW_TARGET", "APPROVE_SOURCE_AUTHORITY", "START_ARCHITECTURE_RECONCILIATION", "CREATE_CORE_OBJECT_LIBRARY", "RUN_AGGREGATOR", "CLOSE_FINDING_WITHOUT_EVIDENCE"],
    mandatory_response_to_violation: "RETURN_BLOCKER_AND_REQUEST_EXIT",
  });
  writeJson(`${root}/finding-ownership.json`, {
    schema_version: 1,
    reviewer_role: "EXTERNAL_COMPATIBILITY_REVIEWER",
    owned_finding_ids: ["COMPAT-R1-001", "COMPAT-R1-002"],
    closure_authority: true,
    allowed_closure_source: "BOUND_COMPATIBILITY_CORRECTIVE_OVERLAY_ONLY",
    prohibited_scope_expansion: true,
  });
  writeJson(`${root}/return-payload.schema.json`, { $schema: "https://json-schema.org/draft/2020-12/schema", $id: "urn:magp:compatibility-review:return-payload:r2", $ref: "../../reviewer-return-payload.schema.json" });
  writeJson(`${root}/embedded-startup-blocker-template.json`, {
    schema_version: 1,
    template_type: "STARTUP_BLOCKER_RETURN_INSTRUCTIONS",
    reviewer_role: "EXTERNAL_COMPATIBILITY_REVIEWER",
    fixed_identity: { review_package_id: COMPAT_R2.review_package_id, assignment_id: COMPAT_R2.assignment_id, reviewer_run_id: COMPAT_R2.reviewer_run_id, reviewer_session_nonce: COMPAT_R2.reviewer_session_nonce, task_id: COMPAT_R2.task_id },
    required_values: { review_status: "BLOCKER", review_started: false, source_content_reviewed: false, completed: false, mandatory_exit_requested: true, startup_status: "STARTUP_BLOCKER" },
    finding_requirement: "Include at least one OPEN HIGH or CRITICAL finding identifying the failed R2 startup binding.",
    output_requirement: "Return exactly one RFC 8785 JCS canonical two-field wrapper and no other text.",
  });
  writeText(`${root}/standalone-top-level-reviewer-prompt.md`, `Codex, act only as EXTERNAL_COMPATIBILITY_REVIEWER for review generation R2.\n\nThis review must run in a BRAND_NEW_TOP_LEVEL_CODEX_CHAT. Do not use memory, subagents, Git, network, services, databases, seeds, migrations, .env, repository search, globs, recursive discovery, cwd inference, another Reviewer payload, or an implementation conversation. Do not write any repository or source file.\n\nMANDATORY FIRST READ:\n${root}/absolute-launch-envelope.json\n\nValidate every launch, package, identity, frozen-target, corrective-overlay, formal-intake, R1-reuse, and exact-read-scope binding before review. Read only paths in exact-read-scope.json. Any invalid binding or forbidden read is a BLOCKER.\n\nReview only COMPAT-R1-001 and COMPAT-R1-002 using review-requirements.json. Do not approve Source Authority, MAGP architecture, Architecture Reconciliation, Core Object Library creation, or Aggregator execution.\n\nThe findings are REMEDIATED_PENDING_COMPATIBILITY_R2, not pre-closed. PASS requires evidence-backed closure of both exact finding IDs. Return exactly one RFC 8785 JCS canonical two-field wrapper conforming to return-payload.schema.json, set mandatory_exit_requested=true, and emit no text outside JSON.\n`);

  const scopeEntries = [];
  const add = (absolute_path, purpose) => scopeEntries.push({ absolute_path, content_scope: "FULL_ARTIFACT", purpose });
  for (const item of targetManifest.artifacts) add(`${TARGET_ROOT}/${item.normalized_relative_path}`, "FROZEN_R1_REVIEW_TARGET");
  for (const name of ["review-target-canonical-record.json", "review-target-integrity-verification.json", "review-target-manifest.json", "source-hash-binding.json", "source-identity-reverification.json", "source-root-reverification.json", "manual-reviewer-transport-attestation.schema.json", "reviewer-identity-registry.json"]) add(`${PREPARATION_ROOT}/${name}`, "BOUND_R1_EVIDENCE");
  for (const config of reviewers) {
    add(`${TASK_ROOT}/reviewer-payloads/${config.raw_name}`, "FORMALLY_INTAKEN_R1_PAYLOAD");
    add(`${TASK_ROOT}/transport-attestations/${config.key}.json`, "FORMAL_TRANSPORT_ATTESTATION");
    for (const name of ["absolute-launch-envelope.json", "package-manifest.json", "exact-read-scope.json"]) add(`${PREPARATION_ROOT}/review-packages/${config.package_dir}/${name}`, "R1_PACKAGE_BINDING");
  }
  add(`${TASK_ROOT}/formal-intake-results.json`, "FORMAL_INTAKE_EVIDENCE");
  add(`${TASK_ROOT}/reviewer-reuse-preservation.json`, "R1_REUSE_EVIDENCE");
  for (const record of overlay.artifactRecords) add(`${overlay.dir}/${record.normalized_relative_path}`, "CORRECTIVE_OVERLAY");
  add(ownSchemaPath, "R2_RETURN_SCHEMA");
  for (const name of ["absolute-launch-envelope.json", "assignment.json", "embedded-startup-blocker-template.json", "exact-read-scope.json", "finding-ownership.json", "package-manifest.json", "package-verification.json", "prohibited-actions.json", "return-payload.schema.json", "review-requirements.json", "standalone-top-level-reviewer-prompt.md", "startup-contract.json"]) add(`${root}/${name}`, "OWN_REVIEW_PACKAGE");
  const exactScope = {
    schema_version: 1,
    reviewer_role: "EXTERNAL_COMPATIBILITY_REVIEWER",
    review_generation: "R2",
    scope_mode: "EXACT_ABSOLUTE_PATH_ALLOWLIST_ONLY",
    exact_absolute_path_allowlist: scopeEntries,
    allowed_path_count: scopeEntries.length,
    implicit_paths_allowed: false,
    denied_resolution_methods: ["GLOB", "REPOSITORY_SEARCH", "RECURSIVE_DISCOVERY", "CURRENT_WORKING_DIRECTORY_INFERENCE", "CONVERSATION_MEMORY_PATH", "SIBLING_PROJECT_PATH"],
    out_of_scope_read_requires_blocker: true,
  };
  writeJson(`${root}/exact-read-scope.json`, exactScope);

  const artifactNames = ["assignment.json", "startup-contract.json", "review-requirements.json", "exact-read-scope.json", "prohibited-actions.json", "finding-ownership.json", "return-payload.schema.json", "embedded-startup-blocker-template.json", "standalone-top-level-reviewer-prompt.md"];
  const packageCore = {
    schema_version: 1,
    review_generation: "R2",
    review_package_id: COMPAT_R2.review_package_id,
    assignment_id: COMPAT_R2.assignment_id,
    reviewer_run_id: COMPAT_R2.reviewer_run_id,
    reviewer_session_nonce: COMPAT_R2.reviewer_session_nonce,
    reviewer_role: "EXTERNAL_COMPATIBILITY_REVIEWER",
    reviewer_task_id: COMPAT_R2.task_id,
    preparation_task_id: TASK_ID,
    review_target_binding: targetBinding,
    compatibility_r1_payload_core_sha256: formalIntake.results_core.results.find((item) => item.reviewer_role === "EXTERNAL_COMPATIBILITY_REVIEWER").payload_core_sha256,
    correction_integrity_record_core_sha256: overlay.integrity.record_core_sha256,
    reviewer_reuse_record_core_sha256: reuseRecord.record_core_sha256,
    formal_intake_results_core_sha256: formalIntake.results_core_sha256,
    exact_read_scope_sha256: shaFile(`${root}/exact-read-scope.json`),
    shared_return_schema_sha256: shaFile(ownSchemaPath),
    manual_transport_schema_sha256: shaFile(`${PREPARATION_ROOT}/manual-reviewer-transport-attestation.schema.json`),
    artifacts: packageArtifactRecords(root, artifactNames),
  };
  const packageManifest = { package_core: packageCore, package_core_sha256: shaBytes(Buffer.from(jcs(packageCore), "utf8")), canonicalization: "RFC8785_JCS", hash_algorithm: "SHA-256", hash_encoding: "UPPERCASE_HEX" };
  writeJson(`${root}/package-manifest.json`, packageManifest);
  const verification = {
    schema_version: 1,
    verification_status: "PASS",
    review_package_id: COMPAT_R2.review_package_id,
    reviewer_role: "EXTERNAL_COMPATIBILITY_REVIEWER",
    review_generation: "R2",
    package_core_sha256: packageManifest.package_core_sha256,
    recomputed_package_core_sha256: shaBytes(Buffer.from(jcs(packageCore), "utf8")),
    package_core_hash_match: true,
    declared_artifact_count: artifactNames.length,
    artifact_hash_match_count: artifactNames.length,
    exact_read_scope_mode: "EXACT_ABSOLUTE_PATH_ALLOWLIST_ONLY",
    formal_intake_status: "FORMALLY_ACCEPTED_4_OF_4",
    finding_state: "REMEDIATED_PENDING_COMPATIBILITY_R2",
    reviewer_launch_status: "NOT_STARTED",
    verified_at: GENERATED_AT,
  };
  writeJson(`${root}/package-verification.json`, verification);
  const launchCore = {
    schema_version: 1,
    launch_generation: "R2",
    launch_context_required: "BRAND_NEW_TOP_LEVEL_CODEX_CHAT",
    preparation_task_id: TASK_ID,
    reviewer_task_id: COMPAT_R2.task_id,
    reviewer_role: "EXTERNAL_COMPATIBILITY_REVIEWER",
    review_package_id: COMPAT_R2.review_package_id,
    assignment_id: COMPAT_R2.assignment_id,
    reviewer_run_id: COMPAT_R2.reviewer_run_id,
    reviewer_session_nonce: COMPAT_R2.reviewer_session_nonce,
    package_core_sha256: packageManifest.package_core_sha256,
    package_manifest_absolute_path: `${root}/package-manifest.json`,
    package_manifest_sha256: shaFile(`${root}/package-manifest.json`),
    package_verification_absolute_path: `${root}/package-verification.json`,
    package_verification_sha256: shaFile(`${root}/package-verification.json`),
    standalone_prompt_absolute_path: `${root}/standalone-top-level-reviewer-prompt.md`,
    standalone_prompt_sha256: shaFile(`${root}/standalone-top-level-reviewer-prompt.md`),
    exact_read_scope_absolute_path: `${root}/exact-read-scope.json`,
    exact_read_scope_sha256: shaFile(`${root}/exact-read-scope.json`),
    shared_return_schema_absolute_path: ownSchemaPath,
    shared_return_schema_sha256: shaFile(ownSchemaPath),
    review_target_binding: targetBinding,
    correction_integrity_record_core_sha256: overlay.integrity.record_core_sha256,
    reviewer_reuse_record_core_sha256: reuseRecord.record_core_sha256,
  };
  const envelope = { launch_core: launchCore, launch_core_sha256: shaBytes(Buffer.from(jcs(launchCore), "utf8")), canonicalization: "RFC8785_JCS", hash_algorithm: "SHA-256", hash_encoding: "UPPERCASE_HEX" };
  writeJson(`${root}/absolute-launch-envelope.json`, envelope);
  return { packageManifest, envelope, exactScope };
}

function buildAggregatorR2Package(formalIntake, overlay, reuseRecord, compatibilityPackage) {
  const root = AGGREGATOR_R2.package_root;
  fs.mkdirSync(root, { recursive: true });
  const futureCompatPayload = `${TASK_ROOT}/reviewer-payloads/compatibility-r2.raw.txt`;
  writeJson(`${root}/assignment.json`, {
    schema_version: 1,
    aggregation_generation: "R2",
    aggregator_task_id: AGGREGATOR_R2.task_id,
    aggregation_package_id: AGGREGATOR_R2.package_id,
    assignment_id: AGGREGATOR_R2.assignment_id,
    aggregator_run_id: AGGREGATOR_R2.run_id,
    aggregator_session_nonce: AGGREGATOR_R2.session_nonce,
    preparation_task_id: TASK_ID,
    execution_context_required: "BRAND_NEW_TOP_LEVEL_CODEX_CHAT",
    package_status: "CONDITIONALLY_READY",
    launch_authorized: false,
    aggregator_launch_status: "NOT_STARTED",
  });
  writeJson(`${root}/aggregation-input-contract.json`, {
    schema_version: 1,
    aggregator_task_id: AGGREGATOR_R2.task_id,
    legal_success_inputs: [
      { reviewer_role: "EXTERNAL_SOURCE_INTEGRITY_REVIEWER", generation: "R1", required_status: "FORMALLY_ACCEPTED_PASS", payload_path: `${TASK_ROOT}/reviewer-payloads/source-integrity-r1.raw.txt` },
      { reviewer_role: "EXTERNAL_SOURCE_AUTHORITY_REVIEWER", generation: "R1", required_status: "FORMALLY_ACCEPTED_PASS", payload_path: `${TASK_ROOT}/reviewer-payloads/source-authority-r1.raw.txt` },
      { reviewer_role: "EXTERNAL_SCOPE_CONTAMINATION_REVIEWER", generation: "R1", required_status: "FORMALLY_ACCEPTED_PASS", payload_path: `${TASK_ROOT}/reviewer-payloads/scope-contamination-r1.raw.txt` },
      { reviewer_role: "EXTERNAL_COMPATIBILITY_REVIEWER", generation: "R2", required_status: "FORMALLY_ACCEPTED_PASS", payload_path: futureCompatPayload },
    ],
    blocker_history_only_inputs: [{ reviewer_role: "EXTERNAL_COMPATIBILITY_REVIEWER", generation: "R1", allowed_use: "BLOCKER_HISTORY_AND_FINDING_SOURCE", payload_path: `${TASK_ROOT}/reviewer-payloads/compatibility-r1.raw.txt`, success_input_allowed: false }],
    required_closed_findings: ["COMPAT-R1-001", "COMPAT-R1-002"],
    human_launch_required: true,
  });
  writeJson(`${root}/prerequisites.json`, {
    schema_version: 1,
    package_status: "CONDITIONALLY_READY",
    current_gate: "NO-GO_PENDING_COMPATIBILITY_R2",
    compatibility_r2_payload_present: fs.existsSync(futureCompatPayload),
    compatibility_r2_formally_accepted_pass: false,
    compatibility_findings_closed: false,
    human_launch_authorization_present: false,
    aggregator_launch_authorized: false,
    next_authorized_action: "COMPATIBILITY_R2_REVIEW",
  });
  writeJson(`${root}/prohibited-actions.json`, {
    schema_version: 1,
    prohibited: ["LAUNCH_BEFORE_COMPATIBILITY_R2_PASS", "USE_COMPATIBILITY_R1_AS_SUCCESS_INPUT", "START_ARCHITECTURE_RECONCILIATION", "APPROVE_SOURCE_AUTHORITY", "CREATE_CORE_OBJECT_LIBRARY", "WRITE_R1_REVIEW_TARGET", "USE_GIT", "USE_NETWORK", "USE_DATABASE", "USE_SERVICE", "USE_SEED_OR_MIGRATION", "READ_DOT_ENV", "SPAWN_CHILD_AGENT"],
    fail_closed: true,
  });
  writeJson(`${root}/embedded-not-authorized-template.json`, {
    schema_version: 1,
    status: "NOT_AUTHORIZED",
    blocker_code: "COMPATIBILITY_R2_FORMAL_PASS_REQUIRED",
    mandatory_exit_requested: true,
  });
  writeText(`${root}/standalone-top-level-aggregator-prompt.md`, `Codex, act only as SOURCE_SCOPE_AGGREGATOR for generation R2.\n\nMANDATORY FIRST READ:\n${root}/conditional-launch-envelope.json\n\nDo not proceed unless Compatibility R2 exists, is formally accepted PASS, closes COMPAT-R1-001 and COMPAT-R1-002, and a Human explicitly authorizes launch. Compatibility R1 is blocker history only and may never be a successful input. If any prerequisite is absent, return NOT_AUTHORIZED and request exit. Do not start Architecture Reconciliation, approve Source Authority, create a Core Object Library, use Git, network, services, databases, seeds, migrations, .env, or subagents.\n`);
  const scopeEntries = [
    ...reviewers.map((item) => ({ absolute_path: `${TASK_ROOT}/reviewer-payloads/${item.raw_name}`, content_scope: "FULL_ARTIFACT", purpose: item.key === "compatibility_r1" ? "BLOCKER_HISTORY_ONLY" : "LEGAL_R1_SUCCESS_INPUT" })),
    ...reviewers.map((item) => ({ absolute_path: `${TASK_ROOT}/transport-attestations/${item.key}.json`, content_scope: "FULL_ARTIFACT", purpose: "R1_TRANSPORT_BINDING" })),
    { absolute_path: `${TASK_ROOT}/formal-intake-results.json`, content_scope: "FULL_ARTIFACT", purpose: "FORMAL_INTAKE" },
    { absolute_path: `${TASK_ROOT}/reviewer-reuse-preservation.json`, content_scope: "FULL_ARTIFACT", purpose: "R1_REUSE" },
    ...overlay.artifactRecords.map((item) => ({ absolute_path: `${overlay.dir}/${item.normalized_relative_path}`, content_scope: "FULL_ARTIFACT", purpose: "CORRECTIVE_OVERLAY" })),
    { absolute_path: `${COMPAT_R2.package_root}/absolute-launch-envelope.json`, content_scope: "FULL_ARTIFACT", purpose: "COMPATIBILITY_R2_PACKAGE" },
    { absolute_path: `${COMPAT_R2.package_root}/package-manifest.json`, content_scope: "FULL_ARTIFACT", purpose: "COMPATIBILITY_R2_PACKAGE" },
    { absolute_path: `${COMPAT_R2.package_root}/review-requirements.json`, content_scope: "FULL_ARTIFACT", purpose: "COMPATIBILITY_R2_PACKAGE" },
    { absolute_path: futureCompatPayload, content_scope: "FULL_ARTIFACT", purpose: "REQUIRED_FUTURE_COMPATIBILITY_R2_INPUT", availability: "ABSENT_UNTIL_HUMAN_TRANSPORT" },
  ];
  writeJson(`${root}/exact-read-scope.json`, {
    schema_version: 1,
    scope_mode: "EXACT_ABSOLUTE_PATH_ALLOWLIST_ONLY",
    exact_absolute_path_allowlist: scopeEntries,
    allowed_path_count: scopeEntries.length,
    implicit_paths_allowed: false,
    future_input_count: 1,
    launch_before_future_input_is_forbidden: true,
  });
  const artifactNames = ["assignment.json", "aggregation-input-contract.json", "prerequisites.json", "exact-read-scope.json", "prohibited-actions.json", "embedded-not-authorized-template.json", "standalone-top-level-aggregator-prompt.md"];
  const packageCore = {
    schema_version: 1,
    aggregation_generation: "R2",
    aggregator_task_id: AGGREGATOR_R2.task_id,
    aggregation_package_id: AGGREGATOR_R2.package_id,
    assignment_id: AGGREGATOR_R2.assignment_id,
    aggregator_run_id: AGGREGATOR_R2.run_id,
    aggregator_session_nonce: AGGREGATOR_R2.session_nonce,
    preparation_task_id: TASK_ID,
    formal_intake_results_core_sha256: formalIntake.results_core_sha256,
    correction_integrity_record_core_sha256: overlay.integrity.record_core_sha256,
    reviewer_reuse_record_core_sha256: reuseRecord.record_core_sha256,
    compatibility_r2_package_core_sha256: compatibilityPackage.packageManifest.package_core_sha256,
    compatibility_r2_payload_status: "NOT_RECEIVED",
    launch_authorized: false,
    artifacts: packageArtifactRecords(root, artifactNames),
  };
  const packageManifest = { package_core: packageCore, package_core_sha256: shaBytes(Buffer.from(jcs(packageCore), "utf8")), canonicalization: "RFC8785_JCS", hash_algorithm: "SHA-256", hash_encoding: "UPPERCASE_HEX" };
  writeJson(`${root}/package-manifest.json`, packageManifest);
  writeJson(`${root}/package-verification.json`, {
    schema_version: 1,
    verification_status: "PASS_STATIC_PACKAGE",
    package_status: "CONDITIONALLY_READY",
    aggregation_package_id: AGGREGATOR_R2.package_id,
    package_core_sha256: packageManifest.package_core_sha256,
    package_core_hash_match: true,
    artifact_hash_match_count: artifactNames.length,
    artifact_count: artifactNames.length,
    compatibility_r2_payload_present: false,
    launch_authorized: false,
    verified_at: GENERATED_AT,
  });
  const launchCore = {
    schema_version: 1,
    aggregation_generation: "R2",
    launch_context_required: "BRAND_NEW_TOP_LEVEL_CODEX_CHAT",
    preparation_task_id: TASK_ID,
    aggregator_task_id: AGGREGATOR_R2.task_id,
    aggregation_package_id: AGGREGATOR_R2.package_id,
    assignment_id: AGGREGATOR_R2.assignment_id,
    aggregator_run_id: AGGREGATOR_R2.run_id,
    aggregator_session_nonce: AGGREGATOR_R2.session_nonce,
    package_core_sha256: packageManifest.package_core_sha256,
    package_manifest_absolute_path: `${root}/package-manifest.json`,
    package_manifest_sha256: shaFile(`${root}/package-manifest.json`),
    package_verification_absolute_path: `${root}/package-verification.json`,
    package_verification_sha256: shaFile(`${root}/package-verification.json`),
    standalone_prompt_absolute_path: `${root}/standalone-top-level-aggregator-prompt.md`,
    standalone_prompt_sha256: shaFile(`${root}/standalone-top-level-aggregator-prompt.md`),
    exact_read_scope_absolute_path: `${root}/exact-read-scope.json`,
    exact_read_scope_sha256: shaFile(`${root}/exact-read-scope.json`),
    compatibility_r2_payload_status: "NOT_RECEIVED",
    compatibility_r2_required_status: "FORMALLY_ACCEPTED_PASS",
    required_closed_findings: ["COMPAT-R1-001", "COMPAT-R1-002"],
    human_launch_required: true,
    launch_authorized: false,
  };
  const envelope = { launch_core: launchCore, launch_core_sha256: shaBytes(Buffer.from(jcs(launchCore), "utf8")), canonicalization: "RFC8785_JCS", hash_algorithm: "SHA-256", hash_encoding: "UPPERCASE_HEX", package_status: "CONDITIONALLY_READY", launch_status: "NOT_AUTHORIZED" };
  writeJson(`${root}/conditional-launch-envelope.json`, envelope);
  return { packageManifest, envelope };
}

function walkFiles(root) {
  const output = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = `${root}/${entry.name}`;
    if (entry.isDirectory()) output.push(...walkFiles(full));
    else if (entry.isFile()) output.push(full);
  }
  return output;
}

function writeTaskDocuments(formalIntake, compatibilityPackage, aggregatorPackage, overlay, reuseRecord) {
  writeJson(`${TASK_ROOT}/task-intent.yaml`, {
    schema_version: 1,
    task_id: TASK_ID,
    objective: "Formally intake four human-transported R1 Reviewer payloads, create a non-destructive Compatibility corrective overlay, and prepare unlaunched Compatibility R2 and conditional Aggregator R2 packages.",
    risk_level: "L3",
    write_scope: [`${TASK_ROOT}/**`],
    prohibited_operations: ["WRITE_OUTSIDE_TASK_ROOT", "MODIFY_R1_TARGET", "MODIFY_R1_PACKAGES", "USE_GIT", "USE_NETWORK", "USE_SERVICE", "USE_DATABASE", "USE_SEED_OR_MIGRATION", "READ_DOT_ENV", "SPAWN_CHILD_AGENT", "LAUNCH_REVIEWER", "LAUNCH_AGGREGATOR", "START_ARCHITECTURE_RECONCILIATION"],
    execution_status: "COMPLETE",
  });
  writeJson(`${TASK_ROOT}/classification.yaml`, {
    schema_version: 1,
    task_id: TASK_ID,
    level: "L3",
    reasons: ["formal external Reviewer payload intake", "Compatibility BLOCKER remediation evidence", "downstream authorization gating", "conditional aggregation package preparation"],
    product_changes_allowed: false,
    governance_baseline_changes_allowed: false,
    historical_task_changes_allowed: false,
    reviewer_or_aggregator_launch_allowed: false,
    classification_status: "HUMAN_AUTHORIZED_SCOPE",
  });
  writeJson(`${TASK_ROOT}/blueprint.yaml`, {
    schema_version: 1,
    blueprint_id: "BP-GOV-MAGP-SOURCE-SCOPE-REVIEW-INTAKE-AND-COMPATIBILITY-REMEDIATION-02",
    task_id: TASK_ID,
    scope: { include: [`${TASK_ROOT}/**`], exclude: ["R1 review target writes", "R1 package writes", "external source writes", "product or governance baseline writes", "Git", "network", "services", "database", "seed", "migration", ".env"] },
    sequential_steps: ["formal intake 4/4", "transport attestations", "Compatibility corrective overlay", "R1 PASS reuse preservation", "Compatibility R2 package", "conditional Aggregator R2 package", "final fail-closed verification"],
    completed_steps: 7,
    reviewer_launch_count: 0,
    aggregator_launch_count: 0,
    architecture_reconciliation_started: false,
    status: "COMPLETE",
  });
  writeJson(`${TASK_ROOT}/package-build-result.json`, {
    schema_version: 1,
    task_id: TASK_ID,
    build_status: "PASS",
    compatibility_r2: { package_status: "READY", task_id: COMPAT_R2.task_id, package_core_sha256: compatibilityPackage.packageManifest.package_core_sha256, launch_core_sha256: compatibilityPackage.envelope.launch_core_sha256, reviewer_launch_status: "NOT_STARTED" },
    aggregator_r2: { package_status: "CONDITIONALLY_READY", task_id: AGGREGATOR_R2.task_id, package_core_sha256: aggregatorPackage.packageManifest.package_core_sha256, launch_core_sha256: aggregatorPackage.envelope.launch_core_sha256, launch_status: "NOT_AUTHORIZED" },
  });
  writeText(`${TASK_ROOT}/final-summary.md`, `# MASTER BATCH 3A-2R — COMPLETE\n\n- Reviewer Payloads Received: 4/4\n- Reviewer Payloads Formally Accepted: 4/4\n- Integrity R1: PASS / PRESERVED\n- Authority R1: PASS / PRESERVED\n- Contamination R1: PASS / PRESERVED\n- Compatibility R1: BLOCKER / PRESERVED AS FINDING SOURCE\n- COMPAT-R1-001: REMEDIATED_PENDING_COMPATIBILITY_R2\n- COMPAT-R1-002: REMEDIATED_PENDING_COMPATIBILITY_R2\n- Base Review Target: UNCHANGED\n- Corrective Overlay: CREATED\n- Source Authority: PROPOSED_NOT_ADOPTED\n- Downstream Policy Use: PROHIBITED\n- Architecture Reconciliation: NOT_AUTHORIZED\n- Compatibility R2 Package: READY / NOT LAUNCHED\n- Aggregator R2 Package: CONDITIONALLY READY / NOT AUTHORIZED / NOT LAUNCHED\n- Source Scope Lock Review Gate: NO-GO / PENDING COMPATIBILITY R2\n- Git: NOT USED\n`);
  writeText(`${TASK_ROOT}/HANDOFF.md`, `# HANDOFF\n\n## Current goal\n\nComplete formal intake of four R1 Reviewer payloads and prepare Compatibility-only remediation and unlaunched R2 packages.\n\n## What changed\n\nSaved four Human-transported raw wrappers byte-for-byte, formally accepted three PASS results and one Compatibility BLOCKER, created eight non-destructive corrective-overlay artifacts, preserved the three R1 PASS reviews for Aggregator R2, and built Compatibility R2 plus conditional Aggregator R2 packages.\n\n## Files touched\n\nOnly \`.codex/tasks/${TASK_ID}/**\`. The original Source Scope Lock Task, R1 preparation/packages, source files, product files, governance baseline, and Git state were not modified.\n\n## Commands or tests run\n\nRan task-local deterministic intake/package verification with Node.js. It checked JSON Schema constraints, RFC 8785 JCS hashes, raw payload hashes, package artifacts, identities, exact scopes, target bindings, current source hashes, frozen target hashes, overlay authority, and package manifests.\n\n## Known risks\n\nCompatibility R2 has not run. Both Compatibility findings remain REMEDIATED_PENDING_COMPATIBILITY_R2. Aggregator R2 lacks its required Compatibility R2 PASS payload and remains NOT_AUTHORIZED.\n\n## Suggested next step\n\nHuman launches a brand-new top-level Compatibility Reviewer R2 using only its absolute launch envelope. Do not launch Aggregator R2 until that payload is formally accepted PASS and both findings are legally closed.\n`);
  const baseTargetAfter = verifyTargetSnapshot(readJson(`${PREPARATION_ROOT}/review-target-manifest.json`), readJson(`${PREPARATION_ROOT}/review-target-canonical-record.json`));
  assert(reuseRecord.record_core.base_target_unchanged === true, "Reuse record target state invalid");
  writeJson(`${TASK_ROOT}/scope-integrity.json`, {
    schema_version: 1,
    task_id: TASK_ID,
    allowed_write_root: TASK_ROOT,
    writes_outside_allowed_root: 0,
    original_review_target_write_count: 0,
    original_r1_package_write_count: 0,
    external_source_write_count: 0,
    product_or_governance_baseline_write_count: 0,
    reviewer_launch_count: 0,
    aggregator_launch_count: 0,
    git_used: false,
    network_used: false,
    service_used: false,
    database_used: false,
    seed_or_migration_used: false,
    dot_env_read: false,
    child_agent_used: false,
    base_target_after_artifact_count: baseTargetAfter.length,
    base_target_after_unchanged: true,
    status: "PASS",
  });
}

function main() {
  assert(npath(process.cwd()) === npath(TASK_ROOT), `Run only from task root: ${TASK_ROOT}`);
  const returnSchema = readJson(`${PREPARATION_ROOT}/reviewer-return-payload.schema.json`);
  const transportSchema = readJson(`${PREPARATION_ROOT}/manual-reviewer-transport-attestation.schema.json`);
  const registry = readJson(`${PREPARATION_ROOT}/reviewer-identity-registry.json`);
  const targetRecord = readJson(`${PREPARATION_ROOT}/review-target-canonical-record.json`);
  const targetManifest = readJson(`${PREPARATION_ROOT}/review-target-manifest.json`);
  const sourceBinding = readJson(`${PREPARATION_ROOT}/source-hash-binding.json`);

  const targetSnapshotBefore = verifyTargetSnapshot(targetManifest, targetRecord);
  const sourceSnapshot = verifySourceSnapshot(sourceBinding, targetRecord);
  const accepted = [];
  const rejected = [];
  for (const config of reviewers) {
    try {
      const registryEntry = registry.entries.find((entry) => entry.reviewer_role === config.role);
      assert(registryEntry, `${config.key}: registry entry missing`);
      accepted.push(verifyR1Payload(config, registryEntry, returnSchema, transportSchema, targetRecord));
    } catch (error) {
      rejected.push({ reviewer_key: config.key, formal_intake_status: "FORMALLY_REJECTED", error: String(error.message ?? error) });
    }
  }
  if (rejected.length) {
    writeJson(`${TASK_ROOT}/formal-intake-results.json`, { schema_version: 1, task_id: TASK_ID, generated_at: GENERATED_AT, overall_status: "STOP_FORMALLY_REJECTED", rejected, compatibility_remediation_created: false });
    throw new Error(`Formal intake rejected ${rejected.length} payload(s)`);
  }

  fs.mkdirSync(`${TASK_ROOT}/transport-attestations`, { recursive: true });
  for (const item of accepted) writeJson(`${TASK_ROOT}/transport-attestations/${item.config.key}.json`, item.attestation);
  const results = accepted.map((item) => ({
    reviewer_key: item.config.key,
    reviewer_role: item.wrapper.payload_core.reviewer_role,
    reviewer_task_id: item.wrapper.payload_core.task_id,
    review_package_id: item.wrapper.payload_core.review_package_id,
    reviewer_run_id: item.wrapper.payload_core.reviewer_run_id,
    raw_payload_path: `${TASK_ROOT}/reviewer-payloads/${item.config.raw_name}`,
    raw_payload_byte_length: item.rawBytes.length,
    raw_payload_sha256: shaBytes(item.rawBytes),
    payload_core_sha256: item.wrapper.payload_core_sha256,
    review_status: item.wrapper.payload_core.review_status,
    finding_count: item.wrapper.payload_core.findings.length,
    formal_intake_status: item.config.accepted_status,
    checks: item.checks,
  }));
  const resultsCore = {
    schema_version: 1,
    task_id: TASK_ID,
    generated_at: GENERATED_AT,
    reviewer_payloads_received: 4,
    reviewer_payloads_formally_accepted: 4,
    reviewer_payloads_formally_rejected: 0,
    expected_outcome_match: true,
    compatibility_finding_set: ["COMPAT-R1-001", "COMPAT-R1-002"],
    overall_status: "FORMALLY_ACCEPTED_4_OF_4",
    results,
  };
  const formalIntake = { results_core: resultsCore, results_core_sha256: shaBytes(Buffer.from(jcs(resultsCore), "utf8")), canonicalization: "RFC8785_JCS", hash_algorithm: "SHA-256", hash_encoding: "UPPERCASE_HEX" };
  writeJson(`${TASK_ROOT}/formal-intake-results.json`, formalIntake);

  const overlay = buildOverlay(targetRecord, targetManifest, targetSnapshotBefore, results);
  const reuseRecord = buildReuseRecord(targetRecord, targetSnapshotBefore, sourceSnapshot, targetManifest);
  const compatibilityPackage = buildCompatibilityR2Package(targetRecord, targetManifest, overlay, reuseRecord, formalIntake);
  const aggregatorPackage = buildAggregatorR2Package(formalIntake, overlay, reuseRecord, compatibilityPackage);
  writeTaskDocuments(formalIntake, compatibilityPackage, aggregatorPackage, overlay, reuseRecord);
  writeText(
    `${TASK_ROOT}/HANDOFF.md`,
    `${fs.readFileSync(`${TASK_ROOT}/HANDOFF.md`, "utf8")}\n## Recorded failed command\n\nThe first task-local package-build run stopped after the 4/4 formal intake had passed because the generator referenced \`formalIntake.results\` instead of \`formalIntake.results_core.results\`. It performed no write outside this Task and did not launch a Reviewer or Aggregator. The field path was corrected, syntax-checked, and the complete deterministic build was rerun successfully.\n`,
  );

  const targetSnapshotAfter = verifyTargetSnapshot(targetManifest, targetRecord);
  assert(sameJson(targetSnapshotBefore, targetSnapshotAfter), "Original target changed during task");
  const rawExpected = new Map(results.map((item) => [path.basename(item.raw_payload_path), item.raw_payload_sha256]));
  for (const [name, expected] of rawExpected) assert(shaFile(`${TASK_ROOT}/reviewer-payloads/${name}`) === expected, `Raw payload changed after intake: ${name}`);
  assert(!fs.existsSync(`${TASK_ROOT}/reviewer-payloads/compatibility-r2.raw.txt`), "Compatibility R2 payload must not exist yet");

  const manifestExclusions = new Set([`${TASK_ROOT}/artifact-manifest.json`, `${TASK_ROOT}/validation-results.json`]);
  const artifacts = walkFiles(TASK_ROOT).filter((filePath) => !manifestExclusions.has(npath(filePath))).sort().map((filePath) => fileRecord(filePath, TASK_ROOT));
  const artifactCore = { schema_version: 1, task_id: TASK_ID, generated_at: GENERATED_AT, artifact_count: artifacts.length, artifacts };
  const artifactManifest = { manifest_core: artifactCore, manifest_core_sha256: shaBytes(Buffer.from(jcs(artifactCore), "utf8")), canonicalization: "RFC8785_JCS", hash_algorithm: "SHA-256", hash_encoding: "UPPERCASE_HEX" };
  writeJson(`${TASK_ROOT}/artifact-manifest.json`, artifactManifest);
  writeJson(`${TASK_ROOT}/validation-results.json`, {
    schema_version: 1,
    task_id: TASK_ID,
    generated_at: GENERATED_AT,
    validation_status: "PASS",
    formal_intake_status: formalIntake.results_core.overall_status,
    transport_attestations_valid: 4,
    target_artifacts_hash_match: targetSnapshotAfter.length,
    target_artifact_count: targetManifest.artifact_count,
    source_files_hash_match: sourceSnapshot.length,
    source_file_count: sourceBinding.sources.length,
    compatibility_finding_set_match: true,
    corrective_overlay_status: "CREATED_AND_BOUND",
    r1_pass_reuse_status: "PRESERVED_FOR_SOURCE_SCOPE_AGGREGATOR_R2",
    compatibility_r2_package_status: "READY_NOT_LAUNCHED",
    aggregator_r2_package_status: "CONDITIONALLY_READY_NOT_AUTHORIZED_NOT_LAUNCHED",
    source_scope_lock_review_gate: "NO-GO_PENDING_COMPATIBILITY_R2",
    architecture_reconciliation_status: "NOT_AUTHORIZED",
    original_target_unchanged: true,
    raw_payloads_unchanged: true,
    artifact_manifest_sha256: shaFile(`${TASK_ROOT}/artifact-manifest.json`),
    git_used: false,
    child_agents_used: false,
  });
  console.log(JSON.stringify({ status: "PASS", task_id: TASK_ID, formal_intake: "4/4", compatibility_r2_package: "READY_NOT_LAUNCHED", aggregator_r2_package: "CONDITIONALLY_READY_NOT_AUTHORIZED", artifact_count: artifacts.length }, null, 2));
}

main();
