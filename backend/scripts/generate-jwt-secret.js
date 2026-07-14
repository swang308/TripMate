const crypto = require("node:crypto");

// HS256 secret guidance: at least 32 bytes (256 bits). Use 64 bytes for extra margin.
const secret = crypto.randomBytes(64).toString("hex");
process.stdout.write(`${secret}\n`);

