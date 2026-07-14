const express = require("express");
const crypto = require("node:crypto");
const db = require("../../db/connection");
const { authenticateUser } = require("../../middleware/authenticateUser");
const { userCanAccessTrip, userCanEditTrip } = require("../trips/trip.permissions");
const { createAuditLog } = require("../../services/audit.service");
const { emitToTrip } = require("../../realtime/io");
const { cleanupExpiredEditLocks, activeEditLock, releaseEditLock } = require("../edit-locks/edit-lock.routes");
const { eachDate, normalizeDateOnly } = require("../../utils/date");

const ITINERARY_ITEM_TITLE_MAX_LENGTH = 255;

async function reconcileItineraryDaysWithTripDates(trip, connection = db) {
  const expectedDates = eachDate(trip?.startDate, trip?.endDate);
  if (!trip?.tripId || expectedDates.length === 0) return;

  const [days] = await connection.execute(
    `SELECT itineraryDayId, date
     FROM ItineraryDays
     WHERE tripId = ?
     ORDER BY date ASC`,
    [trip.tripId]
  );

  if (days.length !== expectedDates.length) return;

  const currentDates = days.map((day) => normalizeDateOnly(day.date));
  const alreadyAligned = currentDates.every((date, index) => date === expectedDates[index]);
  if (alreadyAligned) return;

  for (const [index, day] of days.entries()) {
    await connection.execute(
      `UPDATE ItineraryDays
       SET date = ?
       WHERE itineraryDayId = ?`,
      [expectedDates[index], day.itineraryDayId]
    );
  }
}


function createItineraryRouter({ broadcastItineraryChange }) {
  const router = express.Router();

  router.get("/api/trips/:tripId/itinerary", authenticateUser, async (req, res) => {
    try {
      const { tripId } = req.params;
  
      const canAccess = await userCanAccessTrip(req.user.userId, tripId);
      if (!canAccess) {
        return res.status(404).json({ message: "Trip not found" });
      }
  
      const canEdit = await userCanEditTrip(req.user.userId, tripId);
  
      const [trips] = await db.execute(
        `SELECT *
         FROM Trips
         WHERE tripId = ?`,
        [tripId]
      );
  
      if (trips.length === 0) {
        return res.status(404).json({ message: "Trip not found" });
      }
  
      await reconcileItineraryDaysWithTripDates(trips[0]);
  
      const [days] = await db.execute(
        `SELECT *
         FROM ItineraryDays
         WHERE tripId = ?
         ORDER BY date ASC`,
        [tripId]
      );
  
      const [items] = await db.execute(
        `SELECT item.*
         FROM ItineraryItems item
         INNER JOIN ItineraryDays day
           ON item.itineraryDayId = day.itineraryDayId
         WHERE day.tripId = ?
         ORDER BY day.date ASC, item.\`order\` ASC`,
        [tripId]
      );
  
      const itinerary = days.map((day) => ({
        ...day,
        items: items.filter(
          (item) => item.itineraryDayId === day.itineraryDayId
        ),
      }));
  
      await cleanupExpiredEditLocks();
      const [lockRows] = await db.execute(
        `SELECT
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
         WHERE l.tripId = ?
           AND l.expiresAt > CURRENT_TIMESTAMP`,
        [tripId]
      );
  
      res.json({
        trip: trips[0],
        itinerary,
        canEdit,
        locks: lockRows.map((row) => ({
          entityType: row.entityType,
          entityId: row.entityId,
          lockedBy: row.lockedBy,
          lockedByName: row.displayName || row.firstName || row.email || "a teammate",
          lockedAt: row.lockedAt,
          expiresAt: row.expiresAt,
        })),
      });
    } catch (error) {
      console.error("Get itinerary error:", error);
      res.status(500).json({
        message: "Failed to load itinerary",
        detail: process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    }
  });
  
  router.post(
    "/api/itinerary-days/:itineraryDayId/items",
    authenticateUser,
    async (req, res) => {
      const connection = await db.getConnection();
  
      try {
        const { itineraryDayId } = req.params;
        const { title, startTime, endTime, notes, lat, lng } = req.body;
        const trimmedTitle = title?.trim();
  
        if (!trimmedTitle) {
          return res.status(400).json({ message: "Title is required" });
        }
  
        if (trimmedTitle.length > ITINERARY_ITEM_TITLE_MAX_LENGTH) {
          return res.status(400).json({
            message: `Title must be ${ITINERARY_ITEM_TITLE_MAX_LENGTH} characters or fewer`,
          });
        }
  
        await connection.beginTransaction();
  
        const [days] = await connection.execute(
          `SELECT tripId
           FROM ItineraryDays
           WHERE itineraryDayId = ?
           LIMIT 1`,
          [itineraryDayId]
        );
  
        if (
          days.length === 0 ||
          !(await userCanEditTrip(
            req.user.userId,
            days[0].tripId,
            connection
          ))
        ) {
          await connection.rollback();
          return res.status(404).json({
            message: "Itinerary day not found",
          });
        }
  
        const tripId = days[0].tripId;
  
        const [existingItems] = await connection.execute(
          `SELECT COUNT(*) AS itemCount
           FROM ItineraryItems
           WHERE itineraryDayId = ?`,
          [itineraryDayId]
        );
  
        const nextOrder = Number(existingItems[0].itemCount) || 0;
        const itemId = crypto.randomUUID();
  
        const newItem = {
          itemId,
          itineraryDayId,
          title: trimmedTitle,
          startTime: startTime || null,
          endTime: endTime || null,
          order: nextOrder,
          notes: notes || null,
          lat: lat || null,
          lng: lng || null,
          version: 1,
        };
  
        await connection.execute(
          `INSERT INTO ItineraryItems
           (
             itemId,
             itineraryDayId,
             title,
             startTime,
             endTime,
             \`order\`,
             notes,
             lat,
             lng
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            itemId,
            itineraryDayId,
            trimmedTitle,
            startTime || null,
            endTime || null,
            nextOrder,
            notes || null,
            lat || null,
            lng || null,
          ]
        );
  
        await createAuditLog(
          {
            userId: req.user.userId,
            tripId,
            entityType: "ItineraryItem",
            entityId: itemId,
            action: "Created",
            afterState: newItem,
            metadata: {
              itineraryDayId,
            },
            ipAddress: req.ip,
          },
          connection
        );
  
        await connection.commit();
  
        await broadcastItineraryChange(
          tripId,
          req.user.userId,
          "add"
        );
  
        return res.status(201).json({
          message: "Itinerary item added",
          item: newItem,
        });
      } catch (error) {
        await connection.rollback();
        console.error("Add itinerary item error:", error);
  
        return res.status(500).json({
          message: "Failed to add itinerary item",
          detail:
            process.env.NODE_ENV === "production"
              ? undefined
              : error.message,
        });
      } finally {
        connection.release();
      }
    }
  );
  
  // Edit itinerary item
  router.put("/api/itinerary-items/:itemId", authenticateUser, async (req, res) => {
      const connection = await db.getConnection();
  
      try {
        const { itemId } = req.params;
        const { title, startTime, endTime, notes, lat, lng, version } = req.body;
        const trimmedTitle = title?.trim();
        const expectedVersion = Number(version);
  
        if (!trimmedTitle) {
          return res.status(400).json({ message: "Title is required" });
        }
  
        if (trimmedTitle.length > ITINERARY_ITEM_TITLE_MAX_LENGTH) {
          return res.status(400).json({
            message: `Title must be ${ITINERARY_ITEM_TITLE_MAX_LENGTH} characters or fewer`,
          });
        }
  
        if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
          return res.status(400).json({
            message: "A valid item version is required",
          });
        }
  
        await connection.beginTransaction();
  
        const [items] = await connection.execute(
          `SELECT item.*, day.tripId
           FROM ItineraryItems item
           INNER JOIN ItineraryDays day
             ON day.itineraryDayId = item.itineraryDayId
           WHERE item.itemId = ?
           LIMIT 1`,
          [itemId]
        );
  
        if (
          items.length === 0 ||
          !(await userCanEditTrip(
            req.user.userId,
            items[0].tripId,
            connection
          ))
        ) {
          await connection.rollback();
          return res.status(404).json({
            message: "Itinerary item not found",
          });
        }
  
        const existingItem = items[0];
        const tripId = existingItem.tripId;
  
        const lock = await activeEditLock(
          "itineraryItem",
          itemId,
          connection
        );
  
        if (lock && lock.lockedBy !== req.user.userId) {
          await connection.rollback();
          return res.status(423).json({
            message: `${lock.lockedByName} is editing this item`,
            lock,
          });
        }
  
        const [result] = await connection.execute(
          `UPDATE ItineraryItems
           SET title = ?,
               startTime = ?,
               endTime = ?,
               notes = ?,
               lat = ?,
               lng = ?,
               version = version + 1,
               updatedAt = CURRENT_TIMESTAMP
           WHERE itemId = ?
             AND version = ?`,
          [
            trimmedTitle,
            startTime || null,
            endTime || null,
            notes || null,
            lat || null,
            lng || null,
            itemId,
            expectedVersion,
          ]
        );
  
        if (result.affectedRows === 0) {
          const [latestRows] = await connection.execute(
            `SELECT *
             FROM ItineraryItems
             WHERE itemId = ?
             LIMIT 1`,
            [itemId]
          );
  
          await connection.rollback();
  
          return res.status(409).json({
            message:
              "This itinerary item changed while you were editing. Review the latest version and try again.",
            item: latestRows[0] || null,
          });
        }
  
        const updatedItem = {
          itemId,
          itineraryDayId: existingItem.itineraryDayId,
          title: trimmedTitle,
          startTime: startTime || null,
          endTime: endTime || null,
          order: existingItem.order,
          notes: notes || null,
          lat: lat || null,
          lng: lng || null,
          version: expectedVersion + 1,
        };
  
        await createAuditLog(
          {
            userId: req.user.userId,
            tripId,
            entityType: "ItineraryItem",
            entityId: itemId,
            action: "Updated",
            beforeState: {
              itemId: existingItem.itemId,
              itineraryDayId: existingItem.itineraryDayId,
              title: existingItem.title,
              startTime: existingItem.startTime,
              endTime: existingItem.endTime,
              order: existingItem.order,
              notes: existingItem.notes,
              lat: existingItem.lat,
              lng: existingItem.lng,
              version: existingItem.version,
            },
            afterState: updatedItem,
            ipAddress: req.ip,
          },
          connection
        );
  
        await releaseEditLock(
          tripId,
          "itineraryItem",
          itemId,
          req.user.userId,
          connection
        );
  
        await connection.commit();
  
        await broadcastItineraryChange(
          tripId,
          req.user.userId,
          "edit"
        );
  
        emitToTrip(tripId, "item:unlocked", {
          tripId,
          entityType: "itineraryItem",
          entityId: itemId,
        });
  
        return res.json({
          message: "Itinerary item updated",
          item: updatedItem,
        });
      } catch (error) {
        await connection.rollback();
        console.error("Edit itinerary item error:", error);
  
        return res.status(500).json({
          message: "Failed to edit itinerary item",
          detail:
            process.env.NODE_ENV === "production"
              ? undefined
              : error.message,
        });
      } finally {
        connection.release();
      }
    }
  );
  
  // Reorder itinerary items within one day
  router.put("/api/itinerary-days/:itineraryDayId/items/order", authenticateUser, async (req, res) => {
      const connection = await db.getConnection();
  
      try {
        const { itineraryDayId } = req.params;
        const { itemIds } = req.body;
  
        if (!Array.isArray(itemIds)) {
          return res.status(400).json({
            message: "itemIds must be an array",
          });
        }
  
        const uniqueItemIds = new Set(itemIds);
  
        if (uniqueItemIds.size !== itemIds.length) {
          return res.status(400).json({
            message: "itemIds cannot contain duplicates",
          });
        }
  
        await connection.beginTransaction();
  
        const [days] = await connection.execute(
          `SELECT tripId
           FROM ItineraryDays
           WHERE itineraryDayId = ?
           LIMIT 1`,
          [itineraryDayId]
        );
  
        if (
          days.length === 0 ||
          !(await userCanEditTrip(
            req.user.userId,
            days[0].tripId,
            connection
          ))
        ) {
          await connection.rollback();
  
          return res.status(404).json({
            message: "Itinerary day not found",
          });
        }
  
        const tripId = days[0].tripId;
  
        const [existingItems] = await connection.execute(
          `SELECT itemId, \`order\`
           FROM ItineraryItems
           WHERE itineraryDayId = ?
           ORDER BY \`order\` ASC`,
          [itineraryDayId]
        );
  
        if (existingItems.length !== itemIds.length) {
          await connection.rollback();
  
          return res.status(400).json({
            message:
              "itemIds must include every item for this itinerary day",
          });
        }
  
        const existingItemIds = new Set(
          existingItems.map((item) => item.itemId)
        );
  
        const allItemsBelongToDay = itemIds.every((itemId) =>
          existingItemIds.has(itemId)
        );
  
        if (!allItemsBelongToDay) {
          await connection.rollback();
  
          return res.status(400).json({
            message:
              "All items must belong to this itinerary day",
          });
        }
  
        const previousOrder = existingItems.map((item) => item.itemId);
  
        for (const [order, itemId] of itemIds.entries()) {
          await connection.execute(
            `UPDATE ItineraryItems
             SET \`order\` = ?
             WHERE itemId = ?
               AND itineraryDayId = ?`,
            [order, itemId, itineraryDayId]
          );
        }
  
        await createAuditLog(
          {
            userId: req.user.userId,
            tripId,
            entityType: "ItineraryDay",
            entityId: itineraryDayId,
            action: "ItemsReordered",
            beforeState: {
              itemIds: previousOrder,
            },
            afterState: {
              itemIds,
            },
            metadata: {
              itemCount: itemIds.length,
            },
            ipAddress: req.ip,
          },
          connection
        );
  
        await connection.commit();
  
        await broadcastItineraryChange(
          tripId,
          req.user.userId,
          "reorder"
        );
  
        return res.json({
          message: "Itinerary item order updated",
        });
      } catch (error) {
        await connection.rollback();
        console.error("Reorder itinerary items error:", error);
  
        return res.status(500).json({
          message: "Failed to reorder itinerary items",
          detail:
            process.env.NODE_ENV === "production"
              ? undefined
              : error.message,
        });
      } finally {
        connection.release();
      }
    }
  );
  
  // Delete itinerary item
  router.delete("/api/itinerary-items/:itemId", authenticateUser, async (req, res) => { 
    const connection = await db.getConnection();
  
      try {
        const { itemId } = req.params;
  
        await connection.beginTransaction();
  
        const [items] = await connection.execute(
          `SELECT item.*, day.tripId
           FROM ItineraryItems item
           INNER JOIN ItineraryDays day
             ON day.itineraryDayId = item.itineraryDayId
           WHERE item.itemId = ?
           LIMIT 1`,
          [itemId]
        );
  
        if (
          items.length === 0 ||
          !(await userCanEditTrip(
            req.user.userId,
            items[0].tripId,
            connection
          ))
        ) {
          await connection.rollback();
          return res.status(404).json({
            message: "Itinerary item not found",
          });
        }
  
        const existingItem = items[0];
        const tripId = existingItem.tripId;
  
        const lock = await activeEditLock(
          "itineraryItem",
          itemId,
          connection
        );
  
        if (lock && lock.lockedBy !== req.user.userId) {
          await connection.rollback();
          return res.status(423).json({
            message: `${lock.lockedByName} is editing this item`,
            lock,
          });
        }
  
        await createAuditLog(
          {
            userId: req.user.userId,
            tripId,
            entityType: "ItineraryItem",
            entityId: itemId,
            action: "Deleted",
            beforeState: {
              itemId: existingItem.itemId,
              itineraryDayId: existingItem.itineraryDayId,
              title: existingItem.title,
              startTime: existingItem.startTime,
              endTime: existingItem.endTime,
              order: existingItem.order,
              notes: existingItem.notes,
              lat: existingItem.lat,
              lng: existingItem.lng,
              version: existingItem.version,
            },
            afterState: null,
            ipAddress: req.ip,
          },
          connection
        );
  
        await connection.execute(
          `DELETE FROM ItineraryItems
           WHERE itemId = ?`,
          [itemId]
        );
  
        await connection.commit();
  
        await broadcastItineraryChange(
          tripId,
          req.user.userId,
          "delete"
        );
  
        emitToTrip(tripId, "item:unlocked", {
          tripId,
          entityType: "itineraryItem",
          entityId: itemId,
        });
  
        return res.json({
          message: "Itinerary item deleted",
        });
      } catch (error) {
        await connection.rollback();
        console.error("Delete itinerary item error:", error);
  
        return res.status(500).json({
          message: "Failed to delete itinerary item",
          detail:
            process.env.NODE_ENV === "production"
              ? undefined
              : error.message,
        });
      } finally {
        connection.release();
      }
    }
  );
  

  return router;
}

module.exports = { createItineraryRouter };

