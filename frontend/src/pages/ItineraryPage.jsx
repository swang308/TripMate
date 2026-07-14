import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  GripVertical,
  MapPin,
  MessageSquare,
  Pin,
  X,
} from "lucide-react";
import { toast } from "sonner";
import AppHeader from "../components/AppHeader";
import AIAssistPopup from "../components/AIAssistPopup";
import TripNavigationTabs from "../components/TripNavigationTabs";
import VisitedMap from "../components/VisitedMap";
import { API_BASE_URL, getAuthHeaders, getCurrentUser } from "../lib/api";
import { geocodePlace } from "../utils/geocoding";
import { useTripRealtime } from "../hooks/useTripRealtime";

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function dayOrdinal(n) {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

function parseDateOnly(dateStr) {
  const match = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDayHeading(dateStr) {
  const d = parseDateOnly(dateStr);
  if (!d) return "";
  return `${WEEKDAY[d.getDay()]}, ${MONTH[d.getMonth()]} ${dayOrdinal(d.getDate())}`;
}

function formatTime(timeString) {
  if (!timeString) return "Anytime";

  const [hours, minutes] = timeString.split(":");
  const date = new Date();
  date.setHours(Number(hours), Number(minutes));

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function hasCoordinates(place) {
  return Number.isFinite(Number(place?.lat)) && Number.isFinite(Number(place?.lng));
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
    valueMatches(trip?.createdBy, currentUser.userId) ||
    valueMatches(trip?.ownerId, currentUser.id) ||
    valueMatches(trip?.ownerId, currentUser.userId) ||
    valueMatches(trip?.ownerId, currentUser._id) ||
    valueMatches(trip?.ownerEmail, currentUser.email) ||
    valueMatches(trip?.ownerUsername, currentUser.username) ||
    valueMatches(trip?.ownerName, currentDisplayName) ||
    trip?.ownerName === "Me"
  );
}

const DAY_COLORS = [
  "#ec4899",
  "#8b5cf6",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
];

function SortablePlaceItem({
  day,
  place,
  index,
  itemCount,
  lock,
  canEdit,
  onMovePlace,
  onEditPlace,
  onFocusPlace,
  onRequestRemove,
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: place.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const canFocusMap = hasCoordinates(place);

  const handleFocusPlace = () => {
    if (canFocusMap) onFocusPlace(place);
  };

  const handleFocusKeyDown = (e) => {
    if (!canFocusMap || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    onFocusPlace(place);
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      onClick={handleFocusPlace}
      onKeyDown={handleFocusKeyDown}
      role={canFocusMap ? "button" : undefined}
      tabIndex={canFocusMap ? 0 : undefined}
      className={`flex items-center gap-2 rounded-xl border px-2 py-2 transition-colors ${
        isDragging
          ? "z-10 border-pink-200 bg-pink-50 shadow-md"
          : "border-transparent hover:border-pink-100 hover:bg-pink-50/40"
      } ${canFocusMap ? "cursor-pointer focus:border-pink-300 focus:bg-pink-50 focus:outline-none focus:ring-2 focus:ring-pink-100" : ""}`}
      aria-label={canFocusMap ? `Center map on ${place.name}` : undefined}
    >
      {canEdit && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          onClick={(e) => e.stopPropagation()}
          className="cursor-grab rounded p-1 text-gray-400 transition-colors hover:bg-white hover:text-pink-500 active:cursor-grabbing"
          aria-label={`Drag ${place.name} to reorder`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}

      <MapPin className="h-4 w-4 flex-none text-gray-700" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-gray-800">
          {place.name}
        </p>

        {(place.startTime || place.endTime) && (
          <p className="text-xs font-semibold text-pink-500">
            {formatTime(place.startTime)} - {formatTime(place.endTime)}
          </p>
        )}

        {place.notes && (
          <p className="truncate text-xs text-gray-500">{place.notes}</p>
        )}

        {lock && (
          <p className="truncate text-xs font-semibold text-amber-500">
            {lock.lockedByName} is editing
          </p>
        )}
      </div>

      {canEdit && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMovePlace(day.date, index, -1);
            }}
            disabled={index === 0}
            className="rounded p-1 text-gray-500 transition-colors hover:bg-white hover:text-pink-500 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Move up"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMovePlace(day.date, index, 1);
            }}
            disabled={index === itemCount - 1}
            className="rounded p-1 text-gray-500 transition-colors hover:bg-white hover:text-pink-500 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Move down"
          >
            <ArrowDown className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEditPlace(place);
            }}
            disabled={!!lock}
            className="rounded px-2 py-1 text-sm text-gray-500 transition-colors hover:bg-white hover:text-pink-500 disabled:cursor-not-allowed disabled:text-pink-300"
            title={lock ? `${lock.lockedByName} is editing` : "Edit"}
          >
            {lock ? "Editing" : "Edit"}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRequestRemove({
                date: day.date,
                id: place.id,
                name: place.name,
              });
            }}
            className="rounded p-1 text-gray-500 transition-colors hover:bg-white hover:text-red-500"
            aria-label="Remove place"
          >
            <X className="h-4 w-4" />
          </button>
        </>
      )}
    </li>
  );
}

function DaySection({
  day,
  index,
  collapsed,
  locksByItemId,
  canEdit,
  onToggleCollapse,
  onAddPlace,
  onRemovePlace,
  onMovePlace,
  onReorderPlaces,
  onEditPlace,
  onFocusPlace,
}) {
  const [newPlace, setNewPlace] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [removeCandidate, setRemoveCandidate] = useState(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const heading = formatDayHeading(day.date);
  const dayColor = DAY_COLORS[index % DAY_COLORS.length];
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (collapsed) {
      setSuggestions([]);
    }
  }, [collapsed]);

  useEffect(() => {
    if (!removeCandidate) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") setRemoveCandidate(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [removeCandidate]);

  useEffect(() => {
    let active = true;
    const trimmed = newPlace.trim();

    if (trimmed.length < 3) {
      setSuggestions([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      try {
        if (typeof geocodePlace === "function") {
          const results = await geocodePlace(trimmed, { returnList: true });
          if (active && Array.isArray(results)) {
            setSuggestions(results);
          }
        }
      } catch (error) {
        console.error("Error fetching location suggestions:", error);
      }
    }, 400);

    return () => {
      active = false;
      clearTimeout(delayDebounceFn);
    };
  }, [newPlace]);

  const handleInputChange = (e) => {
    setNewPlace(e.target.value);
  };

  const handleSelectSuggestion = (suggestedPlace) => {
    if (!canEdit) return;
    onAddPlace(
      day.date,
      suggestedPlace.formattedName || suggestedPlace.name,
      suggestedPlace.lat,
      suggestedPlace.lng
    );
    setNewPlace("");
    setSuggestions([]);
  };

  const handleSubmitFallback = async (e) => {
    e.preventDefault();
    if (!canEdit) return;
    const trimmed = newPlace.trim();
    if (!trimmed || isGeocoding) return;

    if (suggestions.length > 0) {
      handleSelectSuggestion(suggestions[0]);
      return;
    }

    setIsGeocoding(true);
    setSuggestions([]);
    try {
      const coords = await geocodePlace(trimmed);
      if (coords) {
        onAddPlace(day.date, trimmed, coords.lat, coords.lng);
      } else {
        onAddPlace(day.date, trimmed);
      }
    } catch (error) {
      onAddPlace(day.date, trimmed);
    } finally {
      setIsGeocoding(false);
      setNewPlace("");
    }
  };

  const handleConfirmRemove = async () => {
    if (!removeCandidate || isRemoving) return;

    setIsRemoving(true);
    try {
      await onRemovePlace(removeCandidate.date, removeCandidate.id);
      setRemoveCandidate(null);
    } finally {
      setIsRemoving(false);
    }
  };

  const handleDragEnd = ({ active, over }) => {
    if (!canEdit || !over || active.id === over.id) return;
    onReorderPlaces(day.date, active.id, over.id);
  };

  return (
    <>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="h-6 w-6 rounded-full"
              style={{ backgroundColor: dayColor }}
              aria-hidden="true"
            />
            <h3 className="text-xl font-extrabold text-pink-500">
              Day {index + 1} - {heading}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onToggleCollapse(day.date)}
            className="rounded-full p-1 text-pink-500 transition-colors hover:bg-pink-50"
            aria-label={collapsed ? "Expand day" : "Collapse day"}
          >
            {collapsed ? (
              <ChevronDown className="h-5 w-5" />
            ) : (
              <ChevronUp className="h-5 w-5" />
            )}
          </button>
        </div>

        {!collapsed && (
          <>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={day.places.map((place) => place.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="space-y-2">
                  {day.places.map((place, i) => (
                    <SortablePlaceItem
                      key={place.id}
                      day={day}
                      place={place}
                      index={i}
                      itemCount={day.places.length}
                      lock={locksByItemId[place.id]}
                      canEdit={canEdit}
                      onMovePlace={onMovePlace}
                      onEditPlace={onEditPlace}
                      onFocusPlace={onFocusPlace}
                      onRequestRemove={setRemoveCandidate}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>

            {canEdit && (
              <div className="relative">
                <form onSubmit={handleSubmitFallback}>
                  <label className="relative block">
                    <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pink-300" />
                    <input
                      type="text"
                      value={newPlace}
                      onChange={handleInputChange}
                      placeholder={
                        isGeocoding ? "Finding location..." : "Add new place"
                      }
                      disabled={isGeocoding}
                      className="w-full rounded-xl border border-pink-100 bg-white px-9 py-2.5 text-sm text-gray-700 placeholder:text-pink-300 focus:border-pink-400 focus:outline-none disabled:opacity-50"
                    />
                    {isGeocoding && (
                      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-pink-500 border-t-transparent"></div>
                      </div>
                    )}
                  </label>
                </form>

                {suggestions.length > 0 && (
                  <ul className="absolute left-0 right-0 z-[2000] mt-1 max-h-60 overflow-y-auto rounded-xl border border-pink-100 bg-white p-1 shadow-lg">
                    {suggestions.map((suggestion, idx) => (
                      <li key={suggestion.id || idx}>
                        <button
                          type="button"
                          onClick={() => handleSelectSuggestion(suggestion)}
                          className="w-full text-left rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-pink-50 hover:text-pink-600 transition-colors truncate"
                        >
                          {suggestion.formattedName || suggestion.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {removeCandidate && (
        <div
          className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`remove-place-title-${removeCandidate.id}`}
        >
          <div
            className="absolute inset-0"
            onClick={() => (isRemoving ? null : setRemoveCandidate(null))}
            aria-hidden="true"
          />

          <div className="relative z-[6001] w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <h2
                id={`remove-place-title-${removeCandidate.id}`}
                className="text-xl font-bold text-pink-500"
              >
                Confirm deletion
              </h2>
              <button
                type="button"
                onClick={() => (isRemoving ? null : setRemoveCandidate(null))}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
                aria-label="Close"
                disabled={isRemoving}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 text-sm text-gray-600">
              Delete{" "}
              <span className="font-semibold text-gray-800">
                {removeCandidate.name || "this place"}
              </span>{" "}
              from your itinerary? This action can’t be undone.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRemoveCandidate(null)}
                className="rounded-full px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isRemoving}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmRemove}
                className="rounded-full bg-red-500 px-5 py-2 text-sm font-bold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isRemoving}
              >
                {isRemoving ? "Deleting..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function ItineraryPage() {
  const navigate = useNavigate();
  const { id: tripId } = useParams();

  const [trip, setTrip] = useState(null);
  const [days, setDays] = useState([]); 
  const [collapsed, setCollapsed] = useState({});
  const [mapCollapsed, setMapCollapsed] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [pendingPinDay, setPendingPinDay] = useState(null);
  const [tripWithCoords, setTripWithCoords] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [locksByItemId, setLocksByItemId] = useState({});
  const [focusedPin, setFocusedPin] = useState(null);
  const [canEdit, setCanEdit] = useState(false);

  const loadItinerary = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/trips/${tripId}/itinerary`, {
        headers: getAuthHeaders(),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to load itinerary");
      }

      const tripData = {
        ...data.trip,
        id: data.trip.tripId,
        title: data.trip.name,
        destination: data.trip.destinationCity,
        ownerId: data.trip.ownerId || data.trip.createdBy,
      };

      setTrip(tripData);
      setCanEdit(Boolean(data.canEdit));

      if (tripData.destination && typeof geocodePlace === "function") {
        try {
          const coords = await geocodePlace(tripData.destination);
          if (coords && coords.lat && coords.lng) {
            setTripWithCoords({
              ...tripData,
              lat: Number(coords.lat),
              lng: Number(coords.lng),
            });
          }
        } catch (geoError) {
          console.error("Failed to geocode trip destination city:", geoError);
        }
      }

      setDays(
        data.itinerary.map((day) => ({
          itineraryDayId: day.itineraryDayId,
          date: day.date,
          places: day.items.map((item) => ({
            id: item.itemId,
            itemId: item.itemId,
            name: item.title,
            title: item.title,
            startTime: item.startTime || "",
            endTime: item.endTime || "",
            notes: item.notes || "",
            lat: item.lat,
            lng: item.lng,
            version: item.version || 1,
          })),
        }))
      );
      setLocksByItemId(
        Object.fromEntries(
          (data.locks || [])
            .filter((lock) => lock.entityType === "itineraryItem")
            .map((lock) => [lock.entityId, lock])
        )
      );
    } catch (error) {
      console.error("Load itinerary error:", error);
      navigate("/homepage");
    }
  };

  useEffect(() => {
    loadItinerary();
  }, [tripId]);

  // Live updates: refetch + toast when a collaborator changes this trip.
  const currentUser = useMemo(() => getCurrentUser(), []);
  const canEditDestination = useMemo(() => isTripOwner(trip, currentUser), [trip, currentUser]);
  const isSelf = (actor) =>
    actor?.userId &&
    (actor.userId === currentUser?.id || actor.userId === currentUser?.userId);

  useTripRealtime(tripId, {
    onTripUpdated: ({ actor, changedDestination }) => {
      if (isSelf(actor)) return;
      loadItinerary();
      toast.info(
        changedDestination
          ? `Destination updated by ${actor?.name || "a teammate"}`
          : `Trip details updated by ${actor?.name || "a teammate"}`
      );
    },
    onItineraryChanged: ({ actor }) => {
      if (isSelf(actor)) return;
      loadItinerary();
      toast.info(`Itinerary updated by ${actor?.name || "a teammate"}`);
    },
    onItemLocked: ({ lock }) => {
      if (!lock || lock.entityType !== "itineraryItem") return;
      if (lock.lockedBy === currentUser?.id || lock.lockedBy === currentUser?.userId) return;
      setLocksByItemId((current) => ({ ...current, [lock.entityId]: lock }));
    },
    onItemUnlocked: ({ entityType, entityId }) => {
      if (entityType !== "itineraryItem" || !entityId) return;
      setLocksByItemId((current) => {
        const next = { ...current };
        delete next[entityId];
        return next;
      });
    },
    onMemberRoleChanged: ({ actor, memberUserId, role }) => {
      loadItinerary();
      const changedSelf =
        memberUserId &&
        (memberUserId === currentUser?.id || memberUserId === currentUser?.userId);
      toast.info(
        changedSelf
          ? `Your trip role is now ${role}`
          : `A traveller role was updated to ${role} by ${actor?.name || "a teammate"}`
      );
    },
    onTripDeleted: ({ actor }) => {
      if (isSelf(actor)) return;
      toast.error(`This trip was deleted by ${actor?.name || "a teammate"}`);
      setTimeout(() => navigate("/homepage"), 1500);
    },
  });

  useEffect(() => {
    if (days.length === 0) {
      setPendingPinDay(null);
      return;
    }

    const selectedDayExists = days.some((day) => day.date === pendingPinDay);
    if (!selectedDayExists) {
      setPendingPinDay(days[0].date);
    }
  }, [days, pendingPinDay]);

  const allPins = useMemo(() => {
    const out = [];
    days.forEach((d, dayIdx) => {
      const color = DAY_COLORS[dayIdx % DAY_COLORS.length];
      d.places.forEach((p) => {
        if (hasCoordinates(p)) {
          out.push({
            id: p.id,
            lat: Number(p.lat),
            lng: Number(p.lng),
            label: `Day ${dayIdx + 1}: ${p.name}`,
            dayIdx,
            color,
          });
        }
      });
    });
    return out;
  }, [days]);

  const handleAddPlace = async (date, name, lat = null, lng = null) => {
    if (!canEdit) return;
    const day = days.find((d) => d.date === date);
    if (!day) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/itinerary-days/${day.itineraryDayId}/items`,
        {
          method: "POST",
          headers: {
            ...getAuthHeaders({ "Content-Type": "application/json" }),
          },
          body: JSON.stringify({
            title: name,
            startTime: null,
            endTime: null,
            notes: "",
            lat,
            lng,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to add itinerary item");
      }

      await loadItinerary();

      setEditingItem({
        id: data.item.itemId,
        itemId: data.item.itemId,
        name: data.item.title,
        title: data.item.title,
        startTime: data.item.startTime || "",
        endTime: data.item.endTime || "",
        notes: data.item.notes || "",
        lat: data.item.lat,
        lng: data.item.lng,
        version: data.item.version || 1,
      });
    } catch (error) {
      console.error("Add place error:", error);
      alert(error.message || "Failed to add place.");
    }
  };

  // Add an AI recommendation to the itinerary in one click (tickets 7.4-7.6).
  // Geocodes the place so it also drops a pin on the map, stores the
  // recommendation description as the item's notes, and targets the day the
  // user currently has selected (falling back to Day 1). Returns true on
  // success so the popup can show an "Added" state.
  const addRecommendationToItinerary = async (item, targetDateArg) => {
    if (!canEdit || !item?.name) return false;

    if (days.length === 0) {
      toast.error("Add trip dates first, then you can save recommendations to a day.");
      return false;
    }

    // Prefer the day the user picked in the assistant; otherwise fall back to
    // the map's selected pin-day, then Day 1.
    const targetDate =
      targetDateArg && days.some((d) => d.date === targetDateArg)
        ? targetDateArg
        : pendingPinDay && days.some((d) => d.date === pendingPinDay)
        ? pendingPinDay
        : days[0].date;
    const day = days.find((d) => d.date === targetDate);
    const dayNumber = days.findIndex((d) => d.date === targetDate) + 1;

    // Best-effort geocode (optional — the item is still added without coords).
    let lat = null;
    let lng = null;
    try {
      const query = [item.name, item.location || trip?.destination]
        .filter(Boolean)
        .join(", ");
      const coords = await geocodePlace(query);
      if (coords?.lat && coords?.lng) {
        lat = Number(coords.lat);
        lng = Number(coords.lng);
      }
    } catch (geoError) {
      console.error("Recommendation geocode failed:", geoError);
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/itinerary-days/${day.itineraryDayId}/items`,
        {
          method: "POST",
          headers: {
            ...getAuthHeaders({ "Content-Type": "application/json" }),
          },
          body: JSON.stringify({
            title: item.name,
            startTime: null,
            endTime: null,
            notes: item.description || "",
            lat,
            lng,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to add to itinerary");
      }
      await loadItinerary();
      toast.success(`Added "${item.name}" to Day ${dayNumber}`);
      return true;
    } catch (error) {
      console.error("Add recommendation error:", error);
      toast.error(error.message || "Could not add to itinerary.");
      return false;
    }
  };

  const handleRemovePlace = async (date, placeId) => {
    if (!canEdit) return;
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/itinerary-items/${placeId}`,
        {
          method: "DELETE",
          headers: getAuthHeaders(),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to delete itinerary item");
      }

      await loadItinerary();
    } catch (error) {
      console.error("Remove place error:", error);
      alert(error.message || "Failed to remove place.");
    }
  };

  const releaseItemLock = async (itemId) => {
    if (!itemId || !tripId) return;
    try {
      await fetch(`${API_BASE_URL}/api/trips/${tripId}/edit-locks`, {
        method: "DELETE",
        headers: {
          ...getAuthHeaders({ "Content-Type": "application/json" }),
        },
        body: JSON.stringify({
          entityType: "itineraryItem",
          entityId: itemId,
        }),
      });
    } catch (error) {
      console.error("Release edit lock error:", error);
    }
  };

  const handleStartEditPlace = async (place) => {
    if (!canEdit) return;
    if (!place?.itemId) return;

    const existingLock = locksByItemId[place.itemId];
    if (existingLock) {
      toast.info(`${existingLock.lockedByName} is editing this item`);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/trips/${tripId}/edit-locks`, {
        method: "POST",
        headers: {
          ...getAuthHeaders({ "Content-Type": "application/json" }),
        },
        body: JSON.stringify({
          entityType: "itineraryItem",
          entityId: place.itemId,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 423 && data.lock) {
          setLocksByItemId((current) => ({ ...current, [place.itemId]: data.lock }));
        }
        throw new Error(data.message || "This item is locked for editing.");
      }

      setEditingItem(place);
    } catch (error) {
      toast.error(error.message || "Could not start editing this item.");
    }
  };

  const handleEditPlace = async (itemData) => {
    if (!canEdit) return;
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/itinerary-items/${itemData.itemId}`,
        {
          method: "PUT",
          headers: {
            ...getAuthHeaders({ "Content-Type": "application/json" }),
          },
          body: JSON.stringify({
            title: itemData.title,
            startTime: itemData.startTime || null,
            endTime: itemData.endTime || null,
            notes: itemData.notes || "",
            lat: itemData.lat || null,
            lng: itemData.lng || null,
            version: itemData.version,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          await loadItinerary();
        }
        throw new Error(data.message || "Failed to update itinerary item");
      }

      setEditingItem(null);
      await loadItinerary();
    } catch (error) {
      console.error("Edit itinerary item error:", error);
      alert(error.message || "Failed to update itinerary item.");
      await releaseItemLock(itemData.itemId);
    }
  };

  const savePlaceOrder = async (day, places) => {
    const response = await fetch(
      `${API_BASE_URL}/api/itinerary-days/${day.itineraryDayId}/items/order`,
      {
        method: "PUT",
        headers: {
          ...getAuthHeaders({ "Content-Type": "application/json" }),
        },
        body: JSON.stringify({
          itemIds: places.map((place) => place.id),
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to save itinerary order");
    }
  };

  const reorderPlaces = async (date, getNextPlaces) => {
    if (!canEdit) return;
    const day = days.find((d) => d.date === date);
    if (!day) return;

    const nextPlaces = getNextPlaces(day.places);
    if (nextPlaces === day.places) return;

    setDays((current) =>
      current.map((d) => (d.date === date ? { ...d, places: nextPlaces } : d))
    );

    try {
      await savePlaceOrder(day, nextPlaces);
    } catch (error) {
      console.error("Save itinerary order error:", error);
      alert(error.message || "Failed to save itinerary order.");
      await loadItinerary();
    }
  };

  const handleMovePlace = (date, index, direction) => {
    reorderPlaces(date, (places) => {
      const target = index + direction;
      if (target < 0 || target >= places.length) return places;
      return arrayMove(places, index, target);
    });
  };

  const handleReorderPlaces = (date, activeId, overId) => {
    reorderPlaces(date, (places) => {
      const oldIndex = places.findIndex((place) => place.id === activeId);
      const newIndex = places.findIndex((place) => place.id === overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return places;
      return arrayMove(places, oldIndex, newIndex);
    });
  };

  const handleToggleCollapse = (date) => {
    setCollapsed((current) => ({ ...current, [date]: !current[date] }));
  };

  const handleFocusPlaceOnMap = (place) => {
    if (!hasCoordinates(place)) return;

    setMapCollapsed(false);
    setFocusedPin({
      id: place.id,
      lat: Number(place.lat),
      lng: Number(place.lng),
      selectedAt: Date.now(),
    });
  };

  const handleAddPinOnMap = (pin) => {
    if (!canEdit || !pinMode) return;
    
    const selectedDay = days.find((day) => day.date === pendingPinDay) || days[0];

    if (selectedDay) {
      const placeName = prompt("Enter place name for this location:");
      if (placeName && placeName.trim()) {
        handleAddPlace(selectedDay.date, placeName.trim(), pin.lat, pin.lng);
      }
    }
    setPinMode(false);
  };

  const handleRemovePin = (pinId) => {
    if (!canEdit) return;
    handleRemovePlace(null, pinId);
  };

  if (!trip) {
    return (
      <div className="min-h-screen bg-white">
        <AppHeader showBackButton backTo="/homepage" />
        <main className="mx-auto max-w-4xl px-6 py-20 text-center">
          <p className="text-pink-500">Loading trip...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <AppHeader showBackButton backTo="/homepage" />

      <main className="mx-auto max-w-7xl px-4 pb-8 pt-6 sm:px-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">
              {trip.title}
            </h1>
            {trip.destination && (
              <p className="text-sm text-gray-500">{trip.destination}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(320px,420px)_1fr] lg:items-stretch">
          <div className="flex h-[568px] flex-col overflow-hidden rounded-3xl border border-pink-100 bg-white p-5 shadow-sm">
            {days.length === 0 ? (
              <p className="flex flex-1 items-center justify-center text-center text-sm text-gray-500">
                No trip dates set yet. Edit the trip to add a date range.
              </p>
            ) : (
              <div className="-mr-2 flex-1 space-y-6 overflow-y-auto pr-2">
                {days.map((day, i) => (
                  <DaySection
                    key={day.date}
                    day={day}
                    index={i}
                    collapsed={!!collapsed[day.date]}
                    canEdit={canEdit}
                    onToggleCollapse={handleToggleCollapse}
                    onAddPlace={handleAddPlace}
                    onRemovePlace={handleRemovePlace}
                    onMovePlace={handleMovePlace}
                    onReorderPlaces={handleReorderPlaces}
                    onEditPlace={handleStartEditPlace}
                    onFocusPlace={handleFocusPlaceOnMap}
                    locksByItemId={locksByItemId}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex h-[568px] flex-col overflow-hidden rounded-3xl border border-pink-100 bg-white shadow-sm">
            <div className="flex items-center justify-between px-5 py-3 border-b border-pink-100">
              <h2 className="text-sm font-bold uppercase tracking-wide text-pink-500">
                Map View
              </h2>
              <button
                type="button"
                onClick={() => setMapCollapsed((v) => !v)}
                className="rounded-full bg-white p-1.5 text-pink-500 shadow-sm transition-colors hover:bg-pink-50"
                aria-label={mapCollapsed ? "Expand map" : "Collapse map"}
              >
                {mapCollapsed ? (
                  <ChevronDown className="h-5 w-5" />
                ) : (
                  <ChevronUp className="h-5 w-5" />
                )}
              </button>
            </div>

            {!mapCollapsed && (
              <div className="relative flex-1 min-h-0">
                <VisitedMap
                  pins={allPins}
                  trips={tripWithCoords ? [tripWithCoords] : []}
                  pinMode={canEdit && pinMode}
                  onAddPin={canEdit ? handleAddPinOnMap : undefined}
                  onRemovePin={canEdit ? handleRemovePin : undefined}
                  focusedPin={focusedPin}
                />

                {canEdit && (
                <div className="absolute bottom-4 right-4 z-[1000] flex flex-wrap items-center justify-end gap-2">
                  {days.length > 0 && (
                    <label className="inline-flex h-10 items-center gap-2 rounded-full bg-white/95 px-4 text-sm font-bold text-gray-700 shadow-md backdrop-blur">
                      <span>Pin day</span>
                      <select
                        value={pendingPinDay || days[0]?.date || ""}
                        onChange={(e) => setPendingPinDay(e.target.value)}
                        className="h-7 rounded-full border border-pink-100 bg-pink-50 px-3 text-sm font-bold text-pink-600 outline-none focus:border-pink-400"
                      >
                        {days.map((day, idx) => (
                          <option key={day.date} value={day.date}>
                            Day {idx + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={() => setPinMode((m) => !m)}
                    disabled={!canEdit || days.length === 0}
                    className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold text-white shadow-md transition-all ${
                      pinMode
                        ? "bg-pink-600 ring-4 ring-pink-200"
                        : "bg-pink-500 hover:bg-pink-600"
                    } disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-100`}
                  >
                    <Pin className="h-4 w-4" />
                    {pinMode ? "Click map to add pin" : "Add new pin"}
                  </button>
                </div>
                )}

                {allPins.length > 0 && (
                  <div className="absolute bottom-4 left-4 z-[1000] rounded-xl bg-white/95 p-3 shadow-lg backdrop-blur">
                    <p className="mb-2 text-xs font-bold text-gray-700">Days Legend:</p>
                    <div className="space-y-1">
                      {days.slice(0, 7).map((day, idx) => (
                        <div key={day.date} className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: DAY_COLORS[idx % DAY_COLORS.length] }}
                          />
                          <span className="text-xs text-gray-600">Day {idx + 1}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <TripNavigationTabs
          tripId={trip?.id}
          activeTab="itinerary"
          canEditDestination={canEditDestination}
        />
      </main>

      <button
        type="button"
        onClick={() => setChatOpen((v) => !v)}
        className="fixed bottom-28 right-6 z-[5000] inline-flex min-h-14 items-center gap-3 rounded-full bg-pink-500 px-5 py-3 text-white shadow-xl shadow-pink-200/70 transition-all hover:-translate-y-0.5 hover:bg-pink-600 hover:shadow-2xl sm:bottom-32 sm:right-12"
        aria-label="Open AI Assistant"
        aria-expanded={chatOpen}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
          <MessageSquare className="h-5 w-5" />
        </span>
        <span className="text-left leading-tight">
          <span className="block text-sm font-extrabold">AI Assistant</span>
          <span className="block text-xs font-semibold text-pink-100">Trip ideas</span>
        </span>
      </button>

      {chatOpen && (
        <AIAssistPopup
          tripId={tripId}
          trip={trip}
          canAddToItinerary={canEdit}
          onAddToItinerary={addRecommendationToItinerary}
          days={days.map((d, i) => ({ date: d.date, label: `Day ${i + 1}` }))}
          onClose={() => setChatOpen(false)}
        />
      )}

      {canEdit && editingItem && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/40 px-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleEditPlace(editingItem);
            }}
            className="relative z-[5001] w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 className="mb-4 text-xl font-bold text-pink-500">
              Edit Itinerary Item
            </h2>

            <label className="mb-3 block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">
                Title
              </span>
              <input
                type="text"
                value={editingItem.title || ""}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, title: e.target.value, name: e.target.value })
                }
                className="w-full rounded-xl border border-pink-100 px-3 py-2 focus:border-pink-400 focus:outline-none"
                required
              />
            </label>

            <div className="mb-3 grid grid-cols-2 gap-3">
              <label>
                <span className="mb-1 block text-sm font-semibold text-gray-700">
                  Start Time
                </span>
                <input
                  type="time"
                  value={editingItem.startTime || ""}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, startTime: e.target.value })
                  }
                  className="w-full rounded-xl border border-pink-100 px-3 py-2 focus:border-pink-400 focus:outline-none"
                />
              </label>

              <label>
                <span className="mb-1 block text-sm font-semibold text-gray-700">
                  End Time
                </span>
                <input
                  type="time"
                  value={editingItem.endTime || ""}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, endTime: e.target.value })
                  }
                  className="w-full rounded-xl border border-pink-100 px-3 py-2 focus:border-pink-400 focus:outline-none"
                />
              </label>
            </div>

            <label className="mb-4 block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">
                Notes
              </span>
              <textarea
                value={editingItem.notes || ""}
                onChange={(e) =>
                  setEditingItem({ ...editingItem, notes: e.target.value })
                }
                className="min-h-24 w-full rounded-xl border border-pink-100 px-3 py-2 focus:border-pink-400 focus:outline-none"
                placeholder="Add notes..."
              />
            </label>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={async () => {
                  await releaseItemLock(editingItem.itemId);
                  setEditingItem(null);
                }}
                className="rounded-full px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100"
              >
                Cancel
              </button>

              <button
                type="submit"
                className="rounded-full bg-pink-500 px-5 py-2 text-sm font-bold text-white hover:bg-pink-600"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
