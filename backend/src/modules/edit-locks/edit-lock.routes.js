const express = require("express");
const crypto = require("node:crypto");
const db = require("../../db/connection");
const { authenticateUser } = require("../../middleware/authenticateUser");
const { userCanAccessTrip, userCanEditTrip } = require("../trips/trip.permissions");
const { emitToTrip } = require("../../realtime/io");

const EDIT_LOCK_TTL_SECONDS = 120;
const LOCKABLE_ENTITY_TYPES = new Set(["itineraryItem", "budget"]);
const router = express.Router();

async function cleanupExpiredEditLocks(connection = db) {
  await connection.execute(`DELETE FROM EditLocks WHERE expiresAt <= CURRENT_TIMESTAMP`);
}

function normalizeLockEntityType(entityType) {
  const value = String(entityType || "").trim();
  return LOCKABLE_ENTITY_TYPES.has(value) ? value : null;
}

async function activeEditLock(entityType, entityId, connection = db) {
  await cleanupExpiredEditLocks(connection);
  const [rows] = await connection.execute(
    `SELECT
       l.lockId,
       l.tripId,
       l.entityType,
       l.entityId,
       l.lockedBy,
       l.lockedAt,
       l.expiresAt,
       u.email,
       u.firstName,
       p.displayName
     FROM EditLocks l
     INNER JOIN Users u ON u.userId = l.lockedBy
     LEFT JOIN Profiles p ON p.userId = l.lockedBy
     WHERE l.entityType = ?
       AND l.entityId = ?
       AND l.expiresAt > CURRENT_TIMESTAMP
     LIMIT 1`,
    [entityType, entityId]
  );

  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    lockId: row.lockId,
    tripId: row.tripId,
    entityType: row.entityType,
    entityId: row.entityId,
    lockedBy: row.lockedBy,
    lockedByName: row.displayName || row.firstName || row.email || "a teammate",
    lockedAt: row.lockedAt,
    expiresAt: row.expiresAt,
  };
}

async function releaseEditLock(tripId, entityType, entityId, userId, connection = db) {
  await connection.execute(
    `DELETE FROM EditLocks
     WHERE tripId = ?
       AND entityType = ?
       AND entityId = ?
       AND lockedBy = ?`,
    [tripId, entityType, entityId, userId]
  );
}


async function lockEntityBelongsToTrip(tripId, entityType, entityId, connection = db) {
  if (entityType === "budget") return entityId === tripId;

  if (entityType === "itineraryItem") {
    const [rows] = await connection.execute(
      `SELECT item.itemId
       FROM ItineraryItems item
       INNER JOIN ItineraryDays day
         ON day.itineraryDayId = item.itineraryDayId
       WHERE item.itemId = ?
         AND day.tripId = ?
       LIMIT 1`,
      [entityId, tripId]
    );
    return rows.length > 0;
  }

  return false;
}


router.post("/api/trips/:tripId/edit-locks", authenticateUser, async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { tripId } = req.params;
    const entityType = normalizeLockEntityType(req.body?.entityType);
    const entityId = String(req.body?.entityId || "").trim();

    if (!entityType || !entityId) {
      return res.status(400).json({ message: "entityType and entityId are required" });
    }

    const canEdit = await userCanEditTrip(req.user.userId, tripId, connection);
    if (!canEdit) {
      return res.status(404).json({ message: "Trip not found" });
    }

    const entityBelongsToTrip = await lockEntityBelongsToTrip(
      tripId,
      entityType,
      entityId,
      connection
    );
    if (!entityBelongsToTrip) {
      return res.status(404).json({ message: "Lock target not found" });
    }

    await connection.beginTransaction();
    await cleanupExpiredEditLocks(connection);

    const existingLock = await activeEditLock(entityType, entityId, connection);
    if (existingLock && existingLock.lockedBy !== req.user.userId) {
      await connection.rollback();
      return res.status(423).json({
        message: `${existingLock.lockedByName} is editing this item`,
        lock: existingLock,
      });
    }

    const lockId = existingLock?.lockId || crypto.randomUUID();
    await connection.execute(
      `INSERT INTO EditLocks (lockId, tripId, entityType, entityId, lockedBy, expiresAt)
       VALUES (?, ?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? SECOND))
       ON DUPLICATE KEY UPDATE
         tripId = VALUES(tripId),
         lockedBy = VALUES(lockedBy),
         lockedAt = CURRENT_TIMESTAMP,
         expiresAt = VALUES(expiresAt)`,
      [lockId, tripId, entityType, entityId, req.user.userId, EDIT_LOCK_TTL_SECONDS]
    );

    await connection.commit();

    const lock = await activeEditLock(entityType, entityId);
    emitToTrip(tripId, "item:locked", { tripId, lock });
    return res.status(201).json({ lock });
  } catch (error) {
    await connection.rollback();
    console.error("Acquire edit lock error:", error);
    return res.status(500).json({ message: "Failed to lock item for editing" });
  } finally {
    connection.release();
  }
});

router.delete("/api/trips/:tripId/edit-locks", authenticateUser, async (req, res) => {
  try {
    const { tripId } = req.params;
    const entityType = normalizeLockEntityType(req.body?.entityType || req.query?.entityType);
    const entityId = String(req.body?.entityId || req.query?.entityId || "").trim();

    if (!entityType || !entityId) {
      return res.status(400).json({ message: "entityType and entityId are required" });
    }

    const canAccess = await userCanAccessTrip(req.user.userId, tripId);
    if (!canAccess) {
      return res.status(404).json({ message: "Trip not found" });
    }

    const entityBelongsToTrip = await lockEntityBelongsToTrip(
      tripId,
      entityType,
      entityId
    );
    if (!entityBelongsToTrip) {
      return res.status(404).json({ message: "Lock target not found" });
    }

    await releaseEditLock(tripId, entityType, entityId, req.user.userId);
    emitToTrip(tripId, "item:unlocked", { tripId, entityType, entityId });
    return res.json({ message: "Edit lock released" });
  } catch (error) {
    console.error("Release edit lock error:", error);
    return res.status(500).json({ message: "Failed to release edit lock" });
  }
});

// Add itinerary item

module.exports = {
  editLockRouter: router,
  cleanupExpiredEditLocks,
  activeEditLock,
  releaseEditLock,
};
