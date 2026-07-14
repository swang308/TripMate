const crypto = require("node:crypto");

function isProduction() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function looksWeak(secret) {
  // Basic guardrails (not a full entropy check):
  // - too short
  // - common placeholder values
  if (!secret) return true;
  const trimmed = String(secret).trim();
  if (trimmed.length < 32) return true;
  const lowered = trimmed.toLowerCase();
  if (["changeme", "secret", "jwtsecret", "password", "123456", "test"].includes(lowered)) return true;
  return false;
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret || !String(secret).trim()) {
    throw new Error("JWT_SECRET is not set.");
  }

  if (isProduction() && looksWeak(secret)) {
    throw new Error("JWT_SECRET looks weak. Use a long random value in production.");
  }

  return String(secret);
}

function getJwtExpiresIn() {
  return process.env.JWT_EXPIRES_IN || "15m";
}

function generateDevJwtSecret() {
  return crypto.randomBytes(32).toString("hex");
}

module.exports = {
  getJwtSecret,
  getJwtExpiresIn,
  generateDevJwtSecret
};

