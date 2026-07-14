const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const { authenticateUser } = require("../src/middleware/authenticateUser");
const { getJwtSecret } = require("../src/config/jwt");

const TEST_SECRET = "tripmate-test-secret-that-is-longer-than-thirty-two-characters";

function requestWithAuthorization(authorization) {
  return {
    get(name) {
      return name === "Authorization" ? authorization : undefined;
    },
  };
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function runAuthentication(authorization) {
  const req = requestWithAuthorization(authorization);
  const res = responseRecorder();
  let nextCalled = false;
  authenticateUser(req, res, () => {
    nextCalled = true;
  });
  return { req, res, nextCalled };
}

test.beforeEach(() => {
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.NODE_ENV = "test";
});

test("rejects a request without an Authorization header", () => {
  const { res, nextCalled } = runAuthentication(undefined);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { message: "Authentication required" });
  assert.equal(nextCalled, false);
});

test("rejects non-Bearer and malformed Authorization headers", () => {
  for (const header of ["Basic abc", "bearer abc", "Bearer", "Bearer ", "abc"]) {
    const { res, nextCalled } = runAuthentication(header);
    assert.equal(res.statusCode, 401, header);
    assert.equal(nextCalled, false, header);
  }
});

test("accepts a valid signed JWT and exposes only trusted identity fields", () => {
  const token = jwt.sign(
    { userId: "user-123", email: "user@example.com", role: "Admin" },
    TEST_SECRET,
    { expiresIn: "5m" }
  );
  const { req, res, nextCalled } = runAuthentication(`Bearer ${token}`);

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(req.user, {
    userId: "user-123",
    email: "user@example.com",
  });
  assert.equal(req.user.role, undefined);
});

test("rejects a tampered JWT", () => {
  const token = jwt.sign({ userId: "user-123" }, TEST_SECRET, { expiresIn: "5m" });
  const parts = token.split(".");
  parts[1] = `${parts[1].slice(0, -1)}${parts[1].endsWith("a") ? "b" : "a"}`;
  const { res, nextCalled } = runAuthentication(`Bearer ${parts.join(".")}`);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { message: "Invalid or expired session" });
  assert.equal(nextCalled, false);
});

test("rejects a JWT signed with a different secret", () => {
  const token = jwt.sign(
    { userId: "attacker" },
    "different-secret-that-is-also-long-enough-for-this-test",
    { expiresIn: "5m" }
  );
  const { res, nextCalled } = runAuthentication(`Bearer ${token}`);
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test("rejects an expired JWT", () => {
  const token = jwt.sign({ userId: "user-123" }, TEST_SECRET, { expiresIn: -1 });
  const { res, nextCalled } = runAuthentication(`Bearer ${token}`);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { message: "Invalid or expired session" });
  assert.equal(nextCalled, false);
});

test("fails closed when JWT_SECRET is missing", () => {
  delete process.env.JWT_SECRET;
  const token = jwt.sign({ userId: "user-123" }, TEST_SECRET, { expiresIn: "5m" });
  const { res, nextCalled } = runAuthentication(`Bearer ${token}`);
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
  assert.throws(() => getJwtSecret(), /JWT_SECRET is not set/);
});

test("rejects weak production JWT secrets", () => {
  process.env.NODE_ENV = "production";
  process.env.JWT_SECRET = "secret";
  assert.throws(() => getJwtSecret(), /looks weak/);
});
