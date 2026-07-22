# Production Scanner Test Results

The formal scanner production runner invokes `.codex/scripts/generate-bootstrap-scan-report.mjs` against an isolated copied candidate for every declared case. It does not substitute a test-only scanner helper.

Final observed result: 72/72 cases passed. Coverage includes all required text families, scanner report bindings, all five binary finding classes, all nine magic signatures, and matching safe-negative cases.
