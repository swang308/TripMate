const express = require("express");
const crypto = require("node:crypto");

const db = require("../../db/connection");
const { authenticateUser } = require("../../middleware/authenticateUser");
const { userCanAccessTrip, userCanManageTrip } = require("../trips/trip.permissions");
const { createAuditLog } = require("../../services/audit.service");
const { createNotification } = require("../../services/notification.service");
const { emitToTrip, emitToUser } = require("../../realtime/io");

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function displayNameFromRow(row) {
  if (!row) return "Traveler";
  return (
    row.displayName ||
    [row.firstName, row.lastName].filter(Boolean).join(" ").trim() ||
    row.email ||
    "Traveler"
  );
}

async function syncTripCollaborators(tripId, connection = db) {
  const [rows] = await connection.execute(
    `SELECT p.displayName, u.firstName, u.lastName, u.email
     FROM TripMembers tm
     INNER JOIN Trips t ON t.tripId = tm.tripId
     INNER JOIN Users u ON u.userId = tm.userId
     LEFT JOIN Profiles p ON p.userId = u.userId
     WHERE tm.tripId = ?
       AND tm.status = 'Active'
       AND tm.userId <> t.createdBy
     ORDER BY tm.joinedAt ASC`,
    [tripId]
  );

  const collaborators = rows
    .map((row) => displayNameFromRow(row))
    .filter(Boolean)
    .join(" | ");

  const [pendingInvitationRows] = await connection.execute(
    `SELECT COUNT(*) AS pendingCount
     FROM Invitations
     WHERE tripId = ?
       AND status = 'Pending'`,
    [tripId]
  );
  const tripType = rows.length > 0 || Number(pendingInvitationRows[0]?.pendingCount) > 0
    ? "group"
    : "solo";

  await connection.execute(
    `INSERT INTO TripDetails (tripId, collaborators, tripType)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       collaborators = VALUES(collaborators),
       tripType = VALUES(tripType)`,
    [tripId, collaborators || null, tripType]
  );

  return collaborators;
}

// Resolve a friendly name for realtime "updated by X" notifications.

async function loadTripGroup(tripId, currentUserId, connection = db) {
  const [tripRows] = await connection.execute(
    `SELECT
       t.tripId AS id,
       t.name AS title,
       t.description,
       t.destinationCity AS destination,
       t.destinationCountry,
       t.destinationTimezone,
       t.startDate,
       t.endDate,
       t.visibility,
       d.collaborators,
       t.createdBy AS ownerId,
       p.displayName AS ownerName
     FROM Trips t
     LEFT JOIN TripDetails d ON d.tripId = t.tripId
     LEFT JOIN Profiles p ON p.userId = t.createdBy
     WHERE t.tripId = ?
     LIMIT 1`,
    [tripId]
  );

  if (tripRows.length === 0) return null;

  const canManage = await userCanManageTrip(currentUserId, tripId, connection);

  const [memberRows] = await connection.execute(
    `SELECT
       tm.userId,
       tm.role,
       tm.status,
       tm.joinedAt,
       u.email,
       u.firstName,
       u.lastName,
       p.displayName
     FROM TripMembers tm
     INNER JOIN Users u ON u.userId = tm.userId
     LEFT JOIN Profiles p ON p.userId = u.userId
     WHERE tm.tripId = ?
       AND tm.status = 'Active'
     ORDER BY CASE WHEN tm.role = 'Owner' THEN 0 ELSE 1 END, tm.joinedAt ASC`,
    [tripId]
  );

  const members = memberRows.map((row) => ({
    id: row.userId,
    userId: row.userId,
    name: displayNameFromRow(row),
    ...(canManage || row.userId === currentUserId ? { email: row.email } : {}),
    role: row.role,
    isOwner: row.role === "Owner",
    joinedAt: row.joinedAt,
  }));

  let invitations = [];
  if (canManage) {
    const [invitationRows] = await connection.execute(
      `SELECT invitationId AS id, inviteeEmail, role, status, createdAt, expiresAt
       FROM Invitations
       WHERE tripId = ?
         AND status = 'Pending'
       ORDER BY createdAt DESC`,
      [tripId]
    );
    invitations = invitationRows;
  }

  return {
    trip: tripRows[0],
    members,
    invitations,
    canManage,
  };
}


function createGroupRouter({ resolveActor }) {
  const router = express.Router();

  router.get("/api/trips/:tripId/group", authenticateUser, async (req, res) => {
    try {
      const { tripId } = req.params;
  
      const canAccess = await userCanAccessTrip(req.user.userId, tripId);
      if (!canAccess) {
        return res.status(404).json({ message: "Trip not found" });
      }
  
      const group = await loadTripGroup(tripId, req.user.userId);
      if (!group) {
        return res.status(404).json({ message: "Trip not found" });
      }
  
      return res.json(group);
    } catch (error) {
      console.error("Get trip group error:", error);
      return res.status(500).json({ message: "Failed to load trip group" });
    }
  });
  
  router.post("/api/trips/:tripId/invitations", authenticateUser, async (req, res) => {
    const connection = await db.getConnection();
  
    try {
      const { tripId } = req.params;
      const { email, role, message } = req.body;
      const inviteeEmail = normalizeEmail(email);
      const inviteRole = role === "Viewer" ? "Viewer" : "Editor";
  
      if (!isValidEmail(inviteeEmail)) {
        return res.status(400).json({ message: "A valid email address is required" });
      }
  
      await connection.beginTransaction();
  
      const canManage = await userCanManageTrip(req.user.userId, tripId, connection);
      if (!canManage) {
        await connection.rollback();
        return res.status(404).json({ message: "Trip not found" });
      }
  
      if (inviteeEmail === normalizeEmail(req.user.email)) {
        await connection.rollback();
        return res.status(400).json({ message: "You are already part of this trip" });
      }
  
      const [tripRows] = await connection.execute(
        `SELECT name FROM Trips WHERE tripId = ? LIMIT 1`,
        [tripId]
      );
  
      const [existingUsers] = await connection.execute(
        `SELECT tm.userId AS memberUserId
         FROM Users u
         LEFT JOIN TripMembers tm
           ON tm.userId = u.userId
          AND tm.tripId = ?
          AND tm.status = 'Active'
         WHERE u.email = ?
         LIMIT 1`,
        [tripId, inviteeEmail]
      );
  
      if (existingUsers.length > 0 && existingUsers[0].memberUserId) {
        await connection.rollback();
        return res.status(409).json({ message: "That traveler is already in the group" });
      }
  
      const [pendingInvitations] = await connection.execute(
        `SELECT invitationId
         FROM Invitations
         WHERE tripId = ?
           AND inviteeEmail = ?
           AND status = 'Pending'
         LIMIT 1`,
        [tripId, inviteeEmail]
      );
  
      if (pendingInvitations.length > 0) {
        await connection.rollback();
        return res.status(409).json({ message: "An invitation is already pending for this email" });
      }
  
      const invitationId = crypto.randomUUID();
      const invitationToken = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  
      await connection.execute(
        `INSERT INTO Invitations (
           invitationId, tripId, inviterUserId, inviteeEmail, role,
           status, invitationToken, message, expiresAt
         )
         VALUES (?, ?, ?, ?, ?, 'Pending', ?, ?, ?)`,
        [
          invitationId,
          tripId,
          req.user.userId,
          inviteeEmail,
          inviteRole,
          invitationToken,
          message || null,
          expiresAt,
        ]
      );
  
      const [inviteeUsers] = await connection.execute(
        `SELECT userId FROM Users WHERE email = ? LIMIT 1`,
        [inviteeEmail]
      );
  
      if (inviteeUsers.length > 0) {
        await createNotification(
          inviteeUsers[0].userId,
          tripId,
          "trip_invitation",
          "Trip invitation",
          `You were invited to join "${tripRows[0]?.name || "a trip"}" as ${inviteRole}.`,
          connection
        );
      }
  
      await createAuditLog(
        {
          userId: req.user.userId,
          tripId,
          entityType: "Invitation",
          entityId: invitationId,
          action: "Created",
          afterState: { inviteeEmail, role: inviteRole, status: "Pending" },
          ipAddress: req.ip,
        },
        connection
      );
  
      await syncTripCollaborators(tripId, connection);
  
      await connection.commit();
  
      if (inviteeUsers.length > 0) {
        emitToUser(inviteeUsers[0].userId, "invitation:created", {
          invitationId,
          tripId,
          inviteeEmail,
          role: inviteRole,
        });
      }
  
      return res.status(201).json({
        message: "Invitation created",
        invitation: {
          id: invitationId,
          inviteeEmail,
          role: inviteRole,
          status: "Pending",
          createdAt: new Date().toISOString(),
          expiresAt: expiresAt.toISOString(),
        },
      });
    } catch (error) {
      await connection.rollback();
      console.error("Create invitation error:", error);
      return res.status(500).json({
        message: "Failed to create invitation",
        detail: process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    } finally {
      connection.release();
    }
  });
  
  router.delete("/api/trips/:tripId/invitations/:invitationId", authenticateUser, async (req, res) => {
    const connection = await db.getConnection();
  
    try {
      const { tripId, invitationId } = req.params;
  
      await connection.beginTransaction();
  
      const canManage = await userCanManageTrip(req.user.userId, tripId, connection);
      if (!canManage) {
        await connection.rollback();
        return res.status(404).json({ message: "Trip not found" });
      }
  
      const [rows] = await connection.execute(
        `SELECT invitationId, inviteeEmail, role, status
         FROM Invitations
         WHERE invitationId = ? AND tripId = ?
         LIMIT 1`,
        [invitationId, tripId]
      );
  
      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Invitation not found" });
      }
  
      if (rows[0].status !== "Pending") {
        await connection.rollback();
        return res.status(400).json({ message: "Only pending invitations can be cancelled" });
      }
  
      await connection.execute(
        `DELETE FROM Invitations
        WHERE invitationId = ? AND tripId = ?`,
        [invitationId, tripId]
      );
  
      await createAuditLog(
        {
          userId: req.user.userId,
          tripId,
          entityType: "Invitation",
          entityId: invitationId,
          action: "Cancelled",
          beforeState: rows[0],
          afterState: { ...rows[0], status: "Cancelled" },
          ipAddress: req.ip,
        },
        connection
      );
  
      await syncTripCollaborators(tripId, connection);
  
      await connection.commit();
      return res.json({ message: "Invitation cancelled" });
    } catch (error) {
      await connection.rollback();
      console.error("Cancel invitation error:", error);
      return res.status(500).json({ message: "Failed to cancel invitation" });
    } finally {
      connection.release();
    }
  });
  
  router.patch("/api/trips/:tripId/members/:memberUserId", authenticateUser, async (req, res) => {
    const connection = await db.getConnection();
  
    try {
      const { tripId, memberUserId } = req.params;
      const { role } = req.body;
  
      if (!["Editor", "Viewer"].includes(role)) {
        return res.status(400).json({ message: "Role must be Editor or Viewer" });
      }
  
      if (memberUserId === req.user.userId) {
        return res.status(400).json({ message: "You cannot change your own role" });
      }
  
      await connection.beginTransaction();
  
      const canManage = await userCanManageTrip(req.user.userId, tripId, connection);
      if (!canManage) {
        await connection.rollback();
        return res.status(404).json({ message: "Trip not found" });
      }
  
      const [rows] = await connection.execute(
        `SELECT role, status
         FROM TripMembers
         WHERE tripId = ? AND userId = ?
         LIMIT 1`,
        [tripId, memberUserId]
      );
  
      if (rows.length === 0 || rows[0].status !== "Active") {
        await connection.rollback();
        return res.status(404).json({ message: "Member not found" });
      }
  
      if (rows[0].role === "Owner") {
        await connection.rollback();
        return res.status(400).json({ message: "Owner role cannot be changed" });
      }
  
      await connection.execute(
        `UPDATE TripMembers
         SET role = ?
         WHERE tripId = ? AND userId = ? AND status = 'Active'`,
        [role, tripId, memberUserId]
      );
  
      await createAuditLog(
        {
          userId: req.user.userId,
          tripId,
          entityType: "TripMember",
          entityId: memberUserId,
          action: "RoleChanged",
          beforeState: { role: rows[0].role },
          afterState: { role },
          ipAddress: req.ip,
        },
        connection
      );
  
      await connection.commit();
  
      const actor = await resolveActor(req.user.userId);
      emitToTrip(tripId, "member:roleChanged", {
        tripId,
        actor,
        memberUserId,
        role,
        previousRole: rows[0].role,
      });
  
      return res.json({ message: "Member role updated" });
    } catch (error) {
      await connection.rollback();
      console.error("Update member role error:", error);
      return res.status(500).json({ message: "Failed to update member role" });
    } finally {
      connection.release();
    }
  });
  
  router.delete("/api/trips/:tripId/members/:memberUserId", authenticateUser, async (req, res) => {
    const connection = await db.getConnection();
  
    try {
      const { tripId, memberUserId } = req.params;
  
      await connection.beginTransaction();
  
      const canManage = await userCanManageTrip(req.user.userId, tripId, connection);
      if (!canManage) {
        await connection.rollback();
        return res.status(404).json({ message: "Trip not found" });
      }
  
      if (memberUserId === req.user.userId) {
        await connection.rollback();
        return res.status(400).json({ message: "Owner cannot remove themselves" });
      }
  
      const [rows] = await connection.execute(
        `SELECT role, status
         FROM TripMembers
         WHERE tripId = ? AND userId = ?
         LIMIT 1`,
        [tripId, memberUserId]
      );
  
      if (rows.length === 0 || rows[0].status !== "Active") {
        await connection.rollback();
        return res.status(404).json({ message: "Member not found" });
      }
  
      if (rows[0].role === "Owner") {
        await connection.rollback();
        return res.status(400).json({ message: "Owner cannot be removed" });
      }
  
      await connection.execute(
        `UPDATE TripMembers
         SET status = 'Removed'
         WHERE tripId = ? AND userId = ?`,
        [tripId, memberUserId]
      );
  
      await syncTripCollaborators(tripId, connection);
  
      await createAuditLog(
        {
          userId: req.user.userId,
          tripId,
          entityType: "TripMember",
          entityId: memberUserId,
          action: "Removed",
          beforeState: rows[0],
          afterState: { role: rows[0].role, status: "Removed" },
          ipAddress: req.ip,
        },
        connection
      );
  
      await connection.commit();
  
      const actor = await resolveActor(req.user.userId);
      emitToTrip(tripId, "trip:updated", { tripId, actor, changedDestination: false });
  
      emitToUser(memberUserId, "trip:updated", {
    tripId,
    actor,
    changedDestination: false,
  });
  
  emitToUser(memberUserId, "member:removed", {
    tripId,
    actor,
  });
  
      return res.json({ message: "Member removed" });
    } catch (error) {
      await connection.rollback();
      console.error("Remove member error:", error);
      return res.status(500).json({ message: "Failed to remove member" });
    } finally {
      connection.release();
    }
  });
  
  router.get("/api/invitations", authenticateUser, async (req, res) => {
    try {
      const [rows] = await db.execute(
        `SELECT
           i.invitationId AS id,
           i.tripId,
           i.inviteeEmail,
           i.role,
           i.status,
           i.createdAt,
           i.expiresAt,
           t.name AS tripTitle,
           p.displayName AS inviterName
         FROM Invitations i
         INNER JOIN Trips t ON t.tripId = i.tripId
         LEFT JOIN Profiles p ON p.userId = i.inviterUserId
         WHERE i.inviteeEmail = ?
           AND i.status = 'Pending'
         ORDER BY i.createdAt DESC`,
        [normalizeEmail(req.user.email)]
      );
  
      return res.json({ invitations: rows });
    } catch (error) {
      console.error("List invitations error:", error);
      return res.status(500).json({ message: "Failed to load invitations" });
    }
  });
  
  router.post("/api/invitations/:invitationId/respond", authenticateUser, async (req, res) => {
    const connection = await db.getConnection();
  
    try {
      const { invitationId } = req.params;
      const { action } = req.body;
  
      if (!["accept", "decline"].includes(action)) {
        return res.status(400).json({ message: "Action must be accept or decline" });
      }
  
      await connection.beginTransaction();
  
      const [rows] = await connection.execute(
        `SELECT invitationId, tripId, inviterUserId, inviteeEmail, role, status, expiresAt
         FROM Invitations
         WHERE invitationId = ?
         LIMIT 1`,
        [invitationId]
      );
  
      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Invitation not found" });
      }
  
      const invitation = rows[0];
  
      if (normalizeEmail(invitation.inviteeEmail) !== normalizeEmail(req.user.email)) {
        await connection.rollback();
        return res.status(403).json({ message: "This invitation is not for you" });
      }
  
      if (invitation.status !== "Pending") {
        await connection.rollback();
        return res.status(400).json({ message: "This invitation has already been handled" });
      }
  
      if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
        await connection.execute(
          `UPDATE Invitations
           SET status = 'Expired', respondedAt = CURRENT_TIMESTAMP
           WHERE invitationId = ?`,
          [invitationId]
        );
        await connection.commit();
        return res.status(410).json({ message: "This invitation has expired" });
      }
  
      if (action === "accept") {
        await connection.execute(
          `INSERT INTO TripMembers (tripMemberId, tripId, userId, role, status)
           VALUES (?, ?, ?, ?, 'Active')
           ON DUPLICATE KEY UPDATE
             role = VALUES(role),
             status = 'Active',
             joinedAt = CURRENT_TIMESTAMP`,
          [crypto.randomUUID(), invitation.tripId, req.user.userId, invitation.role]
        );
  
        await connection.execute(
          `DELETE FROM Invitations
          WHERE invitationId = ?`,
          [invitationId]
        );
  
        await syncTripCollaborators(invitation.tripId, connection);
  
        await createNotification(
          invitation.inviterUserId,
          invitation.tripId,
          "trip_invitation_accepted",
          "Invitation accepted",
          `${req.user.email} accepted your invitation.`,
          connection
        );
      } else {
        await connection.execute(
          `DELETE FROM Invitations
          WHERE invitationId = ?`,
          [invitationId]
        );
  
        await createNotification(
          invitation.inviterUserId,
          invitation.tripId,
          "trip_invitation_declined",
          "Invitation declined",
          `${req.user.email} declined your invitation.`,
          connection
        );
      }
  
      await createAuditLog(
        {
          userId: req.user.userId,
          tripId: invitation.tripId,
          entityType: "Invitation",
          entityId: invitationId,
          action: action === "accept" ? "Accepted" : "Declined",
          beforeState: invitation,
          afterState: { ...invitation, status: action === "accept" ? "Accepted" : "Declined" },
          ipAddress: req.ip,
        },
        connection
      );
  
      await connection.commit();
  
  const actor = await resolveActor(req.user.userId);
  
  emitToUser(invitation.inviterUserId, "trip:updated", {
    tripId: invitation.tripId,
    actor,
    changedDestination: false,
  });
  
  if (action === "accept") {
    emitToTrip(invitation.tripId, "trip:updated", {
      tripId: invitation.tripId,
      actor,
      changedDestination: false,
    });
  }
  
      return res.json({
        message: action === "accept" ? "Invitation accepted" : "Invitation declined",
      });
    } catch (error) {
      await connection.rollback();
      console.error("Respond invitation error:", error);
      return res.status(500).json({ message: "Failed to respond to invitation" });
    } finally {
      connection.release();
    }
  });
  

  return router;
}

module.exports = { createGroupRouter };

