const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const systemRoot = path.resolve(__dirname, "..");
const apiRoot = path.join(systemRoot, "erp-api");
const runtimeRoot = path.join(systemRoot, ".local-rehearsal");
const pidPath = path.join(runtimeRoot, "light-rail-api.pid");
const frontendIndexPath = path.join(systemRoot, "frontend", "dist", "index.html");
const wordTemplateRoot = path.join(runtimeRoot, "word-templates");
const wordOutputRoot = path.join(runtimeRoot, "word-output");

fs.mkdirSync(runtimeRoot, { recursive: true });
const stdout = fs.openSync(path.join(runtimeRoot, "light-rail-api.out.log"), "a");
const stderr = fs.openSync(path.join(runtimeRoot, "light-rail-api.err.log"), "a");

const child = spawn(process.execPath, ["src/server.js"], {
  cwd: apiRoot,
  detached: true,
  windowsHide: true,
  stdio: ["ignore", stdout, stderr],
  env: {
    ...process.env,
    ENV_FILE: ".env.test",
    NODE_ENV: "rehearsal",
    PORT: "3001",
    AUTH_MODE: "api",
    SERVE_FRONTEND: "true",
    FRONTEND_INDEX_PATH: frontendIndexPath,
    WORD_TEMPLATE_ROOT: wordTemplateRoot,
    WORD_OUTPUT_DIR: wordOutputRoot,
  },
});

child.unref();
fs.writeFileSync(pidPath, String(child.pid), "utf8");
process.stdout.write(String(child.pid));
