import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeExistingPath } from "./lib/path-safety.mjs";
import { projectLifecycleState } from "./lib/governance/lifecycle-projection.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const actual = JSON.parse(await readFile(await safeExistingPath(root, ".codex/governance/phase-status.json"), "utf8"));
const eventLog = JSON.parse(await readFile(await safeExistingPath(root, ".codex/governance/lifecycle-events.json"), "utf8"));
const sourceErrors = [];
for (const event of eventLog.events ?? []) {
  try {
    const bytes = await readFile(await safeExistingPath(root, event.source_ref));
    const digest = createHash("sha256").update(bytes).digest("hex").toUpperCase();
    if (digest !== event.source_sha256) sourceErrors.push(`source hash mismatch ${event.source_ref}`);
  } catch (error) { sourceErrors.push(`source unavailable ${event.source_ref}: ${error.message}`); }
}
const { projection: expected, violations } = projectLifecycleState({ event_log: eventLog, generated_at: actual.generated_at });
const pass = !sourceErrors.length && !violations.length && JSON.stringify(actual) === JSON.stringify(expected) && actual.authority === "informational" && actual.used_as_gate_input === false;
console.log(`PHASE_STATUS_VALIDATION result=${pass ? "PASS" : "FAIL"} authority=${actual.authority} sources=${actual.lifecycle_source_artifacts?.length ?? 0} violations=${sourceErrors.length + violations.length}`);
for (const error of [...sourceErrors, ...violations]) console.error(`PHASE_STATUS_ERROR ${error}`);
process.exit(pass ? 0 : 1);
