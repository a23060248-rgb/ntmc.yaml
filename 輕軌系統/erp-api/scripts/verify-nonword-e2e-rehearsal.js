const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");

process.env.NODE_ENV = "test";
process.env.ENV_FILE = process.env.ENV_FILE || ".env.test";
require("../src/config/loadEnvironment").loadEnvironment();

const root = path.resolve(__dirname, "..");
const apiPort = String(process.env.NONWORD_E2E_PORT || 3103);
const apiUrl = `http://127.0.0.1:${apiPort}`;
const seedPath = path.resolve(root, "..", "db-design", "seed-rehearsal-integration.sql");

function applySeed() {
  const result = spawnSync("psql.exe", [
    "-v", "ON_ERROR_STOP=1",
    "-d", process.env.DATABASE_URL,
    "-f", seedPath,
  ], { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`rehearsal seed failed:\n${result.stdout}\n${result.stderr}`);
  }
}

function parseScriptResult(stdout, scriptName) {
  const start = stdout.indexOf("{");
  if (start < 0) throw new Error(`${scriptName} did not return JSON:\n${stdout}`);
  return JSON.parse(stdout.slice(start));
}

function runVerifier(scriptName, extraEnv = {}) {
  const result = spawnSync(process.execPath, [path.join("scripts", scriptName)], {
    cwd: root,
    env: {
      ...process.env,
      REHEARSAL_API_URL: `${apiUrl}/api`,
      ...extraEnv,
    },
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`${scriptName} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return parseScriptResult(result.stdout, scriptName);
}

async function waitForHealth(child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`rehearsal API exited with ${child.exitCode}`);
    try {
      const response = await fetch(`${apiUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("rehearsal API did not become healthy");
}

async function main() {
  const api = spawn(process.execPath, [path.join("scripts", "start-rehearsal.js")], {
    cwd: root,
    env: { ...process.env, PORT: apiPort, AUTH_MODE: "preview" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let apiOutput = "";
  api.stdout.on("data", (chunk) => { apiOutput += chunk; });
  api.stderr.on("data", (chunk) => { apiOutput += chunk; });

  try {
    await waitForHealth(api);

    applySeed();
    const schedule = runVerifier("verify-schedule-rehearsal.js");
    assert.equal(schedule.ok, true);
    assert.notEqual(schedule.temporaryHoliday, schedule.movedTo);

    applySeed();
    const backfill = runVerifier("verify-backfill-rehearsal.js");
    assert.equal(backfill.ok, true);
    assert.match(backfill.blockers.seatMessage, /尚未選擇報修處理/);
    assert.match(backfill.blockers.brakeMessage, /尚未選擇報修處理/);

    applySeed();
    const pcr = runVerifier("verify-pcr-rehearsal.js");
    assert.equal(pcr.ok, true);
    assert.equal(pcr.duplicateStatus, 409);
    assert.equal(pcr.removedEvents, 4);
    assert.equal(pcr.installedEvents, 1);

    applySeed();
    const permissions = runVerifier("verify-permission-audit-rehearsal.js");
    assert.equal(permissions.ok, true);
    assert.equal(permissions.roleCount, 6);
    assert.equal(permissions.matrixChecks, 54);

    console.log(JSON.stringify({
      ok: true,
      cases: {
        seatX: { blocked: true, message: backfill.blockers.seatMessage },
        brakeMeasurement: { blocked: true, message: backfill.blockers.brakeMessage },
        pcrChain: {
          pOrderNo: pcr.pOrderNo,
          cOrderNo: pcr.cOrderNo,
          rOrderNo: pcr.rOrderNo,
          duplicateStatus: pcr.duplicateStatus,
          removedEvents: pcr.removedEvents,
          installedEvents: pcr.installedEvents,
        },
        temporaryHoliday: { from: schedule.temporaryHoliday, to: schedule.movedTo, scheduleItems: schedule.scheduleItems },
        permissions: {
          roles: permissions.roleCount,
          policies: permissions.policyCount,
          checks: permissions.matrixChecks,
          forbidden: permissions.forbiddenChecks,
          anonymousStatus: permissions.anonymousReadStatus,
        },
      },
      note: "Word PRE_WORK records remain simulated in non-Word acceptance cases.",
    }, null, 2));
  } catch (error) {
    if (apiOutput) error.message += `\nAPI output:\n${apiOutput}`;
    throw error;
  } finally {
    if (api.exitCode === null) api.kill();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
