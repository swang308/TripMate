const path = require("node:path");
const { loadDotEnv } = require("../src/config/dotenv");

loadDotEnv(path.join(__dirname, "..", ".env"));

const { getJwtSecret } = require("../src/config/jwt");

try {
  getJwtSecret();
  // eslint-disable-next-line no-console
  console.log("OK: JWT secret is configured.");
  process.exit(0);
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(`ERROR: ${err && err.message ? err.message : String(err)}`);
  process.exit(1);
}
