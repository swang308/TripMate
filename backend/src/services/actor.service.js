const db = require("../db/connection");
const { emitToTrip } = require("../realtime/io");

async function resolveActor(userId) {
  const fallback = { userId, name: "a teammate" };
  if (!userId) return fallback;

  try {
    const [rows] = await db.execute(
      `SELECT u.firstName, p.displayName
       FROM Users u
       LEFT JOIN Profiles p ON p.userId = u.userId
       WHERE u.userId = ?
       LIMIT 1`,
      [userId]
    );
    if (rows.length === 0) return fallback;
    const row = rows[0];
    return { userId, name: row.displayName || row.firstName || "a teammate" };
  } catch (error) {
    console.error("resolveActor failed:", error);
    return fallback;
  }
}

async function broadcastItineraryChange(tripId, userId, action) {
  if (!tripId) return;
  const actor = await resolveActor(userId);
  emitToTrip(tripId, "itinerary:changed", { tripId, actor, action });
}

module.exports = { resolveActor, broadcastItineraryChange };
