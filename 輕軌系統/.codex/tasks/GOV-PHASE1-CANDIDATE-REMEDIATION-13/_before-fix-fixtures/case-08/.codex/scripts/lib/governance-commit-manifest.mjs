import { readdir, lstat } from "node:fs/promises";
import path from "node:path";

const includedRoots = [
  "AGENTS.md", ".agents/skills", ".codex/agents", ".codex/blueprints/schemas", ".codex/checklists", ".codex/domain/index.yaml",
  ".codex/environment/agent-safe-profile.json", ".codex/governance", ".codex/meta-rules", ".codex/scripts", ".codex/tests", ".codex/workflows",
  ".codex/config.toml"
];

export const excludedGovernanceRecords = [
  { path: ".codex/tasks/GOV-PHASE1-L3-REVIEW-A/**", commit_inclusion: false, evidence_scope: "local_review_record", reason: "Archived Session A review record." },
  { path: ".codex/tasks/GOV-PHASE1-REMEDIATION-2/**", commit_inclusion: false, evidence_scope: "local_review_record", reason: "Archived Phase 1.2 remediation record." },
  { path: ".codex/tasks/GOV-PHASE1-L3-REVIEW-A2/**", commit_inclusion: false, evidence_scope: "local_review_record", reason: "Archived Session A2 review record." },
  { path: ".codex/tasks/GOV-PHASE1-REMEDIATION-3/**", commit_inclusion: false, evidence_scope: "local_review_record", reason: "Archived Phase 1.3 remediation record." },
  { path: ".codex/tasks/GOV-PHASE1-L3-REVIEW-A3/**", commit_inclusion: false, evidence_scope: "local_review_record", reason: "Archived Session A3 review record." },
  { path: ".codex/tasks/GOV-PHASE1-REMEDIATION-4/**", commit_inclusion: false, evidence_scope: "local_review_record", reason: "Phase 1.4 remediation record; excluded from the first governance commit candidate." },
  { path: ".codex/tasks/GOV-PHASE1-L3-REVIEW-A4/**", commit_inclusion: false, evidence_scope: "local_review_record", reason: "Archived Session A4 review record." },
  { path: ".codex/tasks/GOV-PHASE1-A4-FINDING-CONSOLIDATION/**", commit_inclusion: false, evidence_scope: "local_review_record", reason: "A4 read-only finding consolidation record." },
  { path: ".codex/tasks/GOV-PHASE1-REMEDIATION-5/**", commit_inclusion: false, evidence_scope: "local_review_record", reason: "Phase 1.5 implementation and self-validation record; not a runtime governance control." },
  { path: ".codex/tasks/GOV-PHASE1-L3-REVIEW-A5/**", commit_inclusion: false, evidence_scope: "local_review_record", reason: "Archived Session A5 review record with preserved BLOCKER outcomes." },
  { path: ".codex/tasks/GOV-PHASE1-A5-BOOTSTRAP-TRUST-ANALYSIS/**", commit_inclusion: false, evidence_scope: "local_review_record", reason: "Read-only A5 bootstrap trust analysis; not an executable governance control." },
  { path: ".codex/tasks/GOV-PHASE1-REMEDIATION-6/**", commit_inclusion: false, evidence_scope: "local_review_record", reason: "Phase 1.6 implementation and self-validation record; excluded from the bootstrap control set." },
  { path: ".codex/tasks/GOV-PHASE1-L3-REVIEW-A6/**", commit_inclusion: false, evidence_scope: "local_review_record", reason: "Archived Session A6 review record with preserved BLOCKER outcomes." },
  { path: ".codex/tasks/GOV-PHASE1-REMEDIATION-7/**", commit_inclusion: false, evidence_scope: "local_review_record", reason: "Phase 1.7 implementation and self-validation record; excluded from the bootstrap control set." },
  { path: ".codex/tasks/GOV-PHASE1-L3-REVIEW-A7/**", commit_inclusion: false, evidence_scope: "local_review_record", reason: "Archived Session A7 review record with preserved BLOCKER outcomes." },
  { path: ".codex/tasks/GOV-PHASE1-REMEDIATION-8/**", commit_inclusion: false, evidence_scope: "local_review_record", reason: "Phase 1.8 implementation and self-validation record; excluded from the bootstrap control set." },
  { path: ".codex/tasks/GOV-PHASE1-L3-REVIEW-A8/**", commit_inclusion: false, evidence_scope: "local_review_record", reason: "Archived Session A8 review record with preserved Reviewer outcomes." },
  { path: ".codex/tasks/GOV-PHASE1-REMEDIATION-9/**", commit_inclusion: false, evidence_scope: "local_review_record", reason: "Phase 1.9 implementation and self-validation record; excluded from the bootstrap control set." },
  { path: ".codex/tasks/GOV-M320-DRYRUN/**", commit_inclusion: false, evidence_scope: "local_review_record", reason: "Migration 320 governance dry-run and historical evidence record; not a Phase 1 runtime control." },
  { path: "docs/migration-320-*", commit_inclusion: false, evidence_scope: "external_reference", reason: "Hash-bound external evidence, not included in governance-only commit." },
  { path: "docs/cross-module-closure-report.md", commit_inclusion: false, evidence_scope: "external_reference", reason: "Hash-bound external evidence, not included in governance-only commit." },
  { path: "docs/go-no-go-report.md", commit_inclusion: false, evidence_scope: "external_reference", reason: "Hash-bound external evidence, not included in governance-only commit." }
];

async function walk(root, ref, output) {
  const absolute = path.join(root, ...ref.split("/"));
  const info = await lstat(absolute);
  if (info.isSymbolicLink()) throw new Error(`Governance manifest refuses link or reparse path: ${ref}`);
  if (info.isFile()) {
    if (ref !== ".codex/governance/governance-commit-manifest.yaml" && !ref.startsWith(".codex/tests/.tmp/")) output.push(ref);
    return;
  }
  if (!info.isDirectory()) throw new Error(`Unsupported governance object: ${ref}`);
  for (const entry of (await readdir(absolute)).sort()) await walk(root, `${ref}/${entry}`, output);
}

export async function collectGovernanceCommitRefs(root) {
  const refs = [];
  for (const ref of includedRoots) await walk(root, ref, refs);
  return [...new Set(refs)].sort();
}
