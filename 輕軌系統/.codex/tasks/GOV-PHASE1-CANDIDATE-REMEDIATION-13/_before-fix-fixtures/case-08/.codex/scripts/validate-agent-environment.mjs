import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { safeExistingPath, safeNewPath, verifyCreatedPath, validateRelativeRef } from "./lib/path-safety.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..", "..");

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith("--") || argv[index + 1] === undefined) throw new Error("Arguments must be --key value pairs.");
    result[argv[index].slice(2)] = argv[index + 1];
  }
  return result;
}

function collectKeys(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => [`${prefix}${key}`, ...collectKeys(child, `${prefix}${key}.`)]);
}

const args = parseArgs(process.argv.slice(2));
if (!args.profile) throw new Error("--profile is required; this validator never loads .env.");
const profileRef = validateRelativeRef(args.profile);
if (!profileRef.startsWith(".codex/environment/")) throw new Error("Profile must be inside .codex/environment.");
const profilePath = await safeExistingPath(projectRoot, profileRef);
const profile = JSON.parse(await readFile(profilePath, "utf8"));
const checks = [
  { id: "ENV-NO-DOTENV", pass: profile.load_dotenv === false },
  { id: "ENV-EXPLICIT-SOURCE", pass: profile.source === "explicit-json-no-dotenv" },
  { id: "DB-LOOPBACK", pass: ["localhost", "127.0.0.1", "::1"].includes(profile.database?.host) },
  { id: "DB-PORT-5433", pass: profile.database?.port === 5433 },
  { id: "DB-REHEARSAL-NAME", pass: /^ntmc_erp_rehearsal_[A-Za-z0-9_]+$/.test(profile.database?.name ?? "") },
  { id: "DB-SAFETY-MODE", pass: profile.database?.safety_mode === "rehearsal" },
  { id: "DB-NO-OPERATIONS", pass: Array.isArray(profile.allowed_operations) && profile.allowed_operations.length === 0 },
  { id: "ENV-NO-SECRET-KEYS", pass: !collectKeys(profile).some((key) => /(password|secret|token|credential|connection|string|url)/i.test(key)) }
];
const failures = checks.filter((check) => !check.pass);
if (failures.length) {
  console.error(`AGENT_ENVIRONMENT_REJECTED profile=${profileRef} failed=${failures.map((item) => item.id).join(",")}`);
  process.exit(1);
}
const evidence = {
  schema_version: 1,
  evidence_id: "ENV-SAFETY-PHASE1-001",
  profile_ref: profileRef,
  result: "PROFILE_SCHEMA_PASS",
  checks: checks.map(({ id, pass }) => ({ id, result: pass ? "PASS" : "FAIL" })),
  profile_schema_validated: true,
  runtime_command_isolation_verified: false,
  os_env_access_denied: false,
  product_script_integration_verified: false,
  database_connection_attempted: false,
  secrets_recorded: false,
  limitation: "This validates a credential-free JSON profile only. child_process, PowerShell, cmd.exe, external executables, parent permission overrides, OS .env access, and product package scripts are not isolated or enforced."
};
if (args["write-evidence"]) {
  const evidenceRef = validateRelativeRef(args["write-evidence"]);
  if (!evidenceRef.startsWith(".codex/governance/")) throw new Error("Evidence output must be inside .codex/governance.");
  const evidencePath = await safeNewPath(projectRoot, evidenceRef);
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  await verifyCreatedPath(projectRoot, evidenceRef);
}
console.log(`AGENT_ENVIRONMENT_OK profile=${profileRef} profile_schema_validated=true runtime_command_isolation_verified=false database_connection_attempted=false`);
