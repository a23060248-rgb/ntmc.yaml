import path from "node:path";

export const SCAN_CONTRACT = Object.freeze({ id: "GOV-DETERMINISTIC-SCAN", version: 5, maxUrlDecodePasses: 2, maximumExpansionRatio: 4, entropyMinimumLength: 32, entropyMaximumLength: 128, entropyMinimumBits: 4.2 });
export const CANDIDATE_TEXT_EXTENSIONS = Object.freeze([".md", ".yaml", ".yml", ".json", ".toml", ".mjs", ".js"]);
export const BINARY_FINDING_CLASSES = Object.freeze(["DISALLOWED_FILE_EXTENSION", "NUL_BYTE_DETECTED", "KNOWN_BINARY_MAGIC_DETECTED", "NON_UTF8_TEXT", "BINARY_CONTENT_RATIO_EXCEEDED"]);
export const EXPECTED_BINARY_MAGIC_IDS = Object.freeze(["MZ", "ELF", "ZIP", "PDF", "SQLite", "PGDMP", "OLE", "PNG", "JPEG"]);

const taskTextExtensions = new Set([...CANDIDATE_TEXT_EXTENSIONS, ".txt", ".csv"]);
const candidateTextExtensions = new Set(CANDIDATE_TEXT_EXTENSIONS);
const uriSchemes = "postgres|postgresql|mysql|mongodb|mongodb\\+srv|redis|rediss|amqp|amqps|https?|ftp|sftp|ssh";
const textClasses = ["PRIVATE_KEY", "CREDENTIAL_URI", "BEARER_TOKEN", "BASIC_AUTH", "COOKIE_HEADER", "SESSION_COOKIE", "JWT", "KNOWN_TOKEN", "SECRET_VALUE", "CREDENTIAL_FILE", "HIGH_ENTROPY_OPAQUE_VALUE", "MALFORMED_PERCENT_ENCODING"];
const operationalClasses = ["WINDOWS_ABSOLUTE_PATH", "UNC_PATH", "FILE_URI", "UNIX_LOCAL_PATH", "HOME_EXPANSION", "DUMP_REFERENCE"];
export const IMPLEMENTED_FINDING_CLASSES = Object.freeze([...textClasses, ...operationalClasses, ...BINARY_FINDING_CLASSES, "MANIFEST_HASH_MISMATCH"].sort());

const textPatterns = [
  ["PRIVATE_KEY", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i],
  ["CREDENTIAL_URI", new RegExp(`\\b(?:${uriSchemes}):\\/\\/[^\\s/:@]+:[^\\s@/]+@`, "i")],
  ["BEARER_TOKEN", /["']?Authorization["']?\s*:\s*["']?Bearer\s+[A-Za-z0-9._~+\/-]{12,}={0,2}/i],
  ["BASIC_AUTH", /["']?Authorization["']?\s*:\s*["']?Basic\s+[A-Za-z0-9+\/_-]{8,}={0,2}/i],
  ["COOKIE_HEADER", /["']?(?:Cookie|Set-Cookie)["']?\s*:\s*["']?[^\r\n]*(?:session|sessionid|connect\.sid|jwt|access_token|refresh_token|token|auth)[A-Za-z0-9._-]*\s*=\s*["']?[^;\s,"')]{12,}/i],
  ["SESSION_COOKIE", /\b(?:session|sessionid|connect\.sid|jwt|access_token|refresh_token)\s*[=:]\s*["']?[A-Za-z0-9._~+\/-]{12,}/i],
  ["JWT", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/],
  ["KNOWN_TOKEN", /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{25,}|xox[baprs]-[A-Za-z0-9-]{16,})\b/],
  ["SECRET_VALUE", /\b(?:password|passwd|token|secret|credential)\b\s*[=:]\s*["']?(?!false\b|true\b|null\b|none\b|redacted\b|example\b|<[^>]+>)[^\s,"'}]{6,}/i],
  ["CREDENTIAL_FILE", /(?:^|["'\s])[^\s"']+\.(?:pem|pfx|p12|key|kdbx)(?:["'\s]|$)/i]
];

const operationalPatterns = [
  ["FILE_URI", /\bfile:\/{2,3}(?:[A-Za-z]:|\/)[^\s"')`]+/im],
  ["WINDOWS_ABSOLUTE_PATH", /(?:^|[\s"'(=])[A-Za-z]:(?:\\|\/)+(?!\.\.)(?:[^\s"')`]|\\ )+/im],
  ["UNC_PATH", /(?:^|[\s"'(])\\\\[A-Za-z0-9._$-]+\\[A-Za-z0-9._$-]+(?:\\[^\s"')`]+)?/m],
  ["UNIX_LOCAL_PATH", /(?:^|[\s"'(])\/(?:Users|home|var|tmp|opt|mnt|Volumes)\/[^\s"')`]+/m],
  ["HOME_EXPANSION", new RegExp("\\$\\{" + "HOME\\}|\\$" + "HOME|~" + "\\/[A-Za-z0-9._-]+")],
  ["DUMP_REFERENCE", /(?:^|[\s"'])[^\s"']+\.(?:dump|bak|backup|sql\.gz)(?:[\s"']|$)/im]
];

export function assertTextArtifact(ref, authority) {
  const extension = path.extname(ref).toLowerCase();
  if ([".dump", ".bak", ".backup", ".sql.gz"].some((suffix) => ref.toLowerCase().endsWith(suffix))) throw new Error(`Database dump or backup artifacts are forbidden: ${ref}`);
  if (!taskTextExtensions.has(extension) && authority !== "approved-binary") throw new Error(`Unapproved binary evidence is forbidden: ${ref}`);
}

export function assertCandidateTextArtifact(ref) {
  const extension = path.extname(ref).toLowerCase();
  if (!candidateTextExtensions.has(extension)) throw new Error(`Bootstrap governance candidate extension is not allowed: ${ref}`);
}

function decodeUtf8Fatal(input) {
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.isBuffer(input) ? input : Buffer.from(input));
}

function decodeJsonEscapesOnce(text) {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16))).replace(/\\(["\\/bfnrt])/g, (_match, code) => ({ '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" })[code]);
}

function decodePercentOnceTolerant(text) {
  let output = "", invalidSyntax = false, decodingError = false, sawValidSequence = false, changed = false;
  for (let index = 0; index < text.length;) {
    if (text[index] !== "%") { output += text[index++]; continue; }
    if (!/^[0-9A-Fa-f]{2}$/.test(text.slice(index + 1, index + 3))) { invalidSyntax = true; output += "%"; index += 1; continue; }
    const bytes = [];
    while (text[index] === "%" && /^[0-9A-Fa-f]{2}$/.test(text.slice(index + 1, index + 3))) { bytes.push(Number.parseInt(text.slice(index + 1, index + 3), 16)); sawValidSequence = true; index += 3; }
    let decoded;
    try { decoded = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes)); }
    catch { decoded = Buffer.from(bytes).toString("utf8"); decodingError = true; }
    output += decoded; changed = true;
  }
  return { text: changed ? output : text, malformed: decodingError || (invalidSyntax && sawValidSequence) };
}

export function canonicalizeScannerInput(input, options = {}) {
  const raw = Buffer.isBuffer(input) ? decodeUtf8Fatal(input) : String(input);
  const maxPasses = options.maxUrlDecodePasses ?? SCAN_CONTRACT.maxUrlDecodePasses;
  const maxLength = Math.max(raw.length * SCAN_CONTRACT.maximumExpansionRatio, raw.length + 64);
  const views = [], issues = [], seen = new Set();
  const add = (text, transformations) => { if (text.length > maxLength) throw new Error("SCANNER_CANONICALIZATION expansion limit exceeded"); if (!seen.has(text)) { seen.add(text); views.push({ text, transformations }); } };
  add(raw, ["raw-text"]);
  add(decodeJsonEscapesOnce(raw), ["raw-text", "json-unescape-once"]);
  for (const base of [...views]) {
    let value = base.text;
    for (let round = 1; round <= maxPasses; round += 1) {
      const decoded = decodePercentOnceTolerant(value);
      if (decoded.malformed) issues.push({ finding_class: "MALFORMED_PERCENT_ENCODING", transformations: [...base.transformations, `url-decode-${round}`] });
      if (decoded.text === value) break;
      add(decoded.text, [...base.transformations, `url-decode-${round}`]); value = decoded.text;
    }
  }
  return { raw_length: raw.length, views, issues };
}

function entropy(value) {
  const counts = new Map();
  for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
  return -[...counts.values()].reduce((sum, count) => { const probability = count / value.length; return sum + probability * Math.log2(probability); }, 0);
}
const finding = (findingClass, ref, view, start = null, detail = null) => ({ finding_class: findingClass, ref, transformations: view.transformations, location: start === null ? null : { canonical_offset: start }, ...(detail ? { detail } : {}) });

export function scanCanonicalContent(canonical, ref) {
  const findings = [];
  for (const issue of canonical.issues ?? []) findings.push(finding(issue.finding_class, ref, { transformations: issue.transformations }));
  for (const view of canonical.views) {
    for (const [findingClass, expression] of textPatterns) { const match = view.text.match(expression); if (match) findings.push(finding(findingClass, ref, view, match.index)); }
    const entropyPattern = new RegExp(`[A-Za-z0-9_-]{${SCAN_CONTRACT.entropyMinimumLength},${SCAN_CONTRACT.entropyMaximumLength}}`, "g");
    for (const match of view.text.matchAll(entropyPattern)) {
      const candidate = match[0];
      if (/^[A-Fa-f0-9]{64}$/.test(candidate) || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(candidate) || /^[A-Z][A-Z0-9_-]{2,20}-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)) continue;
      if (!/[a-z]/.test(candidate) || !/[A-Z]/.test(candidate) || !/\d/.test(candidate)) continue;
      if (entropy(candidate) >= SCAN_CONTRACT.entropyMinimumBits) findings.push(finding("HIGH_ENTROPY_OPAQUE_VALUE", ref, view, match.index));
    }
  }
  const unique = new Map();
  for (const item of findings) unique.set(`${item.finding_class}|${item.ref}`, item);
  return [...unique.values()];
}

export function scanText(text, ref) { return scanCanonicalContent(canonicalizeScannerInput(text), ref).map((item) => `${item.finding_class} in ${item.ref}`); }

export function classifyOperationalContent(text, ref) {
  const findings = [];
  for (const view of canonicalizeScannerInput(text).views) for (const [findingClass, expression] of operationalPatterns) if (expression.test(view.text)) findings.push(`${findingClass} in ${ref}`);
  return [...new Set(findings)];
}

function binaryMagicEntries(registry) {
  if (registry?.registry_id !== "GOV-BOOTSTRAP-BINARY-MAGIC" || registry?.registry_version !== 1 || !Array.isArray(registry.entries)) throw new Error("BINARY_MAGIC_REGISTRY is required by the production scanner.");
  return registry.entries;
}

export function scanBinaryContent(input, ref, binaryMagicRegistry) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const findings = [];
  if (buffer.includes(0)) findings.push(`NUL_BYTE_DETECTED in ${ref}`);
  for (const entry of binaryMagicEntries(binaryMagicRegistry)) {
    const signature = Buffer.from(entry.signature_bytes, "hex");
    if (buffer.subarray(entry.offset, entry.offset + signature.length).equals(signature)) findings.push(`KNOWN_BINARY_MAGIC_DETECTED in ${ref} magic=${entry.magic_id}`);
  }
  try { decodeUtf8Fatal(buffer); } catch { findings.push(`NON_UTF8_TEXT in ${ref}`); }
  if (buffer.length) {
    let controls = 0;
    for (const byte of buffer) if ((byte < 0x09 || (byte > 0x0D && byte < 0x20)) && byte !== 0x1B) controls += 1;
    if (controls / buffer.length > 0.02) findings.push(`BINARY_CONTENT_RATIO_EXCEEDED in ${ref}`);
  }
  return [...new Set(findings)];
}

export function scanCandidateArtifact(input, ref, binaryMagicRegistry) {
  const findings = [];
  try { assertCandidateTextArtifact(ref); } catch (error) { findings.push({ finding_class: "DISALLOWED_FILE_EXTENSION", ref, transformations: ["raw-bytes"], location: null, detail: error.message }); }
  for (const item of scanBinaryContent(input, ref, binaryMagicRegistry)) {
    const separator = item.indexOf(" in ");
    findings.push({ finding_class: item.slice(0, separator), ref, transformations: ["raw-bytes"], location: null, detail: item });
  }
  const nonUtf8 = findings.some((item) => item.finding_class === "NON_UTF8_TEXT");
  if (!nonUtf8) {
    const canonical = canonicalizeScannerInput(input);
    findings.push(...scanCanonicalContent(canonical, ref));
    for (const item of classifyOperationalContent(canonical.views[0]?.text ?? "", ref)) findings.push({ finding_class: item.slice(0, item.indexOf(" in ")), ref, transformations: ["raw-text"], location: null, detail: item });
  }
  const unique = new Map();
  for (const item of findings) unique.set(`${item.finding_class}|${item.ref}`, item);
  return [...unique.values()];
}

function equalArray(left, right) { return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => JSON.stringify(item) === JSON.stringify(right[index])); }

export function validateDeclaredScanContract(contract, { findingRegistry, canonicalizationConfig, binaryOracle, binaryMagicRegistry, implementationMatrix, productionCaseManifest } = {}) {
  const violations = [];
  if (contract?.scan_contract_id !== SCAN_CONTRACT.id || contract?.scan_contract_version !== SCAN_CONTRACT.version || contract?.assurance !== "INTERNAL_CONSISTENCY_ONLY") violations.push("SCAN_CONTRACT identity/version/assurance mismatch.");
  if (!equalArray(contract?.candidate_text_extensions, CANDIDATE_TEXT_EXTENSIONS)) violations.push("SCAN_CONTRACT candidate text extensions do not match implementation.");
  if (!equalArray([...(contract?.finding_classes ?? [])].sort(), IMPLEMENTED_FINDING_CLASSES)) violations.push("SCAN_CONTRACT finding classes do not exactly match production implementation.");
  if (findingRegistry && !equalArray([...(findingRegistry.finding_classes ?? [])].sort(), IMPLEMENTED_FINDING_CLASSES)) violations.push("SCAN_CONTRACT finding registry does not exactly match production implementation.");
  if (canonicalizationConfig) {
    const expected = { raw_text: true, utf8_fatal_decode: true, json_unescape_passes: 1, max_url_decode_passes: SCAN_CONTRACT.maxUrlDecodePasses, maximum_expansion_ratio: SCAN_CONTRACT.maximumExpansionRatio };
    for (const [field, value] of Object.entries(expected)) if (canonicalizationConfig[field] !== value) violations.push(`SCAN_CONTRACT canonicalization ${field} mismatch.`);
    const entropyConfig = canonicalizationConfig.entropy ?? {};
    if (entropyConfig.minimum_length !== SCAN_CONTRACT.entropyMinimumLength || entropyConfig.maximum_length !== SCAN_CONTRACT.entropyMaximumLength || entropyConfig.minimum_bits_per_character !== SCAN_CONTRACT.entropyMinimumBits) violations.push("SCAN_CONTRACT entropy bounds mismatch.");
  }
  if (binaryOracle) {
    if (!equalArray(binaryOracle.candidate_text_extensions, CANDIDATE_TEXT_EXTENSIONS)) violations.push("SCAN_CONTRACT binary oracle extension list mismatch.");
    if (!equalArray(binaryOracle.finding_classes, BINARY_FINDING_CLASSES)) violations.push("SCAN_CONTRACT binary finding classes mismatch.");
    if (binaryOracle.binary_magic_registry_ref !== ".codex/governance/bootstrap-binary-magic-registry.yaml" || Object.hasOwn(binaryOracle, "known_magic_signatures")) violations.push("SCAN_CONTRACT binary magic must be supplied only by the authoritative registry.");
    if (binaryOracle.binary_control_ratio_threshold !== 0.02) violations.push("SCAN_CONTRACT binary ratio threshold mismatch.");
  }
  if (contract?.binary_magic_registry_ref !== ".codex/governance/bootstrap-binary-magic-registry.yaml") violations.push("SCAN_CONTRACT binary magic registry reference mismatch.");
  if (binaryMagicRegistry) {
    const entries = binaryMagicRegistry.entries ?? [];
    const ids = entries.map((item) => item.magic_id);
    if (binaryMagicRegistry.registry_id !== "GOV-BOOTSTRAP-BINARY-MAGIC" || binaryMagicRegistry.registry_version !== 1 || binaryMagicRegistry.finding_class !== "KNOWN_BINARY_MAGIC_DETECTED") violations.push("SCAN_CONTRACT binary magic registry identity/version mismatch.");
    if (new Set(ids).size !== ids.length || !equalArray(ids, EXPECTED_BINARY_MAGIC_IDS)) violations.push("SCAN_CONTRACT binary magic registry must contain the exact ordered nine-magic set.");
    const productionCases = productionCaseManifest?.cases ?? [];
    const caseMap = new Map(productionCases.map((item) => [item[0], {finding_class: item[1], mode: item[2]}]));
    const fixtureIds = new Set();
    for (const entry of entries) {
      if (!/^(?:[A-F0-9]{2})+$/.test(entry.signature_bytes ?? "") || !Number.isInteger(entry.offset) || entry.offset < 0 || entry.finding_class !== "KNOWN_BINARY_MAGIC_DETECTED") violations.push(`SCAN_CONTRACT binary magic ${entry.magic_id ?? "<missing>"} signature/offset/class mismatch.`);
      for (const [field, mode] of [["positive_fixture_id", "positive"], ["safe_negative_fixture_id", "safe-negative"]]) {
        const fixtureId = entry[field];
        if (!fixtureId || fixtureIds.has(fixtureId)) violations.push(`SCAN_CONTRACT binary magic ${entry.magic_id ?? "<missing>"} has missing or duplicate ${field}.`);
        fixtureIds.add(fixtureId);
        const fixture = caseMap.get(fixtureId);
        if (!fixture || fixture.finding_class !== "KNOWN_BINARY_MAGIC_DETECTED" || fixture.mode !== mode) violations.push(`SCAN_CONTRACT binary magic ${entry.magic_id ?? "<missing>"} ${field} is not a dedicated formal ${mode} oracle.`);
      }
    }
  } else violations.push("SCAN_CONTRACT authoritative binary magic registry is missing.");
  if (implementationMatrix) {
    const rows = implementationMatrix.finding_classes ?? [];
    if (new Set(rows.map((row) => row[0])).size !== rows.length || !equalArray(rows.map((row) => row[0]).sort(), IMPLEMENTED_FINDING_CLASSES)) violations.push("SCAN_CONTRACT implementation matrix class set mismatch.");
    if (implementationMatrix.formal_invocation !== ".codex/scripts/generate-bootstrap-scan-report.mjs") violations.push("SCAN_CONTRACT formal scanner invocation mismatch.");
    const productionCases = (productionCaseManifest?.cases ?? []).map((item) => Array.isArray(item) ? { case_id: item[0], production_entrypoint: productionCaseManifest.production_entrypoint } : item);
    const caseIds = new Set(productionCases.map((item) => item.case_id));
    for (const row of rows) {
      const [findingClass, implementedBy, positiveId, safeNegativeId] = row;
      if (!implementedBy || !caseIds.has(positiveId) || !caseIds.has(safeNegativeId)) violations.push(`SCAN_CONTRACT ${findingClass} lacks production implementation or positive/safe-negative case.`);
      for (const caseId of [positiveId, safeNegativeId]) if (caseIds.has(caseId) && productionCases.find((item) => item.case_id === caseId)?.production_entrypoint !== implementationMatrix.formal_invocation) violations.push(`SCAN_CONTRACT ${caseId} does not invoke the formal manifest scanner.`);
    }
  }
  return violations;
}

export function declaredFindingClasses() { return [...IMPLEMENTED_FINDING_CLASSES]; }
