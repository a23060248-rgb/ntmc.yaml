// Compatibility import surface only. All scanner behavior lives in the single
// Phase 1.5 production pipeline; no scanner logic may be added here.
export {
  SCAN_CONTRACT as scanContract,
  assertTextArtifact,
  canonicalizeScannerInput,
  scanCanonicalContent,
  scanText,
  classifyOperationalContent,
  scanBinaryContent,
  validateDeclaredScanContract,
  declaredFindingClasses
} from "./governance/scanner-pipeline.mjs";
