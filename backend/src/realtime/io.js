// Real-time layer for TripMate (Week 6 - tickets 6.1 / 6.2).
//
// Wraps the existing HTTP server with a Socket.IO instance so that trip,
// itinerary, destination, and budget changes can be pushed live to every
// collaborator who is currently viewing the same trip.
//
// Design:
//   - Each connected client authenticates with the same JWT used by the REST
//     API (sent in the socket handshake `auth.token`).
//   - Clients join a room named `trip:<tripId>` after an access check.
//   - REST mutation handlers call `emitToTrip(...)` to broadcast a lightweight
//     "something changed" signal; clients then refetch from the REST API.
//   - Budget has no REST persistence (it lives in localStorage), so budget
//     state is relayed peer-to-peer through the server to others in the room.

const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { getJwtSecret } = require("../config/jwt");
const { userCanAccessTrip: checkTripAccess } = require("../modules/trips/trip.permissions");

let io = null;

function tripRoom(tripId) {
  return `trip:${tripId}`;
}

async function userCanAccessTrip(userId, tripId) {
  if (!userId || !tripId) return false;
  try {
    return await checkTripAccess(userId, tripId);
  } catch (error) {
    console.error("Realtime access check failed:", error);
    return false;
  }
}

function getTokenFromHandshake(socket) {
  const { auth, headers, query } = socket.handshake;
  if (auth && auth.token) return auth.token;
  if (query && query.token) return query.token;
  const authHeader = (headers && headers.authorization) || "";
  const [scheme, token] = authHeader.split(" ");
  return scheme === "Bearer" ? token : null;
}

function initRealtime(server, options = {}) {
  const origin = options.corsOrigin || "http://localhost:3000";

  io = new Server(server, {
    cors: {
      origin,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Authenticate every socket connection with the REST JWT.
  io.use((socket, next) => {
    try {
      const token = getTokenFromHandshake(socket);
      if (!token) return next(new Error("Authentication required"));
      const payload = jwt.verify(token, getJwtSecret());
      socket.user = { userId: payload.userId, email: payload.email };
      return next();
    } catch (error) {
      return next(new Error("Invalid or expired session"));
    }
  });

  io.on("connection", (socket) => {

    socket.join(`user:${socket.user.userId}`);

    // Join a trip room (after verifying the user can access that trip).
    socket.on("trip:join", async (tripId, ack) => {
      const ok = await userCanAccessTrip(socket.user.userId, tripId);
      if (!ok) {
        if (typeof ack === "function") ack({ ok: false });
        return;
      }
      socket.join(tripRoom(tripId));
      if (typeof ack === "function") ack({ ok: true });
    });

    socket.on("trip:leave", (tripId) => {
      if (tripId) socket.leave(tripRoom(tripId));
    });

    // Budget is client-authoritative (localStorage), so relay it to the room.
    // `socket.to(room)` excludes the sender, so no echo back to the author.
    socket.on("budget:update", async (payload = {}) => {
      const { tripId, budget } = payload;
      if (!tripId || !budget) return;
      const ok = await userCanAccessTrip(socket.user.userId, tripId);
      if (!ok) return;
      socket.to(tripRoom(tripId)).emit("budget:update", {
        tripId,
        budget,
        actor: socket.user,
      });
    });
  });

  return io;
}

// Broadcast an event to everyone currently viewing a trip. Safe no-op if the
// realtime layer was never initialized (e.g. during unit tests).
function emitToTrip(tripId, event, payload) {
  if (!io || !tripId) return;
  io.to(tripRoom(tripId)).emit(event, payload);
}

function emitToUser(userId, event, payload) {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, payload);
}

module.exports = { initRealtime, emitToTrip, emitToUser };
