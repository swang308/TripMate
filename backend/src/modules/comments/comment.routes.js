const express = require("express");
const crypto = require("node:crypto");

const db = require("../../db/connection");
const { authenticateUser } = require("../../middleware/authenticateUser");
const { userCanAccessTrip } = require("../trips/trip.permissions");
const { createAuditLog } = require("../../services/audit.service");
const { emitToTrip } = require("../../realtime/io");

const router = express.Router();

// Trip-level comments (itemId optional for future expansion)
router.get("/api/trips/:tripId/comments", authenticateUser, async (req, res) => {
  try {
    const { tripId } = req.params;
    const { itemId } = req.query;

    const canAccess = await userCanAccessTrip(req.user.userId, tripId);
    if (!canAccess) {
      return res.status(404).json({ message: "Trip not found" });
    }

    const [comments] = await db.execute(
      `SELECT
         c.commentId AS id,
         c.tripId,
         c.itemId,
         c.userId,
         c.commentText,
         c.createdAt,
         c.updatedAt,
         p.displayName,
         p.avatarUrl
       FROM Comments c
       LEFT JOIN Profiles p ON p.userId = c.userId
       WHERE c.tripId = ?
         AND (${itemId ? "c.itemId = ?" : "c.itemId IS NULL"})
       ORDER BY c.createdAt ASC`,
      itemId ? [tripId, itemId] : [tripId]
    );

    res.json({ comments });
  } catch (error) {
    console.error("Get comments error:", error);
    res.status(500).json({ message: "Failed to load comments" });
  }
});

router.post("/api/trips/:tripId/comments", authenticateUser, async (req, res) => {
    const connection = await db.getConnection();

    try {
      const { tripId } = req.params;
      const { commentText, itemId } = req.body;
      const userId = req.user.userId;
      const trimmedComment = String(commentText || "").trim();

      if (!trimmedComment) {
        return res.status(400).json({
          message: "commentText is required",
        });
      }

      await connection.beginTransaction();

      const canAccess = await userCanAccessTrip(
        userId,
        tripId,
        connection
      );

      if (!canAccess) {
        await connection.rollback();
        return res.status(404).json({
          message: "Trip not found",
        });
      }

      const commentId = crypto.randomUUID();

      await connection.execute(
        `INSERT INTO Comments (
           commentId,
           tripId,
           itemId,
           userId,
           commentText
         )
         VALUES (?, ?, ?, ?, ?)`,
        [
          commentId,
          tripId,
          itemId || null,
          userId,
          trimmedComment,
        ]
      );

      const [rows] = await connection.execute(
        `SELECT
           c.commentId AS id,
           c.tripId,
           c.itemId,
           c.userId,
           c.commentText,
           c.createdAt,
           c.updatedAt,
           p.displayName,
           p.avatarUrl
         FROM Comments c
         LEFT JOIN Profiles p ON p.userId = c.userId
         WHERE c.commentId = ?
         LIMIT 1`,
        [commentId]
      );

      const createdComment = rows[0];

      await createAuditLog(
        {
          userId,
          tripId,
          entityType: "Comment",
          entityId: commentId,
          action: "Created",
          afterState: {
            commentId,
            tripId,
            itemId: itemId || null,
            userId,
            commentText: trimmedComment,
          },
          ipAddress: req.ip,
        },
        connection
      );

      await connection.commit();

      emitToTrip(tripId, "comment:created", {
        tripId,
        comment: createdComment,
      });

      return res.status(201).json({
        comment: createdComment,
      });
    } catch (error) {
      await connection.rollback();
      console.error("Create comment error:", error);

      return res.status(500).json({
        message: "Failed to add comment",
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

router.put("/api/comments/:commentId", authenticateUser, async (req, res) => {
    const connection = await db.getConnection();

    try {
      const { commentId } = req.params;
      const userId = req.user.userId;
      const trimmedComment = String(req.body?.commentText || "").trim();

      if (!trimmedComment) {
        return res.status(400).json({
          message: "commentText is required",
        });
      }

      await connection.beginTransaction();

      const [existingRows] = await connection.execute(
        `SELECT
           commentId,
           tripId,
           itemId,
           userId,
           commentText,
           createdAt,
           updatedAt
         FROM Comments
         WHERE commentId = ?
         LIMIT 1`,
        [commentId]
      );

      if (existingRows.length === 0) {
        await connection.rollback();

        return res.status(404).json({
          message: "Comment not found",
        });
      }

      const existingComment = existingRows[0];

      if (String(existingComment.userId) !== String(userId)) {
        await connection.rollback();

        return res.status(403).json({
          message: "Not allowed to edit this comment",
        });
      }

      const canAccess = await userCanAccessTrip(
        userId,
        existingComment.tripId,
        connection
      );

      if (!canAccess) {
        await connection.rollback();

        return res.status(404).json({
          message: "Comment not found",
        });
      }

      await connection.execute(
        `UPDATE Comments
         SET commentText = ?,
             updatedAt = CURRENT_TIMESTAMP
         WHERE commentId = ?`,
        [trimmedComment, commentId]
      );

      const [updatedRows] = await connection.execute(
        `SELECT
           c.commentId AS id,
           c.tripId,
           c.itemId,
           c.userId,
           c.commentText,
           c.createdAt,
           c.updatedAt,
           p.displayName,
           p.avatarUrl
         FROM Comments c
         LEFT JOIN Profiles p ON p.userId = c.userId
         WHERE c.commentId = ?
         LIMIT 1`,
        [commentId]
      );

      const updatedComment = updatedRows[0];

      await createAuditLog(
        {
          userId,
          tripId: existingComment.tripId,
          entityType: "Comment",
          entityId: commentId,
          action: "Updated",
          beforeState: {
            commentId: existingComment.commentId,
            tripId: existingComment.tripId,
            itemId: existingComment.itemId,
            userId: existingComment.userId,
            commentText: existingComment.commentText,
          },
          afterState: {
            commentId,
            tripId: existingComment.tripId,
            itemId: existingComment.itemId,
            userId,
            commentText: trimmedComment,
          },
          ipAddress: req.ip,
        },
        connection
      );

      await connection.commit();

      emitToTrip(existingComment.tripId, "comment:updated", {
        tripId: existingComment.tripId,
        comment: updatedComment,
      });

      return res.json({
        comment: updatedComment,
      });
    } catch (error) {
      await connection.rollback();
      console.error("Edit comment error:", error);

      return res.status(500).json({
        message: "Failed to edit comment",
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

router.delete("/api/comments/:commentId", authenticateUser, async (req, res) => {
    const connection = await db.getConnection();

    try {
      const { commentId } = req.params;
      const userId = req.user.userId;

      await connection.beginTransaction();

      const [existingRows] = await connection.execute(
        `SELECT
           commentId,
           tripId,
           itemId,
           userId,
           commentText,
           createdAt,
           updatedAt
         FROM Comments
         WHERE commentId = ?
         LIMIT 1`,
        [commentId]
      );

      if (existingRows.length === 0) {
        await connection.rollback();

        return res.status(404).json({
          message: "Comment not found",
        });
      }

      const existingComment = existingRows[0];

      if (String(existingComment.userId) !== String(userId)) {
        await connection.rollback();

        return res.status(403).json({
          message: "Not allowed to delete this comment",
        });
      }

      const canAccess = await userCanAccessTrip(
        userId,
        existingComment.tripId,
        connection
      );

      if (!canAccess) {
        await connection.rollback();

        return res.status(404).json({
          message: "Comment not found",
        });
      }

      await createAuditLog(
        {
          userId,
          tripId: existingComment.tripId,
          entityType: "Comment",
          entityId: commentId,
          action: "Deleted",
          beforeState: {
            commentId: existingComment.commentId,
            tripId: existingComment.tripId,
            itemId: existingComment.itemId,
            userId: existingComment.userId,
            commentText: existingComment.commentText,
          },
          afterState: null,
          ipAddress: req.ip,
        },
        connection
      );

      await connection.execute(
        `DELETE FROM Comments
         WHERE commentId = ?`,
        [commentId]
      );

      await connection.commit();

      emitToTrip(existingComment.tripId, "comment:deleted", {
        tripId: existingComment.tripId,
        commentId,
      });

      return res.json({
        message: "Comment deleted",
      });
    } catch (error) {
      await connection.rollback();
      console.error("Delete comment error:", error);

      return res.status(500).json({
        message: "Failed to delete comment",
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

module.exports = router;

