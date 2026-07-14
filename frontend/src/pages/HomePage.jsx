import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, MapPin, Plus, X } from "lucide-react";
import AppHeader from "../components/AppHeader";
import TripCard from "../components/TripCard";
import TripCommentsDrawer from "../components/TripCommentsDrawer";
import { API_BASE_URL, getAuthHeaders } from "../lib/api";
import { getSocket } from "../lib/socket";
import { loadFavoriteIds, toggleFavorite } from "../lib/favorites";

// Mark trips with their persisted "saved" (liked) state from localStorage.
function withFavorites(trips) {
  const favSet = new Set(loadFavoriteIds());
  return (trips || []).map((trip) => ({
    ...trip,
    favorite: favSet.has(String(trip.id)),
  }));
}


export default function HomePage() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [commentsTrip, setCommentsTrip] = useState(null);
  const [invitations, setInvitations] = useState([]);

  const currentUser = useMemo(() => {
    try {
      const raw = localStorage.getItem("tripmate_currentUser");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const loadInvitations = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/invitations`, {
      headers: getAuthHeaders(),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to load invitations");
    }

    setInvitations(data.invitations || []);
  } catch (error) {
    console.error("Failed to load invitations:", error);
    setInvitations([]);
  }
};

const loadTripsFromDb = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/trips`, {
      headers: getAuthHeaders(),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to load trips");
    }

    setTrips(withFavorites(data.trips));
  } catch (error) {
    console.error("Failed to load trips:", error);
    setTrips([]);
  }
};

  useEffect(() => {
  
  loadTripsFromDb();
  loadInvitations();
}, []);



useEffect(() => {
  const socket = getSocket();

  const refreshHome = () => {
    loadTripsFromDb();
    loadInvitations();
  };

  socket.on("invitation:created", refreshHome);
  socket.on("trip:deleted", refreshHome);
  socket.on("trip:updated", refreshHome);
  socket.on("member:removed", refreshHome);

  return () => {
    socket.off("invitation:created", refreshHome);
    socket.off("trip:deleted", refreshHome);
    socket.off("trip:updated", refreshHome);
    socket.off("member:removed", refreshHome);
  };
}, []);



  const handleToggleFavorite = (id) => {
    const nowFavorite = toggleFavorite(id);
    setTrips((current) =>
      current.map((trip) =>
        trip.id === id ? { ...trip, favorite: nowFavorite } : trip
      )
    );
  };

  const handleDelete = async (id) => {
  const confirmed = window.confirm("Delete this trip? This cannot be undone.");
  if (!confirmed) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/trips/${id}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to delete trip");
    }

    setTrips((current) => current.filter((trip) => trip.id !== id));
  } catch (error) {
    console.error("Delete trip error:", error);
    alert(error.message || "Failed to delete trip.");
  }
};

const handleRespondInvitation = async (invitationId, action) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/invitations/${invitationId}/respond`,
      {
        method: "POST",
        headers: {
          ...getAuthHeaders({ "Content-Type": "application/json" }),
        },
        body: JSON.stringify({ action }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to respond to invitation");
    }

    setInvitations((current) =>
      current.filter((invitation) => invitation.id !== invitationId)
    );

    if (action === "accept") {
      const tripsResponse = await fetch(`${API_BASE_URL}/api/trips`, {
        headers: getAuthHeaders(),
      });
      const tripsData = await tripsResponse.json();

      if (tripsResponse.ok) {
        setTrips(withFavorites(tripsData.trips));
      }
    }
  } catch (error) {
    console.error("Respond invitation error:", error);
    alert(error.message || "Failed to respond to invitation.");
  }
};

  return (
    <div className="min-h-screen bg-white">
      <AppHeader />

      <main className="relative mx-auto max-w-6xl px-6 pb-32 pt-8 sm:px-10">
        <div className="mb-8 flex items-center gap-3">
          <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
            Your Trips
          </h1>
          <ArrowRight className="h-7 w-7 text-gray-900" />
        </div>

        {invitations.length > 0 && (
  <section className="mb-8 rounded-3xl border border-pink-100 bg-pink-50/60 p-5 shadow-sm">
    <h2 className="text-lg font-extrabold text-pink-500">
      Pending Invitations
    </h2>

    <div className="mt-4 space-y-3">
      {invitations.map((invitation) => (
        <div
          key={invitation.id}
          className="flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-bold text-gray-900">
              {invitation.inviterName || "Someone"} invited you to{" "}
              {invitation.tripTitle || "a trip"}
            </p>
            <p className="text-sm text-pink-400">
              Role: {invitation.role}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleRespondInvitation(invitation.id, "accept")}
              className="inline-flex items-center gap-2 rounded-full bg-pink-500 px-4 py-2 text-sm font-bold text-white hover:bg-pink-600"
            >
              <Check className="h-4 w-4" />
              Accept
            </button>

            <button
              type="button"
              onClick={() => handleRespondInvitation(invitation.id, "decline")}
              className="inline-flex items-center gap-2 rounded-full border border-pink-200 px-4 py-2 text-sm font-bold text-pink-500 hover:bg-pink-50"
            >
              <X className="h-4 w-4" />
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  </section>
)}

        {trips.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-pink-200 bg-pink-50/40 px-6 py-20 text-center">
            <MapPin className="h-12 w-12 text-pink-300" />
            <p className="mt-4 text-lg font-bold text-pink-500">
              No trips yet.
            </p>
            <p className="mt-1 max-w-sm text-sm text-pink-400">
              Start by creating your first trip. We'll help you plan, budget,
              and discover places along the way.
            </p>
            <button
              type="button"
              onClick={() => navigate("/trips/new")}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-pink-500 px-6 py-3 text-base font-bold text-white shadow-[0_6px_0_rgba(0,0,0,0.08)] transition-all hover:bg-pink-600 active:translate-y-0.5"
            >
              <Plus className="h-5 w-5" />
              Create your first trip
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {trips.map((trip) => (
              <TripCard
                key={trip.id}
                trip={trip}
                currentUser={currentUser}
                onToggleFavorite={handleToggleFavorite}
                onDelete={handleDelete}
                onOpenComments={(t) => setCommentsTrip(t)}
              />
            ))}
          </div>
        )}

        {trips.length > 0 && (
          <button
            type="button"
            onClick={() => navigate("/trips/new")}
            className="fixed bottom-8 right-8 inline-flex items-center gap-2 rounded-full bg-pink-500 px-6 py-4 text-base font-bold text-white shadow-[0_6px_0_rgba(0,0,0,0.12)] transition-all hover:bg-pink-600 active:translate-y-0.5 sm:bottom-12 sm:right-12 sm:text-lg"
          >
            <Plus className="h-5 w-5" />
            Add new trip
          </button>
        )}
      </main>

      <TripCommentsDrawer
        open={!!commentsTrip}
        trip={commentsTrip}
        currentUser={currentUser}
        onClose={() => setCommentsTrip(null)}
      />
    </div>
  );
}
