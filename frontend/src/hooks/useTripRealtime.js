// Subscribe a page to real-time updates for a single trip (Week 6).
//
// Usage:
//   useTripRealtime(tripId, {
//     onTripUpdated:     ({ actor, changedDestination }) => {...},
//     onItineraryChanged:({ actor, action }) => {...},
//     onTripDeleted:     ({ actor }) => {...},
//     onBudgetUpdate:    ({ actor, budget }) => {...},
//     onItemLocked:      ({ lock }) => {...},
//     onItemUnlocked:    ({ entityType, entityId }) => {...},
//     onMemberRoleChanged: ({ actor, memberUserId, role }) => {...},
//   });
//
// The hook joins the `trip:<tripId>` room (re-joining on reconnect) and cleans
// up its listeners on unmount. Handlers are kept in a ref so callers don't need
// to memoize them.

import { useEffect, useRef } from "react";
import { getSocket } from "../lib/socket";

export function useTripRealtime(tripId, handlers = {}) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!tripId) return undefined;

    const socket = getSocket();
    const joinRoom = () => socket.emit("trip:join", tripId);

    // Join now (if already connected) and again on every (re)connect.
    if (socket.connected) joinRoom();
    socket.on("connect", joinRoom);

    const onTripUpdated = (payload) =>
      handlersRef.current.onTripUpdated?.(payload || {});
    const onItineraryChanged = (payload) =>
      handlersRef.current.onItineraryChanged?.(payload || {});
    const onTripDeleted = (payload) =>
      handlersRef.current.onTripDeleted?.(payload || {});
    const onBudgetUpdate = (payload) =>
      handlersRef.current.onBudgetUpdate?.(payload || {});
    const onItemLocked = (payload) =>
      handlersRef.current.onItemLocked?.(payload || {});
    const onItemUnlocked = (payload) =>
      handlersRef.current.onItemUnlocked?.(payload || {});
    const onMemberRoleChanged = (payload) =>
      handlersRef.current.onMemberRoleChanged?.(payload || {});

    socket.on("trip:updated", onTripUpdated);
    socket.on("itinerary:changed", onItineraryChanged);
    socket.on("trip:deleted", onTripDeleted);
    socket.on("budget:update", onBudgetUpdate);
    socket.on("item:locked", onItemLocked);
    socket.on("item:unlocked", onItemUnlocked);
    socket.on("member:roleChanged", onMemberRoleChanged);

    return () => {
      socket.emit("trip:leave", tripId);
      socket.off("connect", joinRoom);
      socket.off("trip:updated", onTripUpdated);
      socket.off("itinerary:changed", onItineraryChanged);
      socket.off("trip:deleted", onTripDeleted);
      socket.off("budget:update", onBudgetUpdate);
      socket.off("item:locked", onItemLocked);
      socket.off("item:unlocked", onItemUnlocked);
      socket.off("member:roleChanged", onMemberRoleChanged);
    };
  }, [tripId]);
}
