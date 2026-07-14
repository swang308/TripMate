#!/usr/bin/env node

/**
 * # Check OpenRouter API key info (OPENROUTER_API_KEY env var)
 * ./check-credits.js
 *
 * # Use specific API key by passing as an arg
 * ./check-credits.js --key sk-or-v1-...
 *
 * # Show raw JSON response
 * ./check-credits.js --json
 */

const usage = `
Usage: check-credits [options]

Options:
  -k, --key <api-key>       OpenRouter API key
  -j, --json                Output raw JSON response
  -h, --help                Show this help message

API Key Priority:
  1. --key command line argument
  2. OPENROUTER_API_KEY environment variable

Examples:
  check-credits
  check-credits --key sk-or-v1-...
  check-credits --json
`;
const path = require("node:path");
const { parseArgs } = require("node:util");
const { loadDotEnv } = require("../src/config/dotenv");

loadDotEnv(path.join(__dirname, "../.env"));

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// https://openrouter.ai/docs/api/reference/limits
const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key";

/**
 * Gets API key from various sources in priority order
 */
function getApiKey(cliKey) {
  return cliKey || process.env.OPENROUTER_API_KEY || null;
}

/**
 * Fetches key information from OpenRouter API
 */
async function fetchKeyInfo(apiKey) {
  try {
    const response = await fetch(OPENROUTER_KEY_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(
          "Unauthorized - Invalid API key or authentication required",
        );
      }
      if (response.status === 403) {
        throw new Error("Forbidden - Access denied");
      }
      if (response.status === 500) {
        throw new Error("Internal Server Error - Please try again");
      }
      throw new Error(
        `Failed to fetch key info: ${response.status} ` +
          `${response.statusText}`,
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching key info:", error.message);
    process.exit(1);
  }
}

/**
 * Formats currency amount (OpenRouter credits are always USD)
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })
    .format(amount)
    .concat(" (USD)");
}

/**
 * Formats the key data for human-readable output
 */
function formatKeyDisplay(response) {
  const lines = [];

  lines.push("OpenRouter API Key Information\n");
  lines.push("=".repeat(60));

  const { data } = response;

  if (!data) {
    lines.push("No key data available");
    lines.push("=".repeat(60));
    return lines.join("\n");
  }

  // Key label
  if (data.label) {
    lines.push(`Key Label:         ${data.label}`);
    lines.push("");
  }

  // Credit limit information
  lines.push("CREDIT LIMITS");
  lines.push("-".repeat(60));

  if (data.limit === null) {
    lines.push("Credit Limit:      Unlimited");
  } else {
    lines.push(`Credit Limit:      ${formatCurrency(data.limit)}`);
  }

  if (data.limit_remaining === null) {
    lines.push("Remaining:         Unlimited");
  } else {
    lines.push(`Remaining:         ${formatCurrency(data.limit_remaining)}`);

    // Calculate percentage used if we have both limit and remaining
    if (data.limit !== null && data.limit > 0) {
      const percentUsed =
        ((data.limit - data.limit_remaining) / data.limit) * 100;
      lines.push(`Used:              ${percentUsed.toFixed(2)}%`);
    }
  }

  lines.push("");

  // Usage information
  lines.push("USAGE (OPENROUTER MODELS)");
  lines.push("-".repeat(60));
  lines.push(`All Time:          ${formatCurrency(data.usage)}`);
  lines.push(`Today (UTC):       ${formatCurrency(data.usage_daily)}`);
  lines.push(`This Week (UTC):   ${formatCurrency(data.usage_weekly)}`);
  lines.push(`This Month (UTC):  ${formatCurrency(data.usage_monthly)}`);

  lines.push("=".repeat(60));

  return lines.join("\n");
}

async function main() {
  const { values } = parseArgs({
    options: {
      key: {
        type: "string",
        short: "k",
      },
      json: {
        type: "boolean",
        short: "j",
        default: false,
      },
      help: {
        type: "boolean",
        short: "h",
        default: false,
      },
    },
  });

  if (values.help) {
    console.log(usage);
    process.exit(0);
  }

  const apiKey = getApiKey(values.key);

  if (!apiKey) {
    console.error("Error: No API key provided\n");
    console.error("Please provide an API key using one of these methods:");
    console.error("  1. --key command line argument");
    console.error("  2. OPENROUTER_API_KEY environment variable");
    console.error("Example:");
    console.error("  check-credits --key sk-or-v1-...");
    console.error("  OPENROUTER_API_KEY=sk-or-v1-... check-credits");
    process.exit(1);
  }

  // Mask the API key in output (e.g., "sk-or-v1-...98c6")
  const maskedKey =
    apiKey.length > 14 ? `${apiKey.slice(0, 9)}...${apiKey.slice(-4)}` : "***";

  if (!values.json) {
    console.error(`Using API key: ${maskedKey}\n`);
  }

  const response = await fetchKeyInfo(apiKey);

  if (values.json) {
    console.log(JSON.stringify(response, null, 2));
  } else {
    console.log(formatKeyDisplay(response));
  }
}

main();
