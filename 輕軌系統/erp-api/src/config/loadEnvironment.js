const path = require("path");
const dotenv = require("dotenv");

let loadedPath = null;

function resolveEnvironmentPath() {
  const fileName = process.env.ENV_FILE || (process.env.NODE_ENV === "test" ? ".env.test" : ".env");
  return path.resolve(__dirname, "../..", fileName);
}

function loadEnvironment() {
  const envPath = resolveEnvironmentPath();
  if (loadedPath === envPath) return envPath;

  const result = dotenv.config({ path: envPath, override: false });
  if (result.error && result.error.code !== "ENOENT") throw result.error;

  loadedPath = envPath;
  return envPath;
}

module.exports = {
  loadEnvironment,
  resolveEnvironmentPath
};
