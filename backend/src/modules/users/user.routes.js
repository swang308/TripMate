const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");

const db = require("../../db/connection");
const { getJwtSecret, getJwtExpiresIn } = require("../../config/jwt");
const { authenticateUser } = require("../../middleware/authenticateUser");

const router = express.Router();

function serializeCurrentUser(user) {
  return {
    id: user.userId,
    userId: user.userId,
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    displayName: user.displayName || "",
    avatar: user.avatarUrl || "",
    avatarUrl: user.avatarUrl || "",
    locale: user.locale || "",
    ...(user.email ? { email: user.email } : {}),
  };
}

function createSessionResponse(user) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    {
      userId: user.userId,
      email: user.email,
    },
    getJwtSecret(),
    { expiresIn: getJwtExpiresIn() }
  );
  const decoded = jwt.decode(token) || {};

  return {
    token,
    session: {
      issuedAt: decoded.iat || nowSeconds,
      expiresAt: decoded.exp || nowSeconds,
    },
    user: serializeCurrentUser(user),
  };
}


router.post("/api/users/register", async (req, res) => {
  try {
    const { firstName, lastName, username, email, password } = req.body;

    if (!email || !password || (!firstName && !username)) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const [existingUsers] = await db.execute(
      "SELECT userId FROM Users WHERE email = ?",
      [normalizedEmail]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const userId = crypto.randomUUID();
    const profileId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);

    const savedFirstName = firstName || username;
    const savedLastName = lastName || "";
    const displayName = username || `${savedFirstName} ${savedLastName}`.trim();

    await db.execute(
      `INSERT INTO Users (userId, firstName, lastName, email, passwordHash)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, savedFirstName, savedLastName, normalizedEmail, passwordHash]
    );

    await db.execute(
      `INSERT INTO Profiles (profileId, userId, displayName)
       VALUES (?, ?, ?)`,
      [profileId, userId, displayName]
    );

    res.status(201).json({
      message: "User registered successfully",
      user: serializeCurrentUser({
        userId,
        email: normalizedEmail,
        firstName: savedFirstName,
        lastName: savedLastName,
        displayName,
      }),
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      message: "Registration failed",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message,
    });
  }
});

router.post("/api/users/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const [users] = await db.execute(
      `SELECT
         u.userId,
         u.firstName,
         u.lastName,
         u.email,
         u.passwordHash,
         p.displayName,
         p.avatarUrl
       FROM Users u
       LEFT JOIN Profiles p ON p.userId = u.userId
       WHERE u.email = ?`,
      [normalizedEmail]
    );

    if (users.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = users[0];
    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    await db.execute(
      "UPDATE Users SET lastLoginAt = CURRENT_TIMESTAMP WHERE userId = ?",
      [user.userId]
    );

    res.json({
      message: "Login successful",
      ...createSessionResponse(user),
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      message: "Login failed",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message,
    });
  }
});

router.post("/api/users/account-recovery", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const [users] = await db.execute(
      "SELECT userId FROM Users WHERE email = ?",
      [normalizedEmail]
    );

    if (users.length === 0) {
      return res.status(404).json({
        message: "No account found for that email",
      });
    }

    res.json({
      message: "Account found",
    });
  } catch (error) {
    console.error("Account recovery error:", error);

    res.status(500).json({
      message: "Account recovery failed",
      detail:
        process.env.NODE_ENV === "production"
          ? undefined
          : error.message,
    });
  }
});

router.post("/api/users/reset-password", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const [users] = await db.execute(
      "SELECT userId FROM Users WHERE email = ?",
      [normalizedEmail]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: "No account found for that email" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await db.execute(
      "UPDATE Users SET passwordHash = ? WHERE userId = ?",
      [passwordHash, users[0].userId]
    );

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      message: "Password reset failed",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message,
    });
  }
});


router.get("/api/users/me", authenticateUser, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT
         u.userId,
         u.firstName,
         u.lastName,
         u.email,
         p.displayName,
         p.avatarUrl,
         p.locale
       FROM Users u
       LEFT JOIN Profiles p ON p.userId = u.userId
       WHERE u.userId = ?
       LIMIT 1`,
      [req.user.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = rows[0];
    return res.json({
      user: serializeCurrentUser(user),
    });
  } catch (error) {
    console.error("Get current user error:", error);
    return res.status(500).json({ message: "Failed to load profile" });
  }
});

router.put("/api/users/me", authenticateUser, async (req, res) => {
  const connection = await db.getConnection();

  try {
    const {
      firstName,
      lastName,
      displayName,
      username,
      avatar,
      avatarUrl,
      locale,
    } = req.body;

    const nextFirstName = String(firstName || "").trim();
    const nextLastName = String(lastName || "").trim();
    const nextDisplayName = String(displayName || username || nextFirstName || "").trim();
    const nextAvatarUrl = String(avatarUrl || avatar || "");

    await connection.beginTransaction();

    if (nextFirstName || nextLastName) {
      await connection.execute(
        `UPDATE Users
         SET firstName = COALESCE(NULLIF(?, ''), firstName),
             lastName = COALESCE(?, lastName)
         WHERE userId = ?`,
        [nextFirstName, nextLastName, req.user.userId]
      );
    }

    await connection.execute(
      `INSERT INTO Profiles (profileId, userId, displayName, avatarUrl, locale)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         displayName = COALESCE(NULLIF(VALUES(displayName), ''), displayName),
         avatarUrl = VALUES(avatarUrl),
         locale = COALESCE(VALUES(locale), locale)`,
      [
        crypto.randomUUID(),
        req.user.userId,
        nextDisplayName || null,
        nextAvatarUrl || null,
        locale || null,
      ]
    );

    const [rows] = await connection.execute(
      `SELECT
         u.userId,
         u.firstName,
         u.lastName,
         u.email,
         p.displayName,
         p.avatarUrl,
         p.locale
       FROM Users u
       LEFT JOIN Profiles p ON p.userId = u.userId
       WHERE u.userId = ?
       LIMIT 1`,
      [req.user.userId]
    );

    await connection.commit();

    const user = rows[0];
    return res.json({
      message: "Profile updated",
      user: serializeCurrentUser(user),
    });
  } catch (error) {
    await connection.rollback();
    console.error("Update current user error:", error);
    return res.status(500).json({
      message: "Failed to update profile",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message,
    });
  } finally {
    connection.release();
  }
});

// Delete the authenticated user's account and all their data.
router.delete("/api/users/me", authenticateUser, async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Expenses.paidBy is ON DELETE RESTRICT, so clear those rows first
    // (own-trip expenses would cascade anyway; this also covers expenses the
    // user paid in trips owned by others). Everything else on Users cascades
    // or is set null.
    await connection.execute(`DELETE FROM Expenses WHERE paidBy = ?`, [
      req.user.userId,
    ]);

    const [result] = await connection.execute(
      `DELETE FROM Users WHERE userId = ?`,
      [req.user.userId]
    );

    await connection.commit();

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Account not found" });
    }

    return res.json({ message: "Account deleted" });
  } catch (error) {
    await connection.rollback();
    console.error("Delete account error:", error);
    return res.status(500).json({
      message: "Failed to delete account",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message,
    });
  } finally {
    connection.release();
  }
});


module.exports = router;

