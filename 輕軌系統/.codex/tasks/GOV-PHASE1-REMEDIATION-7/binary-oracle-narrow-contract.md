# Binary Oracle Narrow Contract

The Phase 1 binary scanner exposes exactly five finding classes:

- `DISALLOWED_FILE_EXTENSION`
- `NUL_BYTE_DETECTED`
- `KNOWN_BINARY_MAGIC_DETECTED`
- `NON_UTF8_TEXT`
- `BINARY_CONTENT_RATIO_EXCEEDED`

Known magic signatures are MZ, ELF, ZIP, PDF, SQLite, PGDMP, OLE, PNG, and JPEG. Each signature has a formal production positive and safe-negative case.

No extension/magic mismatch control is claimed. Binary detection is a narrow deterministic content oracle, not malware analysis, DLP, repository-global scanning, or operating-system isolation.
