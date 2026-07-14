const http = require("node:http");
const path = require("node:path");

const { loadDotEnv } = require("./src/config/dotenv");

loadDotEnv(path.join(__dirname, ".env"));

const { createApp, corsOptions } = require("./src/app");
const { initializeSchema } = require("./src/db/initializeSchema");
const { initRealtime } = require("./src/realtime/io");

const PORT = process.env.PORT || 5050;
const app = createApp();
const server = http.createServer(app);

initRealtime(server, { corsOrigin: corsOptions.origin });

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the process using it, then run npm start again.`);
    process.exit(1);
  }
  throw error;
});

async function startServer() {
  try {
    await initializeSchema();
    console.log("Database schema is ready");
  } catch (error) {
    console.error("Database schema initialization failed:", error);
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
