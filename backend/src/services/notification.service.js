const crypto = require("node:crypto");
const db = require("../db/connection");

async function createNotification(userId, tripId, type, title, message, connection = db) {
  if (!userId) return;
  await connection.execute(
    `INSERT INTO Notifications (notificationId, userId, tripId, type, title, message)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), userId, tripId || null, type, title, message]
  );
}

module.exports = { createNotification };
