const express = require("express");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const db = require("../../db/connection");
const { authenticateUser } = require("../../middleware/authenticateUser");
const { userCanAccessTrip } = require("../trips/trip.permissions");

const router = express.Router();

const AI_RECOMMENDATION_TAGS = new Set([
  "Food",
  "Sightseeing",
  "Nature",
  "Attractions",
  "Nightlife",
]);
const OFF_TOPIC_AI_PATTERNS = [
  /\b(code|coding|program|debug|javascript|python|react|sql|html|css|algorithm|library|libraries)\b/i,
  /\b(c\+\+|c#|typescript|node\.?js|express|database|frontend|backend)\b/i,
  /\b(homework|assignment|essay|resume|cover letter|translate|summarize this)\b/i,
  /\b(math|calculate|equation|algebra|calculus|physics|chemistry)\b/i,
  /\b(stock|crypto|investment|tax|legal|lawsuit|diagnosis|medical)\b/i,
  /\b(politics|election|president|war|religion)\b/i,
];
const TRAVEL_AI_PATTERNS = [
  /\b(trips?|travel|itinerar(?:y|ies)|destinations?|visit(?:ing|s)?|place|places|activities?)\b/i,

  /\b(food|restaurants?|cafes?|cuisines?|sightseeing|nature|attractions?|nightlife|museums?|clubs?|bars?|lounges?)\b/i,

  /\b(parks?|beaches?|hikes?|hiking|trails?|tours?|landmarks?|local|nearby|cities?|day\s*\d*)\b/i,

  /\b(tickets?|admission|prices?|costs?|hours|opening|close|closed|tower)\b/i,

  /\b(recommend(?:ation|ations)?|suggest(?:ion|ions)?|where to go|things to do|must see)\b/i,
];
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";
// Override this in backend/.env with OPENROUTER_MODEL without exposing it to the frontend.
const AI_SYSTEM_PROMPT_PATH = path.join(__dirname, "..", "..", "..", "ai", "SYSTEM_PROMPT.md");
const AI_CHAT_HISTORY_LIMIT = 30;

function loadAiSystemPrompt() {
  try {
    return fs.readFileSync(AI_SYSTEM_PROMPT_PATH, "utf8");
  } catch (error) {
    console.error("Failed to read AI system prompt:", error);
    return "You are TripMate AI Assistant. Return concise travel recommendations as valid JSON.";
  }
}

function normalizeRecommendationTags(tags) {
  const values = Array.isArray(tags) ? tags : [];
  return values
    .map((tag) => String(tag || "").trim())
    .filter((tag) => AI_RECOMMENDATION_TAGS.has(tag));
}

function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveAIChatMessage(
  { tripId, userId = null, recommendationRequestId = null, role, text, tags = [] },
  connection = db
) {
  const aiChatMessageId = crypto.randomUUID();
  await connection.execute(
    `INSERT INTO AIChatMessages (
       aiChatMessageId, tripId, userId, recommendationRequestId, role, text, tags
     )
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      aiChatMessageId,
      tripId,
      userId,
      recommendationRequestId,
      role,
      text,
      tags?.length ? JSON.stringify(tags) : null,
    ]
  );

  return aiChatMessageId;
}

async function trimAIChatHistory(tripId, connection = db) {
  await connection.execute(
    `DELETE FROM AIChatMessages
     WHERE tripId = ?
       AND aiChatMessageId NOT IN (
         SELECT aiChatMessageId
         FROM (
           SELECT aiChatMessageId
           FROM AIChatMessages
           WHERE tripId = ?
           ORDER BY createdAt DESC, aiChatMessageId DESC
           LIMIT ${AI_CHAT_HISTORY_LIMIT}
         ) AS latestMessages
       )`,
    [tripId, tripId]
  );
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isTravelRecommendationPrompt(prompt, context = null, tags = []) {
  const text = String(prompt || "").trim();
  if (!text) return false;

  const looksOffTopic = OFF_TOPIC_AI_PATTERNS.some((pattern) => pattern.test(text));
  if (looksOffTopic) return false;

  const hasRecommendationTag = Array.isArray(tags) && tags.length > 0;
  if (hasRecommendationTag) return true;

  const looksTravelRelated = TRAVEL_AI_PATTERNS.some((pattern) => pattern.test(text));
  const destinationTerms = [
    context?.trip?.destinationCity,
    context?.trip?.destinationCountry,
    context?.trip?.name,
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(/[\s,|/-]+/))
    .map((value) => value.trim())
    .filter((value) => value.length >= 3);
  const mentionsTripContext = destinationTerms.some((term) =>
    new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(text)
  );

  return looksTravelRelated || mentionsTripContext;
}

function offTopicRecommendationResponse() {
  return {
    requestId: null,
    reply: "I can only help with travel planning and trip recommendations in TripMate.",
    recommendations: [],
    refused: true,
  };
}

function isScopeRefusalReply(reply) {
  return /only help with travel planning|trip recommendations in tripmate/i.test(String(reply || ""));
}

function fallbackTravelReply(prompt, context) {
  const destination = [context?.trip?.destinationCity, context?.trip?.destinationCountry]
    .filter(Boolean)
    .join(", ") || "your destination";
  return {
    reply:
      `This is a travel-related question for ${destination}. I can help with location, nearby food, attraction logistics, and trip ideas, but please verify time-sensitive details like ticket prices or opening hours from official sources.`,
    recommendations: [],
  };
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function normalizeAiRecommendationPayload(payload, fallbackTag) {
  const reply = String(payload?.reply || "").trim();
  const recommendations = Array.isArray(payload?.recommendations)
    ? payload.recommendations
    : [];

  return {
    reply: reply || "Here are a few ideas that fit your trip.",
    recommendations: recommendations
      .slice(0, 5)
      .map((item) => {
        const categoryTag = AI_RECOMMENDATION_TAGS.has(item?.categoryTag)
          ? item.categoryTag
          : fallbackTag;
        return {
          name: String(item?.name || "").trim(),
          location: String(item?.location || "").trim(),
          description: String(item?.description || "").trim(),
          categoryTag,
          rationale: String(item?.rationale || "").trim(),
        };
      })
      .filter((item) => item.name && item.description),
  };
}

async function loadTripRecommendationContext(tripId, connection = db) {
  const [tripRows] = await connection.execute(
    `SELECT
       t.tripId,
       t.name,
       t.description,
       t.destinationCity,
       t.destinationCountry,
       t.startDate,
       t.endDate
     FROM Trips t
     WHERE t.tripId = ?
     LIMIT 1`,
    [tripId]
  );

  if (tripRows.length === 0) return null;

  const [itemRows] = await connection.execute(
    `SELECT day.date, item.title, item.startTime, item.endTime, item.notes
     FROM ItineraryItems item
     INNER JOIN ItineraryDays day
       ON day.itineraryDayId = item.itineraryDayId
     WHERE day.tripId = ?
     ORDER BY day.date ASC, item.\`order\` ASC
     LIMIT 30`,
    [tripId]
  );

  return {
    trip: tripRows[0],
    itineraryItems: itemRows,
  };
}

function buildRecommendationUserPrompt({ context, prompt, tags }) {
  const trip = context.trip;
  const itinerary = context.itineraryItems.length > 0
    ? context.itineraryItems
        .map((item) => {
          const time = [item.startTime, item.endTime].filter(Boolean).join("-");
          return `- ${item.date}: ${item.title}${time ? ` (${time})` : ""}${item.notes ? ` - ${item.notes}` : ""}`;
        })
        .join("\n")
    : "No itinerary items yet.";

  return [
    `Trip title: ${trip.name}`,
    `Destination: ${[trip.destinationCity, trip.destinationCountry].filter(Boolean).join(", ") || "Not specified"}`,
    `Dates: ${trip.startDate || "Unknown"} to ${trip.endDate || "Unknown"}`,
    `Trip description: ${trip.description || "None"}`,
    `Selected tags: ${tags.join(", ") || "None"}`,
    `Existing itinerary:\n${itinerary}`,
    `User request: ${prompt}`,
  ].join("\n\n");
}

async function requestOpenRouterRecommendations({ context, prompt, tags }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    const error = new Error("OpenRouter API key is not configured");
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
      "X-Title": "TripMate",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
      temperature: 0.7,
      max_tokens: 900,
      messages: [
        { role: "system", content: loadAiSystemPrompt() },
        {
          role: "user",
          content: buildRecommendationUserPrompt({ context, prompt, tags }),
        },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || "AI recommendation request failed");
    error.statusCode = response.status;
    throw error;
  }

  const content = data?.choices?.[0]?.message?.content || "";
  const parsed = extractJsonObject(content);
  const normalized = normalizeAiRecommendationPayload(parsed, tags[0] || "Sightseeing");
  if (isScopeRefusalReply(normalized.reply)) {
    return fallbackTravelReply(prompt, context);
  }
  return normalized;
}


router.get("/api/trips/:tripId/ai-chat", authenticateUser, async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { tripId } = req.params;
    const canAccess = await userCanAccessTrip(req.user.userId, tripId, connection);
    if (!canAccess) {
      return res.status(404).json({ message: "Trip not found" });
    }

    const [messageRows] = await connection.execute(
      `SELECT *
       FROM (
         SELECT aiChatMessageId, userId, recommendationRequestId, role, text, tags, createdAt
         FROM AIChatMessages
         WHERE tripId = ?
         ORDER BY createdAt DESC, aiChatMessageId DESC
         LIMIT ${AI_CHAT_HISTORY_LIMIT}
       ) AS recentMessages
       ORDER BY createdAt ASC, aiChatMessageId ASC`,
      [tripId]
    );

    const requestIds = [
      ...new Set(messageRows.map((row) => row.recommendationRequestId).filter(Boolean)),
    ];
    const recommendationsByRequest = new Map();

    if (requestIds.length > 0) {
      const placeholders = requestIds.map(() => "?").join(", ");
      const [recommendationRows] = await connection.execute(
        `SELECT recommendationId, recommendationRequestId, name, location,
                description, categoryTag, rationale, rankOrder
         FROM Recommendations
         WHERE recommendationRequestId IN (${placeholders})
         ORDER BY recommendationRequestId ASC, rankOrder ASC, createdAt ASC`,
        requestIds
      );

      for (const row of recommendationRows) {
        const existing = recommendationsByRequest.get(row.recommendationRequestId) || [];
        existing.push({
          id: row.recommendationId,
          name: row.name,
          location: row.location,
          description: row.description,
          categoryTag: row.categoryTag,
          rationale: row.rationale,
        });
        recommendationsByRequest.set(row.recommendationRequestId, existing);
      }
    }

    return res.json({
      limit: AI_CHAT_HISTORY_LIMIT,
      messages: messageRows.map((row) => ({
        id: row.aiChatMessageId,
        role: row.role,
        text: row.text,
        tags: parseJsonArray(row.tags),
        createdAt: row.createdAt,
        recommendations: row.recommendationRequestId
          ? recommendationsByRequest.get(row.recommendationRequestId) || []
          : [],
      })),
    });
  } catch (error) {
    console.error("Load AI chat history error:", error);
    return res.status(500).json({
      message: "Failed to load AI chat history",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message,
    });
  } finally {
    connection.release();
  }
});

router.delete("/api/trips/:tripId/ai-chat", authenticateUser, async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { tripId } = req.params;
    const canAccess = await userCanAccessTrip(req.user.userId, tripId, connection);
    if (!canAccess) {
      return res.status(404).json({ message: "Trip not found" });
    }

    await connection.execute(
      `DELETE FROM AIChatMessages
       WHERE tripId = ?`,
      [tripId]
    );

    return res.json({ message: "AI chat cleared" });
  } catch (error) {
    console.error("Clear AI chat history error:", error);
    return res.status(500).json({
      message: "Failed to clear AI chat history",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message,
    });
  } finally {
    connection.release();
  }
});

router.post("/api/trips/:tripId/recommendations", authenticateUser, async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { tripId } = req.params;
    const prompt = String(req.body?.prompt || "").trim();
    const tags = normalizeRecommendationTags(req.body?.tags);

    if (!prompt) {
      return res.status(400).json({ message: "Recommendation request is required" });
    }

    if (prompt.length > 600) {
      return res.status(400).json({ message: "Recommendation request must be 600 characters or fewer" });
    }

    const canAccess = await userCanAccessTrip(req.user.userId, tripId, connection);
    if (!canAccess) {
      return res.status(404).json({ message: "Trip not found" });
    }

    await saveAIChatMessage({
      tripId,
      userId: req.user.userId,
      role: "user",
      text: prompt,
      tags,
    }, connection);
    await trimAIChatHistory(tripId, connection);

    const context = await loadTripRecommendationContext(tripId, connection);
    if (!context) {
      return res.status(404).json({ message: "Trip not found" });
    }

    if (!isTravelRecommendationPrompt(prompt, context, tags)) {
      const offTopicResponse = offTopicRecommendationResponse();
      await saveAIChatMessage({
        tripId,
        role: "assistant",
        text: offTopicResponse.reply,
      }, connection);
      await trimAIChatHistory(tripId, connection);
      return res.json(offTopicResponse);
    }

    const recommendationRequestId = crypto.randomUUID();
    await connection.execute(
      `INSERT INTO RecommendationRequests (
         recommendationRequestId, tripId, requestedBy, tags, prompt, status
       )
       VALUES (?, ?, ?, ?, ?, 'Pending')`,
      [
        recommendationRequestId,
        tripId,
        req.user.userId,
        JSON.stringify(tags),
        prompt,
      ]
    );

    const aiPayload = await requestOpenRouterRecommendations({ context, prompt, tags });
    const savedRecommendations = [];

    for (const [index, recommendation] of aiPayload.recommendations.entries()) {
      const recommendationId = crypto.randomUUID();
      await connection.execute(
        `INSERT INTO Recommendations (
           recommendationId, recommendationRequestId, name, location,
           description, categoryTag, rationale, rankOrder
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          recommendationId,
          recommendationRequestId,
          recommendation.name,
          recommendation.location || null,
          recommendation.description,
          recommendation.categoryTag,
          recommendation.rationale || null,
          index + 1,
        ]
      );
      savedRecommendations.push({ id: recommendationId, ...recommendation });
    }

    await connection.execute(
      `UPDATE RecommendationRequests
       SET status = 'Completed', completedAt = CURRENT_TIMESTAMP
       WHERE recommendationRequestId = ?`,
      [recommendationRequestId]
    );

    await saveAIChatMessage({
      tripId,
      recommendationRequestId,
      role: "assistant",
      text: aiPayload.reply || "Here are some ideas for your trip.",
    }, connection);
    await trimAIChatHistory(tripId, connection);

    return res.status(201).json({
      requestId: recommendationRequestId,
      reply: aiPayload.reply,
      recommendations: savedRecommendations,
    });
  } catch (error) {
    console.error("AI recommendation error:", error);
    return res.status(error.statusCode || 500).json({
      message: error.statusCode === 503
        ? "AI assistant is not configured yet"
        : "Failed to generate recommendations",
      detail: process.env.NODE_ENV === "production" ? undefined : error.message,
    });
  } finally {
    connection.release();
  }
});

router.post("/api/recommendations/:recommendationId/rating", authenticateUser, async (req, res) => {
  try {
    const { recommendationId } = req.params;
    const ratingValue = Number(req.body?.ratingValue);
    const feedbackText = String(req.body?.feedbackText || "").trim();

    if (![1, -1].includes(ratingValue)) {
      return res.status(400).json({ message: "ratingValue must be 1 or -1" });
    }

    const [rows] = await db.execute(
      `SELECT rr.tripId
       FROM Recommendations r
       INNER JOIN RecommendationRequests rr
         ON rr.recommendationRequestId = r.recommendationRequestId
       WHERE r.recommendationId = ?
       LIMIT 1`,
      [recommendationId]
    );

    if (
      rows.length === 0 ||
      !(await userCanAccessTrip(req.user.userId, rows[0].tripId))
    ) {
      return res.status(404).json({ message: "Recommendation not found" });
    }

    await db.execute(
      `INSERT INTO Ratings (ratingId, recommendationId, userId, ratingValue, feedbackText)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         ratingValue = VALUES(ratingValue),
         feedbackText = VALUES(feedbackText),
         createdAt = CURRENT_TIMESTAMP`,
      [
        crypto.randomUUID(),
        recommendationId,
        req.user.userId,
        ratingValue,
        feedbackText || null,
      ]
    );

    return res.json({ message: "Rating saved" });
  } catch (error) {
    console.error("Recommendation rating error:", error);
    return res.status(500).json({ message: "Failed to save rating" });
  }
});

router.delete(
  "/api/recommendations/:recommendationId/rating",
  authenticateUser,
  async (req, res) => {
    try {
      const { recommendationId } = req.params;

      const [rows] = await db.execute(
        `SELECT rr.tripId
         FROM Recommendations r
         INNER JOIN RecommendationRequests rr
           ON rr.recommendationRequestId = r.recommendationRequestId
         WHERE r.recommendationId = ?
         LIMIT 1`,
        [recommendationId]
      );

      if (
        rows.length === 0 ||
        !(await userCanAccessTrip(req.user.userId, rows[0].tripId))
      ) {
        return res.status(404).json({
          message: "Recommendation not found",
        });
      }

      const [result] = await db.execute(
        `DELETE FROM Ratings
         WHERE recommendationId = ?
           AND userId = ?`,
        [recommendationId, req.user.userId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          message: "Rating not found",
        });
      }

      return res.json({
        message: "Rating removed",
      });
    } catch (error) {
      console.error("Delete recommendation rating error:", error);

      return res.status(500).json({
        message: "Failed to remove rating",
        detail:
          process.env.NODE_ENV === "production"
            ? undefined
            : error.message,
      });
    }
  }
);

router.get(
  "/api/trips/:tripId/saved-recommendations",
  authenticateUser,
  async (req, res) => {
    try {
      const { tripId } = req.params;

      const canAccess = await userCanAccessTrip(req.user.userId, tripId);

      if (!canAccess) {
        return res.status(404).json({ message: "Trip not found" });
      }

      const [rows] = await db.execute(
        `SELECT
           r.recommendationId AS id,
           r.name,
           r.location,
           r.categoryTag,
           r.description,
           r.rationale
         FROM Recommendations r
         INNER JOIN RecommendationRequests rr
           ON rr.recommendationRequestId = r.recommendationRequestId
         INNER JOIN Ratings rat
           ON rat.recommendationId = r.recommendationId
         WHERE rr.tripId = ?
           AND rat.userId = ?
           AND rat.ratingValue = 1
         ORDER BY rat.createdAt DESC`,
        [tripId, req.user.userId]
      );

      return res.json({ saved: rows });
    } catch (error) {
      console.error("Get saved recommendations error:", error);
      return res.status(500).json({
        message: "Failed to load saved recommendations",
        detail:
          process.env.NODE_ENV === "production"
            ? undefined
            : error.message,
      });
    }
  }
);


module.exports = router;

