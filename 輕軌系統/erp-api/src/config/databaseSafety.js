const DEFAULT_REHEARSAL_NAME = /^ntmc_erp_rehearsal(?:_[a-zA-Z0-9_]+)?$/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function parseDatabaseTarget(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL is not a valid PostgreSQL URL");
  }

  return {
    host: url.hostname,
    database: decodeURIComponent(url.pathname.replace(/^\//, ""))
  };
}

function assertSafeDatabaseTarget({ connectionString, safetyMode, allowedNamePattern }) {
  if (!connectionString || !["test", "rehearsal"].includes(safetyMode)) return;

  const target = parseDatabaseTarget(connectionString);
  if (!LOCAL_HOSTS.has(target.host)) {
    throw new Error(`Rehearsal mode only permits a local PostgreSQL host; received ${target.host}`);
  }

  const pattern = allowedNamePattern ? new RegExp(allowedNamePattern) : DEFAULT_REHEARSAL_NAME;
  if (!pattern.test(target.database)) {
    throw new Error(`Rehearsal mode rejected database ${target.database}`);
  }
}

module.exports = {
  assertSafeDatabaseTarget,
  parseDatabaseTarget
};
