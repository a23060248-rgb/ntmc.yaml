import { readFile } from "node:fs/promises";
import { safeExistingPath } from "../path-safety.mjs";
import { sha256 } from "./typed-proof.mjs";

export const RAILWAY_REVIEWER_ROLE = "railway-domain-reviewer";
export const RAILWAY_REVIEWER_PROFILE_REF = ".codex/agents/railway-domain-reviewer.toml";
export const RAILWAY_REVIEW_SCOPE = "bootstrap_rule_governance_mechanism";
export const REVIEWER_IDENTITY_ASSURANCE = "procedural_role_and_assignment_binding";

function stringField(text, name) {
  const match = text.match(new RegExp(`^${name}\\s*=\\s*"([^"]+)"\\s*$`, "m"));
  return match?.[1] ?? null;
}

function booleanField(text, name) {
  const match = text.match(new RegExp(`^${name}\\s*=\\s*(true|false)\\s*$`, "m"));
  return match ? match[1] === "true" : null;
}

function stringArrayField(text, name) {
  const match = text.match(new RegExp(`^${name}\\s*=\\s*(\\[[^\\r\\n]*\\])\\s*$`, "m"));
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]);
    return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
  } catch {
    return null;
  }
}

export function parseReviewerProfile(text) {
  return Object.freeze({
    name: stringField(text, "name"),
    canonical_role_id: stringField(text, "canonical_role_id"),
    sandbox_mode: stringField(text, "sandbox_mode"),
    execution_mode: stringField(text, "execution_mode"),
    implementation_participation: booleanField(text, "implementation_participation"),
    formal_review_scope: stringField(text, "formal_review_scope"),
    allowed_read_paths: stringArrayField(text, "allowed_read_paths"),
    allowed_write_paths: stringArrayField(text, "allowed_write_paths"),
    reviewer_identity_assurance: stringField(text, "reviewer_identity_assurance")
  });
}

export async function loadCanonicalRailwayReviewerProfile(projectRoot) {
  const bytes = await readFile(await safeExistingPath(projectRoot, RAILWAY_REVIEWER_PROFILE_REF));
  return Object.freeze({ref: RAILWAY_REVIEWER_PROFILE_REF, sha256: sha256(bytes), profile: parseReviewerProfile(bytes.toString("utf8"))});
}

export async function validateFormalRailwayReviewerBinding({projectRoot, review, blueprint, handoff, governanceManifest}) {
  const violations = [];
  const binding = review?.reviewer_binding;
  const assignments = blueprint?.review_assignments;
  if (!review?.formal) return ["formal typed Railway review must set formal=true."];
  if (review.reviewer !== RAILWAY_REVIEWER_ROLE) violations.push(`reviewer must equal canonical role ${RAILWAY_REVIEWER_ROLE}.`);
  if (review.review_scope !== RAILWAY_REVIEW_SCOPE) violations.push(`review scope must equal ${RAILWAY_REVIEW_SCOPE}.`);
  if (review.did_not_participate_in_implementation !== true) violations.push("did_not_participate_in_implementation must be true.");
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) return [...violations, "reviewer_binding is required for a formal typed Railway review."];

  if (binding.canonical_role_id !== RAILWAY_REVIEWER_ROLE) violations.push(`binding canonical_role_id must equal ${RAILWAY_REVIEWER_ROLE}.`);
  if (binding.agent_profile_reference !== RAILWAY_REVIEWER_PROFILE_REF) violations.push(`binding agent_profile_reference must equal ${RAILWAY_REVIEWER_PROFILE_REF}.`);
  if (binding.reviewer_run_id !== review.reviewer_run_id) violations.push("binding reviewer_run_id must equal the outer review reviewer_run_id.");
  if (binding.session_id !== review.session_id) violations.push("binding session_id must equal the outer review session_id.");
  if (binding.formal !== true) violations.push("binding formal must be true.");
  if (binding.execution_mode !== "read-only") violations.push("binding execution_mode must be read-only.");
  if (binding.implementation_participation !== false) violations.push("binding implementation_participation must be false.");
  if (binding.reviewer_identity_assurance !== REVIEWER_IDENTITY_ASSURANCE) violations.push(`binding assurance must equal ${REVIEWER_IDENTITY_ASSURANCE}.`);
  if (!review.reviewer_run_id || !review.session_id) violations.push("outer review run and session identities are required.");
  if (review.session_id && review.session_id === handoff?.agent_session_ref) violations.push("reviewer session must differ from the implementer session.");

  if (!Array.isArray(assignments)) return [...violations, "blueprint review_assignments is required for a formal typed Railway review."];
  const assignmentIds = assignments.map((item) => item?.assignment_id);
  for (const assignmentId of new Set(assignmentIds)) {
    const count = assignmentIds.filter((item) => item === assignmentId).length;
    if (!assignmentId || count !== 1) violations.push(`assignment_id ${assignmentId ?? "<missing>"} must resolve exactly once.`);
  }
  const roleAssignments = assignments.filter((item) => item?.required_role_id === RAILWAY_REVIEWER_ROLE);
  if (roleAssignments.length !== 1) violations.push(`canonical Railway role must resolve to exactly one review assignment; resolved ${roleAssignments.length}.`);
  const matching = assignments.filter((item) => item?.assignment_id === binding.task_assignment_id);
  if (matching.length !== 1) return [...violations, `binding task_assignment_id must resolve exactly once; resolved ${matching.length}.`];
  const assignment = matching[0];
  if (assignment.required_role_id !== RAILWAY_REVIEWER_ROLE) violations.push(`assignment required_role_id must equal ${RAILWAY_REVIEWER_ROLE}.`);
  if (assignment.agent_profile_reference !== RAILWAY_REVIEWER_PROFILE_REF) violations.push(`assignment agent_profile_reference must equal ${RAILWAY_REVIEWER_PROFILE_REF}.`);
  if (assignment.required_review_scope !== RAILWAY_REVIEW_SCOPE || assignment.required_review_scope !== review.review_scope) violations.push("assignment required_review_scope must equal the formal Railway review scope.");
  if (assignment.execution_mode !== "read-only") violations.push("assignment execution_mode must be read-only.");
  if (assignment.implementation_participation !== false) violations.push("assignment implementation_participation must be false.");
  if (!Array.isArray(assignment.allowed_read_paths) || !assignment.allowed_read_paths.length) violations.push("assignment allowed_read_paths must be non-empty.");
  if (!Array.isArray(assignment.allowed_write_paths) || assignment.allowed_write_paths.length !== 0) violations.push("assignment allowed_write_paths must be exactly empty.");

  let canonical;
  try { canonical = await loadCanonicalRailwayReviewerProfile(projectRoot); }
  catch (error) { return [...violations, `canonical reviewer profile is unavailable: ${error.message}`]; }
  const profile = canonical.profile;
  if (profile.name !== RAILWAY_REVIEWER_ROLE || profile.canonical_role_id !== RAILWAY_REVIEWER_ROLE) violations.push("canonical reviewer profile name and canonical_role_id must equal the required Railway role.");
  if (profile.sandbox_mode !== "read-only" || profile.execution_mode !== "read-only") violations.push("canonical reviewer profile must be read-only.");
  if (profile.implementation_participation !== false) violations.push("canonical reviewer profile must prohibit implementation participation.");
  if (profile.formal_review_scope !== RAILWAY_REVIEW_SCOPE) violations.push("canonical reviewer profile formal_review_scope mismatch.");
  if (!Array.isArray(profile.allowed_read_paths) || !profile.allowed_read_paths.length) violations.push("canonical reviewer profile allowed_read_paths must be non-empty.");
  if (!Array.isArray(profile.allowed_write_paths) || profile.allowed_write_paths.length !== 0) violations.push("canonical reviewer profile allowed_write_paths must be exactly empty.");
  if (profile.reviewer_identity_assurance !== REVIEWER_IDENTITY_ASSURANCE) violations.push("canonical reviewer profile assurance claim is invalid or overbroad.");
  if (binding.agent_profile_sha256 !== canonical.sha256) violations.push("binding agent_profile_sha256 does not match the canonical reviewer profile bytes.");
  if (assignment.agent_profile_sha256 !== canonical.sha256) violations.push("assignment agent_profile_sha256 does not match the canonical reviewer profile bytes.");

  const profileArtifacts = (governanceManifest?.artifacts ?? []).filter((item) => item.path === RAILWAY_REVIEWER_PROFILE_REF);
  if (profileArtifacts.length !== 1) violations.push(`candidate manifest must include the canonical reviewer profile exactly once; resolved ${profileArtifacts.length}.`);
  else if (profileArtifacts[0].sha256?.toUpperCase() !== canonical.sha256) violations.push("candidate manifest canonical reviewer profile hash mismatch.");
  return violations;
}
