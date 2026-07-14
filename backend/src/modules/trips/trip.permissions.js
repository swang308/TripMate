const db = require("../../db/connection");

async function userCanAccessTrip(userId, tripId, connection = db) {
  const [rows] = await connection.execute(
    `SELECT t.tripId
     FROM Trips t
     LEFT JOIN TripMembers tm
       ON tm.tripId = t.tripId
      AND tm.userId = ?
      AND tm.status = 'Active'
     WHERE t.tripId = ?
       AND (t.createdBy = ? OR tm.tripMemberId IS NOT NULL)
     LIMIT 1`,
    [userId, tripId, userId]
  );
  return rows.length > 0;
}

async function userOwnsTrip(userId, tripId, connection = db) {
  const [rows] = await connection.execute(
    `SELECT tripId FROM Trips WHERE tripId = ? AND createdBy = ? LIMIT 1`,
    [tripId, userId]
  );
  return rows.length > 0;
}

async function userCanEditTrip(userId, tripId, connection = db) {
  const [rows] = await connection.execute(
    `SELECT t.tripId
     FROM Trips t
     LEFT JOIN TripMembers tm
       ON tm.tripId = t.tripId
      AND tm.userId = ?
      AND tm.status = 'Active'
      AND tm.role IN ('Owner', 'Editor')
     WHERE t.tripId = ?
       AND (t.createdBy = ? OR tm.tripMemberId IS NOT NULL)
     LIMIT 1`,
    [userId, tripId, userId]
  );
  return rows.length > 0;
}

async function userCanManageTrip(userId, tripId, connection = db) {
  const [rows] = await connection.execute(
    `SELECT t.tripId
     FROM Trips t
     LEFT JOIN TripMembers tm
       ON tm.tripId = t.tripId
      AND tm.userId = ?
      AND tm.status = 'Active'
      AND tm.role = 'Owner'
     WHERE t.tripId = ?
       AND (t.createdBy = ? OR tm.tripMemberId IS NOT NULL)
     LIMIT 1`,
    [userId, tripId, userId]
  );
  return rows.length > 0;
}

module.exports = {
  userCanAccessTrip,
  userOwnsTrip,
  userCanEditTrip,
  userCanManageTrip,
};
