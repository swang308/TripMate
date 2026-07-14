// Shared Socket.IO client for TripMate real-time updates (Week 6).
//
// A single connection is reused across the app. It authenticates with the same
// JWT the REST API uses (read from localStorage) and reconnects automatically.

import { io } from "socket.io-client";
import { API_BASE_URL } from "./api";

let socket = null;

export function getSocket() {
  if (socket) return socket;

  socket = io(API_BASE_URL, {
    autoConnect: true,
    // Re-read the token on every (re)connection attempt so a fresh login is
    // picked up without a full page reload.
    auth: (cb) => cb({ token: localStorage.getItem("token") }),
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  });

  return socket;
}

// Relay the current budget for a trip to other collaborators in the room.
// Budget has no REST persistence, so it is synced purely over the socket.
export function emitBudgetUpdate(tripId, budget) {
  if (!tripId || !budget) return;
  getSocket().emit("budget:update", { tripId, budget });
}
