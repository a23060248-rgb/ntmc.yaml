import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeExistingPath } from "./lib/path-safety.mjs";
import { projectLifecycleState } from "./lib/governance/lifecycle-projection.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const generatedAt = process.argv[2];
if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) throw new Error("ISO generated_at is required.");
const eventLog = JSON.parse(await readFile(await safeExistingPath(root, ".codex/governance/lifecycle-events.json"), "utf8"));
const { projection, violations } = projectLifecycleState({ event_log: eventLog, generated_at: generatedAt });
if (violations.length) throw new Error(violations.join(" | "));
await writeFile(path.join(root, ".codex", "governance", "phase-status.json"), `${JSON.stringify(projection, null, 2)}\n`, "utf8");
console.log(`PHASE_STATUS_BUILT authority=${projection.authority} active=${projection.active_task ?? "none"} review=${projection.last_completed_review ?? "none"} bootstrap=NO-GO steady=DISABLED migration_320=NO-GO`);
