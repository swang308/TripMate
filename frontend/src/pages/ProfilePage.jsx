import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Pencil, MapPin, Heart, CalendarClock, History, Plus } from "lucide-react";
import AppHeader from "../components/AppHeader";
import VisitedMap from "../components/VisitedMap";
import { API_BASE_URL, getAuthHeaders } from "../lib/api";
import { loadFavoriteIds } from "../lib/favorites";
import { geocodePlace } from "../utils/geocoding";

const CURRENT_USER_KEY = "tripmate_currentUser";

function parseDateOnly(dateStr) {
  const match = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateRange(startDate, endDate) {
  const opts = { month: "short", day: "numeric" };
  const start = parseDateOnly(startDate);
  if (!start) return "";
  const end = parseDateOnly(endDate);
  if (!end) return start.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  return `${start.toLocaleDateString("en-US", opts)} - ${end.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
}

function normalizePlaceName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function getTripDestination(trip) {
  return trip?.destinationCity || trip?.destination || trip?.title || trip?.name || "";
}

function extractCountryFromDisplayName(displayName) {
  const parts = String(displayName || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts[parts.length - 1] || "";
}

const emptyProfile = {
  id: "",
  lastName: "",
  firstName: "",
  username: "",
  email: "",
  avatar: "",
  avatarUrl: "",
};

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function FieldRow({ label, name, value, editing, onEdit, onChange, type = "text" }) {
  return (
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <div className="mt-1 flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm">
        <input
          name={name}
          type={type}
          value={value || ""}
          onChange={onChange}
          readOnly={!editing}
          className={`w-full bg-transparent text-base outline-none ${
            editing ? "text-pink-700" : "text-gray-700"
          }`}
        />
        <button
          type="button"
          onClick={onEdit}
          className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-pink-500 text-white shadow hover:bg-pink-600"
          aria-label={`Edit ${label}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState(() => {
    const rawData = load(CURRENT_USER_KEY, emptyProfile);
    const { password, passwordHash, ...safeData } = rawData;
    const data = { ...emptyProfile, ...safeData };
    if (data.username && !data.username.startsWith("@")) {
      data.username = `@${data.username}`;
    }
    return data;
  });
  
  const [pins, setPins] = useState([]);
  const [editing, setEditing] = useState({});
  const [pinMode, setPinMode] = useState(false);
  const [searchPlace, setSearchPlace] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const [myTrips, setMyTrips] = useState([]);
  const [tripsWithCoords, setTripsWithCoords] = useState([]);
  const [tripsLoaded, setTripsLoaded] = useState(false);

  const mergeProfile = (user) => {
    if (!user) return;
    setProfile((current) => {
      const next = {
        ...current,
        ...user,
        avatar: user.avatar || user.avatarUrl || current.avatar || "",
        avatarUrl: user.avatarUrl || user.avatar || current.avatarUrl || "",
        username: user.username || user.displayName || current.username || "",
      };
      if (next.username && !next.username.startsWith("@")) {
        next.username = `@${next.username}`;
      }
      return next;
    });
  };

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/users/me`, {
          headers: getAuthHeaders(),
        });
        const data = await response.json();
        if (active && response.ok) {
          mergeProfile(data.user);
        }
      } catch (error) {
        console.error("Failed to load profile:", error);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const userIdentifier = profile?.username || profile?.email || "guest";
    const userPinsKey = `tripmate_visited_pins_${userIdentifier}`;
    const storedPins = load(userPinsKey, null);
    if (storedPins) {
      setPins(storedPins);
    } else {
      setPins([]);
    }
  }, [profile?.username, profile?.email]);

  useEffect(() => {
    const userIdentifier = profile?.username || profile?.email || "guest";
    if (userIdentifier === "guest") return;
    const userPinsKey = `tripmate_visited_pins_${userIdentifier}`;
    localStorage.setItem(userPinsKey, JSON.stringify(pins));
  }, [pins, profile?.username, profile?.email]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/trips`, {
          headers: getAuthHeaders(),
        });
        const data = await response.json();
        if (active && response.ok) setMyTrips(data.trips || []);
      } catch (error) {
        console.error("Failed to load trips for profile:", error);
      } finally {
        if (active) setTripsLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (myTrips.length === 0) {
      setTripsWithCoords([]);
      return;
    }

    async function geocodeAllTrips() {
      const updatedTrips = await Promise.all(
        myTrips.map(async (trip) => {
          if (Number.isFinite(Number(trip.lat)) && Number.isFinite(Number(trip.lng))) {
            return { ...trip, lat: Number(trip.lat), lng: Number(trip.lng) };
          }
          const targetLocation = getTripDestination(trip);
          if (targetLocation && typeof geocodePlace === "function") {
            try {
              const coords = await geocodePlace(targetLocation);
              if (coords?.lat && coords?.lng) {
                return {
                  ...trip,
                  lat: Number(coords.lat),
                  lng: Number(coords.lng),
                  destinationCountry:
                    trip.destinationCountry ||
                    coords.country ||
                    extractCountryFromDisplayName(coords.displayName),
                  geocodedCity: coords.city || "",
                };
              }
            } catch (geoError) {
              console.error(`Failed to geocode profile destination: ${targetLocation}`, geoError);
            }
          }
          return null;
        })
      );
      setTripsWithCoords(updatedTrips.filter(Boolean));
    }

    geocodeAllTrips();
  }, [myTrips]);

  const { upcomingTrips, pastTrips, savedTrips } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const favSet = new Set(loadFavoriteIds());

    const upcoming = [];
    const past = [];
    myTrips.forEach((trip) => {
      const end = parseDateOnly(trip.endDate) || parseDateOnly(trip.startDate);
      if (end && end < today) past.push(trip);
      else upcoming.push(trip);
    });

    return {
      upcomingTrips: upcoming,
      pastTrips: past,
      savedTrips: myTrips.filter((trip) => favSet.has(String(trip.id))),
    };
  }, [myTrips]);

  useEffect(() => {
    const currentUser = load(CURRENT_USER_KEY, {});
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({ ...currentUser, ...profile }));
  }, [profile]);

  const normalizedPins = useMemo(() => {
    return pins.map(pin => ({
      ...pin,
      label: pin.label || pin.title || "Trip Location",
      title: pin.title || pin.label || "Trip Location"
    }));
  }, [pins]);

  const handleChange = (e) => setProfile((p) => ({ ...p, [e.target.name]: e.target.value }));
  const toggleEdit = (field) => setEditing((e) => ({ ...e, [field]: !e[field] }));

  const handleAvatarClick = () => fileInputRef.current?.click();
  const saveProfile = async (updates) => {
    const response = await fetch(`${API_BASE_URL}/api/users/me`, {
      method: "PUT",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(updates),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Failed to update profile.");
    }
    mergeProfile(data.user);
    return data.user;
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert("Please choose an image smaller than 2 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const avatar = typeof ev.target.result === "string" ? ev.target.result : "";
      setProfile((p) => ({ ...p, avatar, avatarUrl: avatar }));

      try {
        await saveProfile({
          firstName: profile.firstName,
          lastName: profile.lastName,
          displayName: profile.username?.replace(/^@/, ""),
          avatarUrl: avatar,
        });
      } catch (error) {
        console.error("Failed to save avatar:", error);
        alert(error.message || "Could not save your profile photo. Please try again.");
      }
    };
    reader.readAsDataURL(file);
  };

  const addPin = (pin) => setPins((cur) => [...cur, pin]);
  const removePin = (id) => setPins((cur) => cur.filter((p) => p.id !== id));

  const handleAddCustomPlace = async (e) => {
    e.preventDefault();
    if (!searchPlace.trim() || isGeocoding) return;

    setIsGeocoding(true);
    try {
      const coords = await geocodePlace(searchPlace.trim());
      if (coords?.lat && coords?.lng) {
        const newPin = {
          id: `custom_${Date.now()}`,
          lat: Number(coords.lat),
          lng: Number(coords.lng),
          label: searchPlace.trim(),
          title: searchPlace.trim()
        };
        addPin(newPin);
        setSearchPlace("");
      } else {
        alert("Could not locate this place. Please try a different name.");
      }
    } catch (error) {
      console.error("Geocoding failed:", error);
      alert("An error occurred while pinning the place.");
    } finally {
      setIsGeocoding(false);
    }
  };

  const stats = useMemo(() => {
    const uniqueCountries = new Set();
    const uniqueCities = new Set();
    const uniquePlaces = new Set();
    const enrichedTripsById = new Map(
      tripsWithCoords.map((trip) => [String(trip.id || trip._id || getTripDestination(trip)), trip])
    );

    myTrips.forEach((trip) => {
      const enrichedTrip =
        enrichedTripsById.get(String(trip.id || trip._id || getTripDestination(trip))) || trip;
      const destination = getTripDestination(enrichedTrip);
      const normalizedDestination = normalizePlaceName(destination);

      if (normalizedDestination) {
        uniqueCities.add(normalizedDestination);
        uniquePlaces.add(normalizedDestination);
      }

      const country =
        enrichedTrip.destinationCountry ||
        enrichedTrip.country ||
        extractCountryFromDisplayName(enrichedTrip.displayName);
      const normalizedCountry = normalizePlaceName(country);
      if (normalizedCountry) {
        uniqueCountries.add(normalizedCountry);
      }
    });

    normalizedPins.forEach((pin) => {
      const normalizedPin = normalizePlaceName(pin.label || pin.title);
      if (normalizedPin) uniquePlaces.add(normalizedPin);
    });

    return {
      countries: uniqueCountries.size,
      cities: uniqueCities.size,
      places: uniquePlaces.size,
    };
  }, [myTrips, normalizedPins, tripsWithCoords]);

  return (
    <div className="min-h-screen bg-white">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-6 py-10 sm:px-10">
        <div className="grid gap-8 lg:grid-cols-[420px_1fr]">
        <section className="rounded-3xl bg-pink-100 p-8 shadow-[0_8px_0_rgba(0,0,0,0.05)]">
          <div className="flex flex-col items-center">
            <div className="relative">
              <div className="h-44 w-44 overflow-hidden rounded-full ring-4 ring-pink-400">
                {profile.avatar ? (
                  <img src={profile.avatar} alt="avatar" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-pink-200 text-5xl font-bold text-pink-500 uppercase">
                    {profile.username?.[0] === "@" ? profile.username?.[1] || "?" : profile.username?.[0] || "?"}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleAvatarClick}
                className="absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-pink-500 text-white shadow-lg hover:bg-pink-600"
                aria-label="Change photo"
              >
                <Camera className="h-5 w-5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>

            <h2 className="mt-6 text-3xl font-extrabold text-gray-800">Edit Profile</h2>
          </div>

          <div className="mt-8 rounded-2xl bg-pink-50 p-5">
            <div className="space-y-4">
              <FieldRow label="Last Name"  name="lastName"  value={profile.lastName}
                editing={!!editing.lastName}  onEdit={() => toggleEdit("lastName")}  onChange={handleChange} />
              <FieldRow label="First Name" name="firstName" value={profile.firstName}
                editing={!!editing.firstName} onEdit={() => toggleEdit("firstName")} onChange={handleChange} />
              <FieldRow label="Username"   name="username"  value={profile.username}
                editing={!!editing.username}  onEdit={() => toggleEdit("username")}  onChange={handleChange} />
              <FieldRow label="Email"      name="email"     value={profile.email}     type="email"
                editing={!!editing.email}     onEdit={() => toggleEdit("email")}     onChange={handleChange} />
            </div>

            <div className="mt-8 flex justify-center">
              <a
                href="/change-password"
                className="rounded-full bg-pink-400 px-8 py-3 text-base font-bold text-white shadow-[0_5px_0_rgba(0,0,0,0.08)] hover:bg-pink-500 active:translate-y-0.5"
              >
                Change Password
              </a>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <div className="relative h-[420px] overflow-hidden rounded-3xl shadow-lg">
            <VisitedMap
              pins={normalizedPins}
              trips={tripsWithCoords}
              pinMode={pinMode}
              onAddPin={addPin}
              onRemovePin={removePin}
            />
            
            <div className="absolute top-4 right-4 z-[1000] flex w-80 max-w-[calc(100%-2rem)] flex-col items-end gap-3">
              <form onSubmit={handleAddCustomPlace} className="flex w-full items-center gap-2 rounded-full bg-white p-1.5 shadow-xl ring-1 ring-black/5">
                <input
                  type="text"
                  placeholder="Add Place..."
                  value={searchPlace}
                  onChange={(e) => setSearchPlace(e.target.value)}
                  className="w-full bg-transparent pl-3 text-sm text-gray-700 outline-none"
                  disabled={isGeocoding}
                />
                <button
                  type="submit"
                  disabled={isGeocoding || !searchPlace.trim()}
                  className="flex items-center gap-1 rounded-full bg-pink-500 px-4 py-2 text-xs font-bold text-white shadow transition-all hover:bg-pink-600 disabled:bg-gray-300 whitespace-nowrap"
                >
                  {isGeocoding ? (
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      <Plus className="h-3 w-3" />
                      <span>Add Place</span>
                    </>
                  )}
                </button>
              </form>

              <button
                type="button"
                onClick={() => setPinMode((m) => !m)}
                className={`flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold text-white shadow-lg transition-all ${
                  pinMode ? "bg-pink-600 ring-4 ring-pink-200" : "bg-pink-500 hover:bg-pink-600"
                }`}
              >
                <MapPin className="h-4 w-4" />
                {pinMode ? "Tap map to drop pin" : "Pin visited places"}
              </button>
            </div>
          </div>

          <div className="rounded-3xl bg-pink-100 p-8 shadow-[0_8px_0_rgba(0,0,0,0.05)]">
            <h3 className="text-2xl font-extrabold text-pink-500">You have visited:</h3>
            <div className="mt-6 grid grid-cols-3 gap-4 text-center">
              <SmartStat value={stats.countries} label="Countries" />
              <SmartStat value={stats.cities}    label="Cities" />
              <SmartStat value={stats.places}    label="Places" />
            </div>
          </div>
        </section>
        </div>

        <section className="mt-10 rounded-3xl bg-white p-6 shadow-[0_8px_0_rgba(0,0,0,0.05)] ring-1 ring-pink-100 sm:p-8">
          <div className="flex items-center gap-2">
            <Heart className="h-6 w-6 fill-pink-500 text-pink-500" />
            <h3 className="text-2xl font-extrabold text-pink-500">Saved Trips</h3>
            <span className="ml-1 rounded-full bg-pink-100 px-2.5 py-0.5 text-sm font-bold text-pink-500">
              {savedTrips.length}
            </span>
          </div>
          {savedTrips.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">
              {tripsLoaded
                ? "No saved trips yet. Tap the heart on a trip on your home page to save it here."
                : "Loading your trips..."}
            </p>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {savedTrips.map((trip) => (
                <TripMiniCard
                  key={trip.id}
                  trip={trip}
                  saved
                  onOpen={() => navigate(`/trips/${trip.id}`)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="mt-8 rounded-3xl bg-white p-6 shadow-[0_8px_0_rgba(0,0,0,0.05)] ring-1 ring-pink-100 sm:p-8">
          <h3 className="text-2xl font-extrabold text-pink-500">Trip History</h3>

          <div className="mt-5">
            <div className="flex items-center gap-2 text-pink-400">
              <CalendarClock className="h-5 w-5" />
              <h4 className="text-lg font-extrabold">Upcoming</h4>
              <span className="text-sm font-bold text-pink-300">({upcomingTrips.length})</span>
            </div>
            {upcomingTrips.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">
                {tripsLoaded ? "No upcoming trips." : "Loading..."}
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {upcomingTrips.map((trip) => (
                  <TripMiniCard
                    key={trip.id}
                    trip={trip}
                    onOpen={() => navigate(`/trips/${trip.id}`)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="mt-8">
            <div className="flex items-center gap-2 text-gray-400">
              <History className="h-5 w-5" />
              <h4 className="text-lg font-extrabold">Past</h4>
              <span className="text-sm font-bold text-gray-300">({pastTrips.length})</span>
            </div>
            {pastTrips.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">
                {tripsLoaded ? "No past trips yet." : "Loading..."}
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pastTrips.map((trip) => (
                  <TripMiniCard
                    key={trip.id}
                    trip={trip}
                    past
                    onOpen={() => navigate(`/trips/${trip.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function TripMiniCard({ trip, onOpen, saved = false, past = false }) {
  const dateLabel = formatDateRange(trip.startDate, trip.endDate);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group flex flex-col rounded-2xl border border-pink-100 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-pink-200 hover:shadow-md ${
        past ? "opacity-90" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h5 className="font-bold text-gray-800 group-hover:text-pink-600">
          {trip.title || "Untitled trip"}
        </h5>
        {saved && <Heart className="h-4 w-4 flex-none fill-pink-500 text-pink-500" />}
      </div>
      {trip.destination && (
        <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
          <MapPin className="h-3.5 w-3.5 flex-none text-pink-300" />
          <span className="truncate">{trip.destination}</span>
        </p>
      )}
      {dateLabel && (
        <p className="mt-2 text-xs font-semibold text-pink-400">{dateLabel}</p>
      )}
    </button>
  );
}

function SmartStat({ value, label }) {
  return (
    <div>
      <p className="text-5xl font-extrabold text-pink-500">{value}</p>
      <p className="mt-2 text-lg font-semibold text-pink-400">{label}</p>
    </div>
  );
}
