const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createSessionCredential,
  hashPassword,
  hashSessionToken,
  parseCookies,
  serializeSessionCookie,
  sessionExpiryDate,
  verifyPassword,
} = require("../src/services/sessionService");

test("password hashes verify without storing the plain password", async () => {
  const encoded = await hashPassword("Rehearsal!2026", Buffer.from("1234567890abcdef"));
  assert.match(encoded, /^scrypt\$16384\$8\$1\$/);
  assert.equal(encoded.includes("Rehearsal!2026"), false);
  assert.equal(await verifyPassword("Rehearsal!2026", encoded), true);
  assert.equal(await verifyPassword("wrong-password", encoded), false);
  assert.equal(await verifyPassword("anything", "invalid-hash"), false);
});

test("new session credentials retain only a SHA256 lookup value", () => {
  const credential = createSessionCredential();
  assert.match(credential.rawToken, /^[A-Za-z0-9_-]{40,}$/);
  assert.match(credential.rowToken, /^[0-9a-f-]{36}$/);
  assert.equal(credential.tokenHash, hashSessionToken(credential.rawToken));
  assert.equal(credential.tokenHash.includes(credential.rawToken), false);
});

test("session cookies are HttpOnly and can be cleared", () => {
  const cookie = serializeSessionCookie("credential");
  assert.match(cookie, /^ntmc_session=credential;/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.equal(parseCookies("a=1; ntmc_session=credential").ntmc_session, "credential");
  assert.match(serializeSessionCookie("", { clear: true }), /Max-Age=0/);
});

test("session expiry uses the configured positive TTL", () => {
  const now = new Date("2026-07-12T00:00:00.000Z");
  assert.ok(sessionExpiryDate(now).getTime() > now.getTime());
});
