const {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} = require("node:crypto");
const { promisify } = require("node:util");

const scryptAsync = promisify(scrypt);
const PASSWORD_SCHEME = "scrypt";
const PASSWORD_COST = 16384;
const PASSWORD_BLOCK_SIZE = 8;
const PASSWORD_PARALLELIZATION = 1;
const PASSWORD_KEY_LENGTH = 32;
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "ntmc_session";
const SESSION_TTL_HOURS = Math.max(1, Number(process.env.SESSION_TTL_HOURS || 8));

function hashSessionToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

function createSessionCredential() {
  const rawToken = randomBytes(32).toString("base64url");
  return {
    rawToken,
    tokenHash: hashSessionToken(rawToken),
    rowToken: randomUUID(),
  };
}

async function hashPassword(password, salt = randomBytes(16)) {
  const derived = await scryptAsync(String(password), salt, PASSWORD_KEY_LENGTH, {
    N: PASSWORD_COST,
    r: PASSWORD_BLOCK_SIZE,
    p: PASSWORD_PARALLELIZATION,
    maxmem: 64 * 1024 * 1024,
  });
  return [
    PASSWORD_SCHEME,
    PASSWORD_COST,
    PASSWORD_BLOCK_SIZE,
    PASSWORD_PARALLELIZATION,
    salt.toString("base64url"),
    Buffer.from(derived).toString("base64url"),
  ].join("$");
}

async function verifyPassword(password, encodedHash) {
  const parts = String(encodedHash || "").split("$");
  if (parts.length !== 6 || parts[0] !== PASSWORD_SCHEME) return false;

  const [, costText, blockSizeText, parallelizationText, saltText, hashText] = parts;
  const cost = Number(costText);
  const blockSize = Number(blockSizeText);
  const parallelization = Number(parallelizationText);
  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(hashText, "base64url");
  if (
    !Number.isInteger(cost) || cost < 4096 || cost > 131072 ||
    !Number.isInteger(blockSize) || blockSize < 1 || blockSize > 32 ||
    !Number.isInteger(parallelization) || parallelization < 1 || parallelization > 8 ||
    salt.length < 16 || expected.length < 16
  ) {
    return false;
  }

  const actual = await scryptAsync(String(password), salt, expected.length, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: 128 * 1024 * 1024,
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function parseCookies(header) {
  return String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf("=");
      if (separator < 1) return cookies;
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
      return cookies;
    }, {});
}

function sessionTokenFromRequest(req) {
  const authorization = String(req.get("authorization") || "");
  if (authorization.startsWith("Bearer ")) return authorization.slice(7).trim();
  return parseCookies(req.get("cookie"))[SESSION_COOKIE_NAME] || "";
}

function serializeSessionCookie(token, { clear = false } = {}) {
  const secure = String(process.env.SESSION_COOKIE_SECURE || "").toLowerCase() === "true";
  const parts = [
    `${SESSION_COOKIE_NAME}=${clear ? "" : encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    clear ? "Max-Age=0" : `Max-Age=${Math.round(SESSION_TTL_HOURS * 3600)}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function sessionExpiryDate(now = new Date()) {
  return new Date(now.getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000);
}

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_TTL_HOURS,
  createSessionCredential,
  hashPassword,
  hashSessionToken,
  parseCookies,
  serializeSessionCookie,
  sessionExpiryDate,
  sessionTokenFromRequest,
  verifyPassword,
};
