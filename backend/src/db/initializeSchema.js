const fs = require("node:fs/promises");
const path = require("node:path");
const mysql = require("mysql2/promise");

const schemaMigrations = [
  {
    type: "create_table_if_missing",
    table: "AIChatMessages",
    sql: `CREATE TABLE IF NOT EXISTS AIChatMessages (
      aiChatMessageId VARCHAR(50) PRIMARY KEY,
      tripId VARCHAR(50) NOT NULL,
      userId VARCHAR(50) NULL,
      recommendationRequestId VARCHAR(50) NULL,
      role VARCHAR(20) NOT NULL,
      text TEXT NOT NULL,
      tags TEXT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_aichatmessages_trip
        FOREIGN KEY (tripId) REFERENCES Trips(tripId)
        ON DELETE CASCADE,
      CONSTRAINT fk_aichatmessages_user
        FOREIGN KEY (userId) REFERENCES Users(userId)
        ON DELETE SET NULL,
      CONSTRAINT fk_aichatmessages_request
        FOREIGN KEY (recommendationRequestId) REFERENCES RecommendationRequests(recommendationRequestId)
        ON DELETE SET NULL,
      KEY idx_aichatmessages_trip_created (tripId, createdAt),
      KEY idx_aichatmessages_request (recommendationRequestId)
    ) ENGINE=InnoDB`,
  },
  { type: "sql", sql: "ALTER TABLE ItineraryItems MODIFY title VARCHAR(255) NOT NULL" },
  {
    type: "add_column_if_missing",
    table: "TripDetails",
    column: "budgetCurrency",
    sql: "ALTER TABLE TripDetails ADD COLUMN budgetCurrency VARCHAR(10) NULL AFTER collaborators",
  },
  {
    type: "add_column_if_missing",
    table: "TripDetails",
    column: "budgetVersion",
    sql: "ALTER TABLE TripDetails ADD COLUMN budgetVersion INT NOT NULL DEFAULT 1 AFTER budgetCurrency",
  },
  {
    type: "add_column_if_missing",
    table: "ItineraryItems",
    column: "version",
    sql: "ALTER TABLE ItineraryItems ADD COLUMN version INT NOT NULL DEFAULT 1 AFTER lng",
  },
  {
    type: "add_column_if_missing",
    table: "ItineraryItems",
    column: "updatedAt",
    sql: "ALTER TABLE ItineraryItems ADD COLUMN updatedAt DATETIME NULL AFTER version",
  },
  { type: "sql", sql: "ALTER TABLE Expenses MODIFY paidBy VARCHAR(50) NULL" },
  {
    type: "add_column_if_missing",
    table: "Expenses",
    column: "paidByName",
    sql: "ALTER TABLE Expenses ADD COLUMN paidByName VARCHAR(100) NULL AFTER paidBy",
  },
  {
    type: "add_column_if_missing",
    table: "Expenses",
    column: "displayOrder",
    sql: "ALTER TABLE Expenses ADD COLUMN displayOrder INT NULL AFTER notes",
  },
  { type: "sql", sql: "ALTER TABLE ExpenseShares MODIFY userId VARCHAR(50) NULL" },
  {
    type: "add_column_if_missing",
    table: "ExpenseShares",
    column: "participantName",
    sql: "ALTER TABLE ExpenseShares ADD COLUMN participantName VARCHAR(100) NULL AFTER userId",
  },
  { type: "sql", sql: "ALTER TABLE Profiles MODIFY avatarUrl LONGTEXT NULL" },
];

async function columnExists(connection, database, table, column) {
  const [rows] = await connection.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [database, table, column]
  );

  return rows.length > 0;
}

async function tableExists(connection, database, table) {
  const [rows] = await connection.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = ?
     LIMIT 1`,
    [database, table]
  );

  return rows.length > 0;
}

async function initializeSchema() {
  const schemaPath = path.join(__dirname, "../../db/schema.sql");
  const schemaSql = await fs.readFile(schemaPath, "utf8");

  const schemaWithoutDatabaseSetup = schemaSql
    .replace(/CREATE DATABASE IF NOT EXISTS[\s\S]*?;\s*/i, "")
    .replace(/USE\s+`?[\w-]+`?\s*;\s*/i, "");

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || "tripmate",
    user: process.env.DB_USER || "tripmate",
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
    timezone: "Z",
  });

  try {
    await connection.query(schemaWithoutDatabaseSetup);

    for (const migration of schemaMigrations) {
      if (migration.type === "sql") {
        await connection.query(migration.sql);
        continue;
      }

      if (migration.type === "create_table_if_missing") {
        const exists = await tableExists(
          connection,
          process.env.DB_NAME || "tripmate",
          migration.table
        );
        if (!exists) {
          await connection.query(migration.sql);
        }
        continue;
      }

      if (migration.type === "add_column_if_missing") {
        const exists = await columnExists(
          connection,
          process.env.DB_NAME || "tripmate",
          migration.table,
          migration.column
        );
        if (!exists) {
          await connection.query(migration.sql);
        }
      }
    }
  } finally {
    await connection.end();
  }
}

module.exports = { initializeSchema };
