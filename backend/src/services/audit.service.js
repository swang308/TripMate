const crypto = require("node:crypto");
const db = require("../db/connection");

async function createAuditLog(entry, connection = db) {
  const {
    userId = null, tripId = null, entityType, entityId, action,
    beforeState = null, afterState = null, metadata = null, ipAddress = null,
  } = entry;

  await connection.execute(
    `INSERT INTO AuditLogs (
       auditLogId, userId, tripId, entityType, entityId, action,
       beforeState, afterState, metadata, ipAddress
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(), userId, tripId, entityType, entityId, action,
      beforeState ? JSON.stringify(beforeState) : null,
      afterState ? JSON.stringify(afterState) : null,
      metadata ? JSON.stringify(metadata) : null,
      ipAddress,
    ]
  );
}

module.exports = { createAuditLog };
