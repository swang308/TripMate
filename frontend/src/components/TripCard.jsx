import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Heart,
  MessageSquare,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";

function parseDateOnly(dateStr) {
  const match = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateRange(startDate, endDate) {
  if (!startDate) return "";
  const opts = { month: "short", day: "numeric" };
  const start = parseDateOnly(startDate);
  if (!start) return "";

  if (!endDate) {
    return start.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  }

  const end = parseDateOnly(endDate);
  if (!end) {
    return start.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  }

  const sameYear = start.getFullYear() === end.getFullYear();
  const startStr = start.toLocaleDateString("en-US", opts);
  const endStr = end.toLocaleDateString("en-US", {
    ...opts,
    year: "numeric",
  });

  return sameYear
    ? `${startStr} - ${endStr}`
    : `${start.toLocaleDateString("en-US", {
        ...opts,
        year: "numeric",
      })} - ${endStr}`;
}

function initialsFor(name) {
  if (!name) return "T";
  const parts = name.trim().split(/\s+/);
  return (
    parts
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "T"
  );
}

function valueMatches(a, b) {
  return Boolean(a && b && String(a).toLowerCase() === String(b).toLowerCase());
}

function isTripOwner(trip, currentUser) {
  if (!currentUser) return false;

  const currentDisplayName =
    currentUser.displayName ||
    currentUser.firstName ||
    currentUser.username ||
    currentUser.email ||
    "";

  return (
    valueMatches(trip.ownerId, currentUser.id) ||
    valueMatches(trip.ownerId, currentUser._id) ||
    valueMatches(trip.ownerEmail, currentUser.email) ||
    valueMatches(trip.ownerUsername, currentUser.username) ||
    valueMatches(trip.ownerName, currentDisplayName) ||
    trip.ownerName === "Me"
  );
}

function splitGroupMembers(value) {
  if (!value || typeof value !== "string") return [];

  return value
    .split(/[|,\n]/)
    .map((member) => member.trim())
    .filter(Boolean);
}

export default function TripCard({
  trip,
  currentUser,
  onToggleFavorite,
  onDelete,
  onOpenComments,
}) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const initials = initialsFor(trip.ownerName || trip.collaborators || "Trip");
  const tripTypeLabel = trip.tripType === "group" ? "Group trip" : "Solo trip";
  const activeGroupMembers = splitGroupMembers(
    trip.activeGroupMembers || trip.collaborators
  );
  const pendingGroupMembers = splitGroupMembers(trip.pendingGroupMembers).map(
    (member) => `${member} pending`
  );
  const groupMemberSummary = [...activeGroupMembers, ...pendingGroupMembers].join(", ");
  const dateLabel = formatDateRange(trip.startDate, trip.endDate);
  const canManageTrip = isTripOwner(trip, currentUser);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleEdit = () => {
    setMenuOpen(false);
    navigate(`/trips/${trip.id}/edit`);
  };

  const handleDelete = () => {
    setMenuOpen(false);
    onDelete(trip.id);
  };

  return (
    <article className="w-full max-w-[280px] overflow-visible rounded-2xl border border-pink-100 bg-white shadow-[0_4px_0_rgba(0,0,0,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_0_rgba(0,0,0,0.06)]">
      <header className="relative flex items-center justify-between gap-3 rounded-t-2xl bg-purple-50 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-200 text-sm font-bold text-purple-700">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight text-gray-800">
              {trip.ownerName || trip.collaborators || "Trip"}
            </p>
            <p
              className={`max-w-[150px] truncate text-xs ${
                trip.tripType === "group" && groupMemberSummary
                  ? "text-purple-500"
                  : "text-gray-500"
              }`}
              title={trip.tripType === "group" && groupMemberSummary ? groupMemberSummary : tripTypeLabel}
            >
              {trip.tripType === "group" && groupMemberSummary
                ? groupMemberSummary
                : tripTypeLabel}
            </p>
          </div>
        </div>

        {canManageTrip && (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="rounded-full p-1 text-gray-400 transition-colors hover:bg-white hover:text-gray-600"
              aria-label="More trip options"
              aria-expanded={menuOpen}
            >
              <MoreVertical className="h-5 w-5" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-8 z-20 w-40 rounded-xl border border-gray-100 bg-white p-1.5 shadow-xl">
                <button
                  type="button"
                  onClick={handleEdit}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold text-gray-700 hover:bg-pink-50 hover:text-pink-500"
                >
                  <span className="flex items-center gap-2">
                    <Pencil className="h-4 w-4" />
                    Edit trip
                  </span>
                  <ArrowRight className="h-4 w-4 text-gray-400" />
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      <button
        type="button"
        onClick={() => navigate(`/trips/${trip.id}`)}
        className="block w-full bg-purple-50/60 text-left"
        aria-label={`Open ${trip.title}`}
      >
        {trip.tripImage ? (
          <img
            src={trip.tripImage}
            alt=""
            className="h-44 w-full object-cover"
          />
        ) : (
          <div className="px-6 py-10">
            <div className="mx-auto flex h-24 items-center justify-center gap-2 opacity-60">
              <span className="block h-10 w-10 -translate-y-2 rounded-md bg-purple-300/70" />
              <span className="block h-12 w-12 rounded-full bg-purple-300/70" />
              <span className="block h-10 w-10 translate-y-1 rounded-md bg-purple-300/70" />
            </div>
          </div>
        )}
      </button>

      <div className="px-4 pb-4 pt-3">
        <h3 className="text-base font-bold text-gray-800">{trip.title}</h3>
        {dateLabel && <p className="mt-1 text-sm text-gray-500">{dateLabel}</p>}

        <div className="ml-auto mt-3 flex w-fit items-center gap-1 rounded-full bg-white px-2 py-1 shadow-[0_6px_16px_rgba(15,23,42,0.14)] ring-1 ring-gray-100">
          <button
            type="button"
            onClick={() => onToggleFavorite(trip.id)}
            className="rounded-full p-2 text-gray-600 transition-colors hover:bg-white hover:text-pink-500"
            aria-label={trip.favorite ? "Unfavorite trip" : "Favorite trip"}
          >
            <Heart
              className={`h-4 w-4 ${
                trip.favorite ? "fill-pink-500 text-pink-500" : ""
              }`}
            />
          </button>
          <button
            type="button"
            onClick={() => {
              if (typeof onOpenComments === "function") {
                onOpenComments(trip);
              } else {
                navigate(`/trips/${trip.id}#chat`);
              }
            }}
            className="rounded-full p-2 text-gray-600 transition-colors hover:bg-white hover:text-pink-500"
            aria-label="Open trip chat"
          >
            <MessageSquare className="h-4 w-4" />
          </button>
          {canManageTrip && (
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-full p-2 text-gray-600 transition-colors hover:bg-red-50 hover:text-red-500"
              aria-label="Delete trip"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
