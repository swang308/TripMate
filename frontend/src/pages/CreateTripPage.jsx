import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Calendar,
  CheckCircle,
  Clock3,
  Image,
  Mail,
  Plus,
  Send,
  Trash2,
  Upload,
  User as UserIcon,
  Users,
} from "lucide-react";
import AppHeader from "../components/AppHeader";
import { API_BASE_URL, getAuthHeaders } from "../lib/api";
import { geocodePlace } from "../utils/geocoding";

function deriveTitle(destination) {
  const trimmed = (destination || "").trim();
  if (!trimmed) return "Untitled Trip";
  const city = trimmed.split(",")[0].trim();
  return `Trip to ${city || trimmed}`;
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
    valueMatches(trip.createdBy, currentUser.userId) ||
    valueMatches(trip.ownerId, currentUser.id) ||
    valueMatches(trip.ownerId, currentUser.userId) ||
    valueMatches(trip.ownerId, currentUser._id) ||
    valueMatches(trip.ownerEmail, currentUser.email) ||
    valueMatches(trip.ownerUsername, currentUser.username) ||
    valueMatches(trip.ownerName, currentDisplayName) ||
    trip.ownerName === "Me"
  );
}

function splitTravellers(value) {
  if (!value || typeof value !== "string") return [];

  return value
    .split(/[|,\n;]/)
    .map((traveller) => traveller.trim())
    .filter(Boolean);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function extractInviteEmails(value) {
  const seen = new Set();
  return splitTravellers(value)
    .map((traveller) => traveller.toLowerCase())
    .filter((traveller) => {
      if (!isValidEmail(traveller) || seen.has(traveller)) return false;
      seen.add(traveller);
      return true;
    });
}

function makeTravellerId(status, value) {
  return `${status}-${String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
}

export default function CreateTripPage() {
  const navigate = useNavigate();
  const { tripId } = useParams();
  const isEditing = Boolean(tripId);

  const currentUser = useMemo(() => {
    try {
      const raw = localStorage.getItem("tripmate_currentUser");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const ownerName =
    currentUser?.displayName ||
    currentUser?.firstName ||
    currentUser?.username ||
    "Me";
  const ownerId = currentUser?.id || currentUser?._id || "";
  const ownerEmail = currentUser?.email || "";
  const ownerUsername = currentUser?.username || "";

  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [tripType, setTripType] = useState("solo");
  const [travellers, setTravellers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [showInviteInput, setShowInviteInput] = useState(false);
  const [existingInviteEmails, setExistingInviteEmails] = useState([]);
  const [tripImage, setTripImage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [isLoadingTrip, setIsLoadingTrip] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!isEditing) return;

    let active = true;

    const loadTripFromDb = async () => {
      setIsLoadingTrip(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/trips/${tripId}`,
          { headers: getAuthHeaders() }
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Failed to load trip");
        }

        const existingTrip = data.trip;
        if (!existingTrip) {
          throw new Error("We couldn't find that trip.");
        }

        if (!isTripOwner(existingTrip, currentUser)) {
          if (active) {
            setIsLoadingTrip(false);
            navigate("/homepage", { replace: true });
          }
          return;
        }

        if (!active) return;

        setDestination(existingTrip.destination || existingTrip.title || "");
        setStartDate(
          existingTrip.startDate ? String(existingTrip.startDate).slice(0, 10) : ""
        );
        setEndDate(
          existingTrip.endDate ? String(existingTrip.endDate).slice(0, 10) : ""
        );
        setTripType(
          existingTrip.tripType || (existingTrip.visibility === "Friends" ? "group" : "solo")
        );
        const acceptedTravellers = splitTravellers(
          existingTrip.activeGroupMembers || existingTrip.collaborators
        ).map((name, index) => ({
          id: `accepted-${index}-${name}`,
          name,
          status: "accepted",
        }));
        const pendingTravellers = splitTravellers(existingTrip.pendingGroupMembers).map(
          (email, index) => ({
            id: `pending-${index}-${email}`,
            email: email.toLowerCase(),
            name: email,
            status: "pending",
          })
        );
        const loadedTravellers = [...acceptedTravellers, ...pendingTravellers];
        setTravellers(loadedTravellers);
        setExistingInviteEmails(pendingTravellers.map((traveller) => traveller.email));
        setShowInviteInput(false);
        setTripImage(existingTrip.tripImage || "");
        setError("");
      } catch (err) {
        if (active) {
          setError(err?.message || "Failed to load trip.");
        }
      } finally {
        if (active) setIsLoadingTrip(false);
      }
    };

    loadTripFromDb();
    return () => {
      active = false;
    };
  }, [currentUser, isEditing, tripId]);

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file for the trip picture.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError("Please choose an image smaller than 2 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setTripImage(typeof reader.result === "string" ? reader.result : "");
      setError("");
    };
    reader.onerror = () => {
      setError("We couldn't read that image. Please try another one.");
    };
    reader.readAsDataURL(file);
  };

  const validate = () => {
    if (!destination.trim()) {
      setError("Please tell us where you're going.");
      return false;
    }
    if (!startDate || !endDate) {
      setError("Please choose both a start and end date.");
      return false;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError("End date must be on or after the start date.");
      return false;
    }
    if (tripType === "group" && inviteEmail.trim()) {
      setError("Click Send Invite before saving this trip.");
      return false;
    }
    setError("");
    return true;
  };

  const fetchCoordinates = async (searchString) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchString)}&limit=1`
      );
      const data = await response.json();
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
        };
      }
      return null;
    } catch (err) {
      console.error("Geocoding failed:", err);
      return null;
    }
  };

  const sendInvitations = async (targetTripId, emails) => {
    const newEmails = emails.filter((email) => !existingInviteEmails.includes(email));

    for (const email of newEmails) {
      const response = await fetch(`${API_BASE_URL}/api/trips/${targetTripId}/invitations`, {
        method: "POST",
        headers: {
          ...getAuthHeaders({ "Content-Type": "application/json" }),
        },
        body: JSON.stringify({
          email,
          role: "Editor",
        }),
      });
      const data = await response.json();

      if (!response.ok && response.status !== 409) {
        throw new Error(data.message || `Failed to invite ${email}`);
      }
    }
  };

  const handleSendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;

    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }

    const alreadyAdded = travellers.some(
      (traveller) => traveller.email?.toLowerCase() === email
    );
    if (alreadyAdded) {
      setError("That traveler is already invited.");
      return;
    }

    setIsSendingInvite(true);
    setError("");

    try {
      if (isEditing) {
        await sendInvitations(tripId, [email]);
        setExistingInviteEmails((current) =>
          current.includes(email) ? current : [...current, email]
        );
      }

      setTravellers((current) => [
        ...current,
        {
          id: makeTravellerId("pending", email),
          email,
          name: email,
          status: "pending",
        },
      ]);
      setInviteEmail("");
      setShowInviteInput(false);
    } catch (err) {
      setError(err?.message || "Failed to send invitation.");
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleRemovePendingTraveller = (travellerId) => {
    setTravellers((current) =>
      current.filter((traveller) => traveller.id !== travellerId)
    );
  };

  const handleSubmit = async (event) => {
  event.preventDefault();
  if (!validate()) return;

  setIsSubmitting(true);

  try {
    const url = isEditing
      ? `${API_BASE_URL}/api/trips/${tripId}`
      : `${API_BASE_URL}/api/trips`;

    const inviteEmails =
      tripType === "group"
        ? travellers
            .filter((traveller) => traveller.status === "pending" && traveller.email)
            .map((traveller) => traveller.email)
        : [];
    const collaboratorNames =
      tripType === "group"
        ? travellers
            .filter((traveller) => traveller.status === "accepted")
            .map((traveller) => traveller.name)
            .join(" | ")
        : "";

    const destinationInfo = await geocodePlace(destination.trim());

    const response = await fetch(url, {
      method: isEditing ? "PUT" : "POST",
      headers: {
        ...getAuthHeaders({ "Content-Type": "application/json" }),
      },
      body: JSON.stringify({
        name: deriveTitle(destination),
        description: "",
        startDate,
        endDate,
        destinationCity: destination.trim(),
        destinationCountry: destinationInfo?.country || "",
        destinationTimezone: "",
        ...(isEditing ? {} : { createdBy: ownerId }),
        visibility: tripType === "group" ? "Friends" : "Private",
        tripType,
        collaborators: tripType === "group" ? collaboratorNames : "",
        tripImage,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || (isEditing ? "Failed to update trip" : "Failed to create trip")
      );
    }

    const savedTripId = isEditing ? tripId : data.tripId;
    if (tripType === "group" && inviteEmails.length > 0) {
      await sendInvitations(savedTripId, inviteEmails);
    }

    navigate(isEditing ? "/homepage" : `/trips/${data.tripId}`);
  } catch (error) {
    console.error(isEditing ? "Update trip error:" : "Create trip error:", error);
    setError(error.message || (isEditing ? "Failed to update trip." : "Failed to create trip."));
  } finally {
    setIsSubmitting(false);
  }
};

  return (
    <div className="min-h-screen bg-white">
      <AppHeader showBackButton backTo="/homepage" />

      <main className="px-4 pb-24 pt-6 sm:px-8">
        <div
          className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,200,221,0.55) 0%, rgba(255,182,193,0.55) 35%, rgba(255,228,225,0.55) 100%)",
          }}
        >
          <svg
            viewBox="0 0 1200 360"
            preserveAspectRatio="xMidYMax slice"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-64 w-full opacity-70"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="city" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fbcfe8" />
                <stop offset="100%" stopColor="#f9a8d4" />
              </linearGradient>
            </defs>
            <path
              fill="url(#city)"
              d="M0 280 L40 260 L60 240 L90 240 L110 200 L140 200 L150 220 L180 220 L200 180 L230 180 L250 210 L290 210 L300 160 L330 160 L340 200 L370 200 L390 180 L420 180 L430 210 L470 210 L490 150 L520 150 L530 100 L560 100 L570 150 L600 150 L620 180 L660 180 L680 140 L710 140 L730 170 L770 170 L790 130 L820 130 L840 170 L880 170 L900 200 L940 200 L960 170 L990 170 L1010 210 L1050 210 L1070 230 L1100 230 L1120 250 L1160 250 L1180 270 L1200 270 L1200 360 L0 360 Z"
            />
          </svg>

          <div className="relative px-6 py-10 sm:px-12 sm:py-16">
            <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
              <h1 className="sr-only">
                {isEditing ? "Edit trip" : "Create a new trip"}
              </h1>

              <div className="space-y-6">
                <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[200px_1fr]">
                  <span className="inline-flex w-fit items-center rounded-full bg-pink-100 px-4 py-2 text-sm font-bold text-pink-500 shadow-sm sm:text-base">
                    Where are we going?
                  </span>
                  <div className="relative">
                    <input
                      type="text"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder="Add a destination (e.g. New York City, NY)"
                      className="w-full rounded-full border border-pink-200 bg-white/95 px-5 py-3 text-pink-700 shadow-sm outline-none placeholder:text-pink-300 focus:border-pink-400"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[200px_1fr]">
                  <span className="inline-flex w-fit items-center rounded-full bg-pink-100 px-4 py-2 text-sm font-bold text-pink-500 shadow-sm sm:text-base">
                    What are the trip dates?
                  </span>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="relative block">
                      <span className="sr-only">Start date</span>
                      <Calendar className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-pink-400" />
                      <input
                        type="date"
                        value={startDate}
                        min={isEditing ? undefined : today}
                        onChange={(e) => {
                          setStartDate(e.target.value);
                          if (endDate && new Date(endDate) < new Date(e.target.value)) {
                            setEndDate("");
                          }
                        }}
                        className="w-full rounded-full border border-pink-200 bg-white/95 px-10 py-3 text-pink-700 shadow-sm outline-none focus:border-pink-400"
                        required
                      />
                    </label>
                    <label className="relative block">
                      <span className="sr-only">End date</span>
                      <Calendar className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-pink-400" />
                      <input
                        type="date"
                        value={endDate}
                        min={isEditing ? startDate || undefined : startDate || today}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full rounded-full border border-pink-200 bg-white/95 px-10 py-3 text-pink-700 shadow-sm outline-none focus:border-pink-400"
                        required
                      />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[200px_1fr]">
                  <span className="inline-flex w-fit items-center rounded-full bg-pink-100 px-4 py-2 text-sm font-bold text-pink-500 shadow-sm sm:text-base">
                    Who is going?
                  </span>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setTripType("solo")}
                      className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold shadow-sm transition-all ${
                        tripType === "solo"
                          ? "bg-pink-500 text-white"
                          : "bg-white text-pink-500 hover:bg-pink-50"
                      }`}
                      aria-pressed={tripType === "solo"}
                    >
                      <UserIcon className="h-4 w-4" />
                      Solo trip
                    </button>
                    <button
                      type="button"
                      onClick={() => setTripType("group")}
                      className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold shadow-sm transition-all ${
                        tripType === "group"
                          ? "bg-pink-500 text-white"
                          : "bg-white text-pink-500 hover:bg-pink-50"
                      }`}
                      aria-pressed={tripType === "group"}
                    >
                      <Users className="h-4 w-4" />
                      Group trip
                    </button>
                  </div>
                </div>

                {tripType === "group" && (
                  <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[200px_1fr]">
                    <span className="inline-flex w-fit items-center rounded-full bg-pink-100 px-4 py-2 text-sm font-bold text-pink-500 shadow-sm sm:text-base">
                      Travelling with
                    </span>
                    <div className="w-full space-y-3 rounded-3xl border border-pink-200 bg-white/95 p-4 shadow-sm">
                      {travellers.length > 0 ? (
                        <div className="space-y-2">
                          {travellers.map((traveller) => {
                            const isPending = traveller.status === "pending";
                            const displayName = isPending
                              ? traveller.email || traveller.name
                              : traveller.name || traveller.email;

                            return (
                              <div
                                key={traveller.id}
                                className="flex items-center justify-between gap-3 rounded-2xl bg-pink-50 px-4 py-3"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-bold text-pink-700 sm:text-base">
                                    {displayName}
                                  </p>
                                  {isPending && (
                                    <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-pink-400">
                                      <Clock3 className="h-3.5 w-3.5" />
                                      pending
                                    </p>
                                  )}
                                </div>
                                {isPending ? (
                                  <Mail className="h-4 w-4 shrink-0 text-pink-400" />
                                ) : (
                                  <CheckCircle className="h-4 w-4 shrink-0 text-pink-500" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="rounded-2xl border border-dashed border-pink-200 bg-white px-4 py-3 text-sm font-medium text-pink-400">
                          No group members yet.
                        </p>
                      )}

                      <div className="border-t border-pink-100 pt-3">
                        <button
                          type="button"
                          onClick={() => setShowInviteInput(true)}
                          className="inline-flex items-center gap-2 rounded-full bg-pink-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-pink-600"
                        >
                          <Plus className="h-4 w-4" />
                          Add member
                        </button>
                      </div>

                      {showInviteInput && (
                        <div className="grid gap-3 border-t border-pink-100 pt-3 sm:grid-cols-[1fr_auto]">
                          <label className="sr-only" htmlFor="invite-email">
                            Member email
                          </label>
                          <input
                            id="invite-email"
                            type="email"
                            value={inviteEmail}
                            onChange={(event) => setInviteEmail(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                handleSendInvite();
                              }
                            }}
                            placeholder="Enter member email"
                            disabled={isSendingInvite}
                            className="w-full rounded-full border border-pink-200 bg-white px-5 py-3 text-pink-700 shadow-sm outline-none placeholder:text-pink-300 focus:border-pink-400"
                          />
                          <button
                            type="button"
                            onClick={handleSendInvite}
                            disabled={isSendingInvite}
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-pink-500 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            <Send className="h-4 w-4" />
                            {isSendingInvite ? "Sending..." : "Send invite"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[200px_1fr]">
                  <span className="inline-flex w-fit items-center rounded-full bg-pink-100 px-4 py-2 text-sm font-bold text-pink-500 shadow-sm sm:text-base">
                    Trip card picture
                  </span>
                  <div className="space-y-3">
                    <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-pink-200 bg-white/90 px-5 py-5 text-center text-pink-500 shadow-sm transition-colors hover:border-pink-400 hover:bg-pink-50/70 sm:flex-row sm:justify-start sm:text-left">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-pink-100">
                        {tripImage ? (
                          <Image className="h-5 w-5" />
                        ) : (
                          <Upload className="h-5 w-5" />
                        )}
                      </span>
                      <span>
                        <span className="block text-sm font-bold">
                          {tripImage ? "Change picture" : "Add a picture"}
                        </span>
                        <span className="block text-xs font-semibold text-pink-300">
                          Optional image for this trip card
                        </span>
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="sr-only"
                      />
                    </label>

                    {tripImage && (
                      <div className="overflow-hidden rounded-2xl border border-pink-100 bg-white shadow-sm">
                        <img
                          src={tripImage}
                          alt="Trip card preview"
                          className="h-44 w-full object-cover"
                        />
                        <div className="flex justify-end px-3 py-2">
                          <button
                            type="button"
                            onClick={() => setTripImage("")}
                            className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-bold text-red-500 transition-colors hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                            Remove picture
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {error && (
                  <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                    {error}
                  </p>
                )}

                <div className="flex flex-col-reverse items-center justify-between gap-3 pt-4 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => navigate("/homepage")}
                    className="text-sm font-semibold text-pink-500 underline hover:text-pink-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-pink-500 px-10 py-3 text-base font-bold text-white shadow-[0_6px_0_rgba(0,0,0,0.08)] transition-all hover:bg-pink-600 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 sm:text-lg"
                  >
                    {isSubmitting
                      ? isEditing
                        ? "Saving..."
                        : "Creating..."
                      : isEditing
                      ? "Save Changes"
                      : "Create Trip"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
