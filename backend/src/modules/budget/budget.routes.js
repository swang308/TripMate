const express = require("express");
const crypto = require("node:crypto");
const db = require("../../db/connection");
const { authenticateUser } = require("../../middleware/authenticateUser");
const { userCanAccessTrip, userCanEditTrip } = require("../trips/trip.permissions");
const { createAuditLog } = require("../../services/audit.service");
const { emitToTrip } = require("../../realtime/io");

function displayNameFromRow(row) {
  if (!row) return "Traveler";
  return row.displayName || [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || row.email || "Traveler";
}

function normalizeBudgetParticipants(participants, fallbackMembers) {
  const unique = [];
  const seen = new Set();

  (Array.isArray(participants) ? participants : []).forEach((participant) => {
    const trimmed = String(participant || "").trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) return;
    seen.add(key);
    unique.push(trimmed);
  });

  if (unique.length > 0) return unique;
  return Array.isArray(fallbackMembers) ? fallbackMembers.filter(Boolean) : [];
}

async function loadTripMembersForBudget(tripId, connection = db) {
  const [tripRows] = await connection.execute(
    `SELECT t.createdBy, p.displayName AS ownerName, u.firstName, u.lastName, u.email
     FROM Trips t
     LEFT JOIN Users u ON u.userId = t.createdBy
     LEFT JOIN Profiles p ON p.userId = t.createdBy
     WHERE t.tripId = ?
     LIMIT 1`,
    [tripId]
  );

  const ownerName = displayNameFromRow(tripRows[0]);
  const [detailRows] = await connection.execute(
    `SELECT collaborators
     FROM TripDetails
     WHERE tripId = ?
     LIMIT 1`,
    [tripId]
  );

  const collaboratorNames = String(detailRows[0]?.collaborators || "")
    .split(/[|,\n]/)
    .map((name) => name.trim())
    .filter(Boolean);

  return Array.from(new Set([ownerName, ...collaboratorNames].filter(Boolean)));
}

async function loadTripBudget(tripId, connection = db) {
  const [detailRows] = await connection.execute(
    `SELECT budgetCurrency, budgetVersion
     FROM TripDetails
     WHERE tripId = ?
     LIMIT 1`,
    [tripId]
  );

  const [expenseRows] = await connection.execute(
    `SELECT expenseId, title, amount, currency, isShared, notes, paidByName, displayOrder
     FROM Expenses
     WHERE tripId = ?
     ORDER BY COALESCE(displayOrder, 2147483647), createdAt ASC`,
    [tripId]
  );

  const expenseIds = expenseRows.map((row) => row.expenseId);
  let shareRows = [];
  if (expenseIds.length > 0) {
    const placeholders = expenseIds.map(() => "?").join(",");
    const [rows] = await connection.execute(
      `SELECT expenseId, participantName, shareAmount
       FROM ExpenseShares
       WHERE expenseId IN (${placeholders})
       ORDER BY createdAt ASC`,
      expenseIds
    );
    shareRows = rows;
  }

  const sharesByExpense = new Map();
  shareRows.forEach((row) => {
    if (!sharesByExpense.has(row.expenseId)) sharesByExpense.set(row.expenseId, []);
    sharesByExpense.get(row.expenseId).push(row);
  });

  return {
    currency: detailRows[0]?.budgetCurrency || expenseRows[0]?.currency || "USD",
    version: Number(detailRows[0]?.budgetVersion) || 1,
    expenses: expenseRows.map((row) => ({
      id: row.expenseId,
      name: row.title || "",
      cost: Number(row.amount) || 0,
      shared: Boolean(row.isShared),
      description: row.notes || "",
      paidBy: row.paidByName || "",
      splitAmong: (sharesByExpense.get(row.expenseId) || [])
        .map((share) => share.participantName)
        .filter(Boolean),
    })),
  };
}

async function saveTripBudget(tripId, budget, connection = db) {
  const currency = typeof budget?.currency === "string" ? budget.currency : "USD";
  const expenses = Array.isArray(budget?.expenses) ? budget.expenses : [];
  const fallbackMembers = await loadTripMembersForBudget(tripId, connection);

  const [existingExpenseRows] = await connection.execute(
    `SELECT expenseId FROM Expenses WHERE tripId = ?`,
    [tripId]
  );
  const existingIds = existingExpenseRows.map((row) => row.expenseId);

  if (existingIds.length > 0) {
    const placeholders = existingIds.map(() => "?").join(",");
    await connection.execute(
      `DELETE FROM ExpenseShares WHERE expenseId IN (${placeholders})`,
      existingIds
    );
  }

  await connection.execute(`DELETE FROM Expenses WHERE tripId = ?`, [tripId]);

  for (const [index, expense] of expenses.entries()) {
    const expenseId = expense?.id || crypto.randomUUID();
    const title = String(expense?.name || "").trim() || `Expense ${index + 1}`;
    const amount = Number(expense?.cost) || 0;
    const paidByName = String(expense?.paidBy || fallbackMembers[0] || "").trim();
    const isShared = Boolean(expense?.shared);
    const splitAmong = normalizeBudgetParticipants(
      isShared ? expense?.splitAmong : [paidByName],
      isShared ? fallbackMembers : [paidByName]
    );

    await connection.execute(
      `INSERT INTO Expenses (
         expenseId, tripId, paidBy, paidByName, title, amount, currency,
         isShared, notes, displayOrder
       )
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
      [
        expenseId,
        tripId,
        paidByName || null,
        title,
        amount,
        currency,
        isShared ? 1 : 0,
        expense?.description || null,
        index,
      ]
    );

    const shareAmount = splitAmong.length > 0 ? amount / splitAmong.length : amount;
    for (const participantName of splitAmong) {
      await connection.execute(
        `INSERT INTO ExpenseShares (
           expenseShareId, expenseId, userId, participantName, shareAmount, settlementStatus
         )
         VALUES (?, ?, NULL, ?, ?, 'Pending')`,
        [crypto.randomUUID(), expenseId, participantName, shareAmount]
      );
    }
  }

  await connection.execute(
    `INSERT INTO TripDetails (tripId, budgetCurrency)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE
       budgetCurrency = VALUES(budgetCurrency),
       budgetVersion = COALESCE(budgetVersion, 1) + 1`,
    [tripId, currency]
  );

  return loadTripBudget(tripId, connection);
}


function createBudgetRouter({ resolveActor }) {
  const router = express.Router();

  router.get("/api/trips/:tripId/budget", authenticateUser, async (req, res) => {
    try {
      const { tripId } = req.params;
  
      const canAccess = await userCanAccessTrip(req.user.userId, tripId);
      if (!canAccess) {
        return res.status(404).json({ message: "Trip not found" });
      }
  
      const budget = await loadTripBudget(tripId);
      const canEdit = await userCanEditTrip(req.user.userId, tripId);
      return res.json({ budget, canEdit });
    } catch (error) {
      console.error("Get trip budget error:", error);
      return res.status(500).json({
        message: "Failed to load trip budget",
        detail: process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    }
  });
  
  router.put("/api/trips/:tripId/budget", authenticateUser, async (req, res) => {
    const connection = await db.getConnection();
  
    try {
      const { tripId } = req.params;
      const { budget, expectedVersion } = req.body || {};
      const requestedVersion = Number(expectedVersion ?? budget?.version);
  
      const canEdit = await userCanEditTrip(req.user.userId, tripId, connection);
      if (!canEdit) {
        return res.status(404).json({ message: "Trip not found" });
      }
  
      await connection.beginTransaction();
  
      const [detailRows] = await connection.execute(
        `SELECT budgetVersion
         FROM TripDetails
         WHERE tripId = ?
         FOR UPDATE`,
        [tripId]
      );
      const currentVersion = Number(detailRows[0]?.budgetVersion) || 1;
      if (!Number.isInteger(requestedVersion) || requestedVersion < 1) {
        await connection.rollback();
        return res.status(400).json({ message: "A valid budget version is required" });
      }
  
      if (requestedVersion !== currentVersion) {
    const latestBudget = await loadTripBudget(tripId, connection);
    await connection.rollback();
  
    return res.status(409).json({
      message:
        "This budget changed while you were editing. Review the latest version and try again.",
      budget: latestBudget,
    });
  }
  
  const previousBudget = await loadTripBudget(tripId, connection);
  
  const savedBudget = await saveTripBudget(
    tripId,
    budget,
    connection
  );
  
  await createAuditLog(
    {
      userId: req.user.userId,
      tripId,
      entityType: "Budget",
      entityId: tripId,
      action: "Updated",
      beforeState: previousBudget,
      afterState: savedBudget,
      metadata: {
        previousVersion: previousBudget.version,
        newVersion: savedBudget.version,
        previousExpenseCount: previousBudget.expenses.length,
        newExpenseCount: savedBudget.expenses.length,
      },
      ipAddress: req.ip,
    },
    connection
  );
  
  await connection.commit();
  
      const actor = await resolveActor(req.user.userId);
      emitToTrip(tripId, "budget:update", { tripId, budget: savedBudget, actor });
  
      return res.json({ message: "Trip budget updated", budget: savedBudget });
    } catch (error) {
      await connection.rollback();
      console.error("Update trip budget error:", error);
      return res.status(500).json({
        message: "Failed to update trip budget",
        detail: process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    } finally {
      connection.release();
    }
  });
  

  return router;
}

module.exports = { createBudgetRouter };

