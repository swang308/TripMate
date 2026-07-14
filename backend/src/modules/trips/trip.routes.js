const express = require("express");
const crypto = require("node:crypto");

const db = require("../../db/connection");
const { authenticateUser } = require("../../middleware/authenticateUser");
const { createAuditLog } = require("../../services/audit.service");
const { emitToTrip, emitToUser } = require("../../realtime/io");
const { eachDate, normalizeDateOnly, isEndBeforeStart } = require("../../utils/date");

function createTripRouter({ resolveActor }) {
  const router = express.Router();

  router.post("/api/trips", authenticateUser, async (req, res) => {
    const connection = await db.getConnection();
  
    try {
      const {
        name,
        description,
        startDate,
        endDate,
        destinationCity,
        destinationCountry,
        destinationTimezone,
        visibility,
        tripType,
        collaborators,
        tripImage,
      } = req.body;
      const createdBy = req.user.userId;
  
      if (!name || !startDate || !endDate) {
        return res.status(400).json({
          message: "Trip name, start date, and end date are required",
        });
      }
  
      if (isEndBeforeStart(startDate, endDate)) {
        return res.status(400).json({
          message: "End date must be on or after start date",
        });
      }
  
      const tripId = crypto.randomUUID();
  
      await connection.beginTransaction();
  
      await connection.execute(
        `INSERT INTO Trips
         (tripId, name, description, startDate, endDate, destinationCity, destinationCountry, destinationTimezone, createdBy, visibility)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tripId,
          name,
          description || null,
          startDate,
          endDate,
          destinationCity || null,
          destinationCountry || null,
          destinationTimezone || null,
          createdBy,
          visibility || "Private",
        ]
      );
  
      await connection.execute(
        `INSERT INTO TripDetails (tripId, tripType, collaborators, tripImage)
         VALUES (?, ?, ?, ?)`,
        [
          tripId,
          tripType || (visibility === "Friends" ? "group" : "solo"),
          collaborators || null,
          tripImage || null,
        ]
      );
  
      await connection.execute(
        `INSERT INTO TripMembers (tripMemberId, tripId, userId, role, status)
         VALUES (?, ?, ?, 'Owner', 'Active')`,
        [crypto.randomUUID(), tripId, createdBy]
      );
  
      const dates = eachDate(startDate, endDate);
  
      for (const date of dates) {
        await connection.execute(
          `INSERT INTO ItineraryDays (itineraryDayId, tripId, date)
           VALUES (?, ?, ?)`,
          [crypto.randomUUID(), tripId, date]
        );
      }
  
      await createAuditLog(
        {
          userId: createdBy,
          tripId,
          entityType: "Trip",
          entityId: tripId,
          action: "Created",
          afterState: {
            name: name.trim(),
            description: description || null,
            startDate,
            endDate,
            destinationCity: destinationCity || null,
            destinationCountry: destinationCountry || null,
            destinationTimezone: destinationTimezone || null,
            visibility: visibility || "Private",
            tripType: tripType || (visibility === "Friends" ? "group" : "solo"),
          },
          metadata: {
            itineraryDayCount: dates.length,
          },
          ipAddress: req.ip,
        },
        connection
      );
  
      await connection.commit();
  
      res.status(201).json({
        message: "Trip created successfully",
        tripId,
      });
    } catch (error) {
      await connection.rollback();
      console.error("Create trip error:", error);
      res.status(500).json({
        message: "Failed to create trip",
        detail: process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    } finally {
      connection.release();
    }
  });
  
  // Get one trip with itinerary days/items
  
  router.get("/api/trips", authenticateUser, async (req, res) => {
    try {
      const [trips] = await db.execute(
        `SELECT
           t.tripId AS id,
           t.name AS title,
           t.destinationCity AS destination,
           t.destinationCountry,
           t.destinationTimezone,
           t.startDate,
           t.endDate,
           CASE
             WHEN EXISTS (
               SELECT 1
               FROM TripMembers activeMembers
               WHERE activeMembers.tripId = t.tripId
                 AND activeMembers.status = 'Active'
                 AND activeMembers.userId <> t.createdBy
             )
             OR EXISTS (
               SELECT 1
               FROM Invitations pendingInvitations
               WHERE pendingInvitations.tripId = t.tripId
                 AND pendingInvitations.status = 'Pending'
             )
             THEN 'group'
             ELSE COALESCE(d.tripType, 'solo')
           END AS tripType,
           d.collaborators,
           (
             SELECT GROUP_CONCAT(
               COALESCE(
                 NULLIF(memberProfiles.displayName, ''),
                 NULLIF(TRIM(CONCAT_WS(' ', memberUsers.firstName, memberUsers.lastName)), ''),
                 memberUsers.email
               )
               ORDER BY memberRows.joinedAt ASC
               SEPARATOR ' | '
             )
             FROM TripMembers memberRows
             INNER JOIN Users memberUsers ON memberUsers.userId = memberRows.userId
             LEFT JOIN Profiles memberProfiles ON memberProfiles.userId = memberUsers.userId
             WHERE memberRows.tripId = t.tripId
               AND memberRows.status = 'Active'
               AND memberRows.userId <> t.createdBy
           ) AS activeGroupMembers,
           (
             SELECT GROUP_CONCAT(invites.inviteeEmail ORDER BY invites.createdAt DESC SEPARATOR ' | ')
             FROM Invitations invites
             WHERE invites.tripId = t.tripId
               AND invites.status = 'Pending'
           ) AS pendingGroupMembers,
           d.tripImage,
           t.visibility,
           t.createdAt,
           t.createdBy AS ownerId,
           p.displayName AS ownerName
         FROM Trips t
         LEFT JOIN TripDetails d ON d.tripId = t.tripId
         LEFT JOIN Profiles p ON t.createdBy = p.userId
         LEFT JOIN TripMembers tm
           ON tm.tripId = t.tripId
          AND tm.userId = ?
          AND tm.status = 'Active'
         WHERE t.createdBy = ? OR tm.tripMemberId IS NOT NULL
         ORDER BY t.createdAt DESC`,
        [req.user.userId, req.user.userId]
      );
  
      res.json({ trips });
    } catch (error) {
      console.error("Get trips error:", error);
      res.status(500).json({ message: "Failed to load trips" });
    }
  });
  
  router.get("/api/trips/:tripId", authenticateUser, async (req, res) => {
    try {
      const { tripId } = req.params;
  
      const [trips] = await db.execute(
        `SELECT
           t.tripId AS id,
           t.name AS title,
           t.description,
           t.destinationCity AS destination,
           t.destinationCountry,
           t.destinationTimezone,
           t.startDate,
           t.endDate,
           CASE
             WHEN EXISTS (
               SELECT 1
               FROM TripMembers activeMembers
               WHERE activeMembers.tripId = t.tripId
                 AND activeMembers.status = 'Active'
                 AND activeMembers.userId <> t.createdBy
             )
             OR EXISTS (
               SELECT 1
               FROM Invitations pendingInvitations
               WHERE pendingInvitations.tripId = t.tripId
                 AND pendingInvitations.status = 'Pending'
             )
             THEN 'group'
             ELSE COALESCE(d.tripType, 'solo')
           END AS tripType,
           d.collaborators,
           (
             SELECT GROUP_CONCAT(
               COALESCE(
                 NULLIF(memberProfiles.displayName, ''),
                 NULLIF(TRIM(CONCAT_WS(' ', memberUsers.firstName, memberUsers.lastName)), ''),
                 memberUsers.email
               )
               ORDER BY memberRows.joinedAt ASC
               SEPARATOR ' | '
             )
             FROM TripMembers memberRows
             INNER JOIN Users memberUsers ON memberUsers.userId = memberRows.userId
             LEFT JOIN Profiles memberProfiles ON memberProfiles.userId = memberUsers.userId
             WHERE memberRows.tripId = t.tripId
               AND memberRows.status = 'Active'
               AND memberRows.userId <> t.createdBy
           ) AS activeGroupMembers,
           (
             SELECT GROUP_CONCAT(invites.inviteeEmail ORDER BY invites.createdAt DESC SEPARATOR ' | ')
             FROM Invitations invites
             WHERE invites.tripId = t.tripId
               AND invites.status = 'Pending'
           ) AS pendingGroupMembers,
           d.tripImage,
           t.visibility,
           t.createdAt,
           t.createdBy AS ownerId,
           p.displayName AS ownerName
         FROM Trips t
         LEFT JOIN TripDetails d ON d.tripId = t.tripId
         LEFT JOIN Profiles p ON t.createdBy = p.userId
         LEFT JOIN TripMembers tm
           ON tm.tripId = t.tripId
          AND tm.userId = ?
          AND tm.status = 'Active'
         WHERE t.tripId = ?
           AND (t.createdBy = ? OR tm.tripMemberId IS NOT NULL)`,
        [req.user.userId, tripId, req.user.userId]
      );
  
      if (trips.length === 0) {
        return res.status(404).json({ message: "Trip not found" });
      }
  
      res.json({ trip: trips[0] });
    } catch (error) {
      console.error("Get trip error:", error);
      res.status(500).json({ message: "Failed to load trip" });
    }
  });
  
  
  router.put("/api/trips/:tripId", authenticateUser, async (req, res) => {
    const connection = await db.getConnection();
  
    try {
      const { tripId } = req.params;
      const {
        name,
        description,
        startDate,
        endDate,
        destinationCity,
        destinationCountry,
        destinationTimezone,
        visibility,
        tripType,
        collaborators,
        tripImage,
      } = req.body;
  
      if (!name || !startDate || !endDate) {
        return res.status(400).json({
          message: "Trip name, start date, and end date are required",
        });
      }
  
      if (isEndBeforeStart(startDate, endDate)) {
        return res.status(400).json({
          message: "End date must be on or after start date",
        });
      }
  
      await connection.beginTransaction();
  
      const [existingTrips] = await connection.execute(
        `SELECT tripId, startDate, endDate,
                destinationCity, destinationCountry, destinationTimezone
         FROM Trips
         WHERE tripId = ? AND createdBy = ?`,
        [tripId, req.user.userId]
      );
  
      if (existingTrips.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Trip not found" });
      }
  
      const previous = existingTrips[0];
      const changedDestination =
        (previous.destinationCity || null) !== (destinationCity || null) ||
        (previous.destinationCountry || null) !== (destinationCountry || null) ||
        (previous.destinationTimezone || null) !== (destinationTimezone || null);
  
      await connection.execute(
        `UPDATE Trips
         SET name = ?,
             description = ?,
             startDate = ?,
             endDate = ?,
             destinationCity = ?,
             destinationCountry = ?,
             destinationTimezone = ?,
             visibility = ?
         WHERE tripId = ?`,
        [
          name.trim(),
          description || null,
          startDate,
          endDate,
          destinationCity || null,
          destinationCountry || null,
          destinationTimezone || null,
          visibility || "Private",
          tripId,
        ]
      );
  
      await connection.execute(
        `INSERT INTO TripDetails (tripId, tripType, collaborators, tripImage)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           tripType = VALUES(tripType),
           collaborators = VALUES(collaborators),
           tripImage = VALUES(tripImage)`,
        [
          tripId,
          tripType || (visibility === "Friends" ? "group" : "solo"),
          collaborators || null,
          tripImage || null,
        ]
      );
  
      const nextDates = new Set(eachDate(startDate, endDate));
  
      const [existingDays] = await connection.execute(
        `SELECT itineraryDayId, date
         FROM ItineraryDays
         WHERE tripId = ?`,
        [tripId]
      );
  
      const existingDateToDay = new Map(
        existingDays
          .filter((d) => d.date)
          .map((d) => [normalizeDateOnly(d.date), d])
      );
  
      const daysToRemove = existingDays.filter((d) => {
        const key = normalizeDateOnly(d.date);
        return key && !nextDates.has(key);
      });
  
      if (daysToRemove.length > 0) {
        const dayIds = daysToRemove.map((d) => d.itineraryDayId);
        const placeholders = dayIds.map(() => "?").join(",");
        const [items] = await connection.execute(
          `SELECT itineraryDayId, COUNT(*) AS itemCount
           FROM ItineraryItems
           WHERE itineraryDayId IN (${placeholders})
           GROUP BY itineraryDayId`,
          dayIds
        );
  
        const dayIdWithItems = new Set(
          items.filter((r) => Number(r.itemCount) > 0).map((r) => r.itineraryDayId)
        );
  
        if (dayIdWithItems.size > 0) {
          await connection.rollback();
          return res.status(400).json({
            message:
              "Cannot shrink trip dates because some itinerary days outside the new range still have items. Remove or move those items first.",
          });
        }
  
        await connection.execute(
          `DELETE FROM ItineraryDays
           WHERE itineraryDayId IN (${placeholders})`,
          dayIds
        );
      }
  
      for (const date of nextDates) {
        if (existingDateToDay.has(date)) continue;
  
        await connection.execute(
          `INSERT INTO ItineraryDays (itineraryDayId, tripId, date)
           VALUES (?, ?, ?)`,
          [crypto.randomUUID(), tripId, date]
        );
      }
  
      await createAuditLog(
        {
          userId: req.user.userId,
          tripId,
          entityType: "Trip",
          entityId: tripId,
          action: "Updated",
          beforeState: {
            startDate: previous.startDate,
            endDate: previous.endDate,
            destinationCity: previous.destinationCity,
            destinationCountry: previous.destinationCountry,
            destinationTimezone: previous.destinationTimezone,
          },
          afterState: {
            name: name.trim(),
            description: description || null,
            startDate,
            endDate,
            destinationCity: destinationCity || null,
            destinationCountry: destinationCountry || null,
            destinationTimezone: destinationTimezone || null,
            visibility: visibility || "Private",
            tripType:
              tripType || (visibility === "Friends" ? "group" : "solo"),
          },
          metadata: {
            changedDestination,
            removedItineraryDays: daysToRemove.length,
            totalItineraryDays: nextDates.size,
          },
          ipAddress: req.ip,
        },
        connection
      );
  
      await connection.commit();
  
      const actor = await resolveActor(req.user.userId);
      emitToTrip(tripId, "trip:updated", { tripId, actor, changedDestination });
  
      res.json({ message: "Trip updated" });
    } catch (error) {
      await connection.rollback();
      console.error("Update trip error:", error);
      res.status(500).json({
        message: "Failed to update trip",
        detail: process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    } finally {
      connection.release();
    }
  });
  
  router.delete("/api/trips/:tripId", authenticateUser, async (req, res) => {
    const connection = await db.getConnection();
  
    try {
      const { tripId } = req.params;
  
      await connection.beginTransaction();
  
      const [tripRows] = await connection.execute(
        `SELECT
           t.tripId,
           t.name,
           t.description,
           t.startDate,
           t.endDate,
           t.destinationCity,
           t.destinationCountry,
           t.destinationTimezone,
           t.visibility,
           d.tripType
         FROM Trips t
         LEFT JOIN TripDetails d ON d.tripId = t.tripId
         WHERE t.tripId = ?
           AND t.createdBy = ?
         LIMIT 1`,
        [tripId, req.user.userId]
      );
  
      if (tripRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Trip not found" });
      }
  
      const tripBeforeDelete = tripRows[0];
  
      const [memberRows] = await connection.execute(
        `SELECT userId
         FROM TripMembers
         WHERE tripId = ?
           AND status = 'Active'`,
        [tripId]
      );
  
      await createAuditLog(
        {
          userId: req.user.userId,
          tripId,
          entityType: "Trip",
          entityId: tripId,
          action: "Deleted",
          beforeState: tripBeforeDelete,
          afterState: null,
          metadata: {
            activeMemberCount: memberRows.length,
          },
          ipAddress: req.ip,
        },
        connection
      );
  
      await connection.execute(
        `DELETE FROM Trips
         WHERE tripId = ?`,
        [tripId]
      );
  
      await connection.commit();
  
      const actor = await resolveActor(req.user.userId);
  
      emitToTrip(tripId, "trip:deleted", {
        tripId,
        actor,
      });
  
      memberRows.forEach((member) => {
        emitToUser(member.userId, "trip:deleted", {
          tripId,
          actor,
        });
      });
  
      return res.json({ message: "Trip deleted" });
    } catch (error) {
      await connection.rollback();
      console.error("Delete trip error:", error);
  
      return res.status(500).json({
        message: "Failed to delete trip",
        detail:
          process.env.NODE_ENV === "production"
            ? undefined
            : error.message,
      });
    } finally {
      connection.release();
    }
  });
  

  return router;
}

module.exports = { createTripRouter };

