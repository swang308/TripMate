const mysql = require("mysql2/promise");
const path = require("node:path");
const { loadDotEnv } = require("../config/dotenv");

loadDotEnv(path.join(__dirname, "../../.env"));

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || "tripmate",
  user: process.env.DB_USER || "tripmate",
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "Z",
});

module.exports = pool;
