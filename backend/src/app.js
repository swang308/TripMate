const express = require("express");
const cors = require("cors");

const db = require("./db/connection");
const usersRouter = require("./modules/users/user.routes");
const commentsRouter = require("./modules/comments/comment.routes");
const { editLockRouter } = require("./modules/edit-locks/edit-lock.routes");
const { createBudgetRouter } = require("./modules/budget/budget.routes");
const { createItineraryRouter } = require("./modules/itinerary/itinerary.routes");
const recommendationRouter = require("./modules/recommendations/recommendation.routes");
const { createGroupRouter } = require("./modules/groups/group.routes");
const { createTripRouter } = require("./modules/trips/trip.routes");
const { resolveActor, broadcastItineraryChange } = require("./services/actor.service");

const corsOptions = {
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

function createApp() {
  const app = express();

  app.use(cors(corsOptions));
  app.use((req, res, next) => {
    if (req.method === "OPTIONS") return res.sendStatus(204);
    return next();
  });
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "6mb" }));
  app.use(express.urlencoded({ extended: true, limit: process.env.JSON_BODY_LIMIT || "6mb" }));

  app.get("/", (req, res) => {
    res.json({ message: "TripMate backend is running" });
  });

  app.get("/api/health", async (req, res) => {
    try {
      await db.execute("SELECT 1");
      res.json({ status: "ok", database: "connected" });
    } catch (error) {
      console.error("Health check error:", error);
      res.status(500).json({
        status: "error",
        message: "Database connection failed",
        detail: process.env.NODE_ENV === "production" ? undefined : error.message,
      });
    }
  });

  app.use("/", usersRouter);
  app.use("/", createTripRouter({ resolveActor }));
  app.use("/", editLockRouter);
  app.use("/", createItineraryRouter({ broadcastItineraryChange }));
  app.use("/", createBudgetRouter({ resolveActor }));
  app.use("/", recommendationRouter);
  app.use("/", createGroupRouter({ resolveActor }));
  app.use("/", commentsRouter);

  return app;
}

module.exports = { createApp, corsOptions };
