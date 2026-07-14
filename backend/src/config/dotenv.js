const fs = require("node:fs");
const path = require("node:path");

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadDotEnv(envFilePath) {
  const resolvedPath = envFilePath
    ? path.resolve(envFilePath)
    : path.join(process.cwd(), ".env");

  if (!fs.existsSync(resolvedPath)) return { loaded: false, path: resolvedPath };

  const content = fs.readFileSync(resolvedPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    const value = stripQuotes(line.slice(eq + 1));
    if (!key) continue;

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return { loaded: true, path: resolvedPath };
}

module.exports = { loadDotEnv };

