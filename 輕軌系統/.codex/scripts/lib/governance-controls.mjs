// Deprecated compatibility surface. It contains no authority logic.
// Production code and Phase 1.5 tests import the focused governance modules.
export { canonical, sha256, canonicalSha256, createBootstrapWorkspaceCandidateRecord, validateBootstrapCandidateRecord } from "./governance/typed-proof.mjs";
export { computeEffectiveScope, patternsWithin, isPatternSubset, pathMatchesPattern, validatePathsAgainstEffectiveScope } from "./governance/scope-lattice.mjs";
export { validateUniqueArtifacts as validateArtifactIdentities, resolveUniqueArtifact, validateUniqueRequirements, resolveUniqueRequirement, resolveRequirementVerdict } from "./governance/identity-resolver.mjs";
export { validateFixtureReport } from "./governance/fixture-report.mjs";
