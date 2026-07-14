import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, X, Loader2 } from "lucide-react";
import AppHeader from "../components/AppHeader";
import VisitedMap from "../components/VisitedMap";

const CURRENT_USER_KEY = "tripmate_currentUser";
const PINS_KEY = "tripmate_visited_pins";

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const [profile] = useState(() => load(CURRENT_USER_KEY, {}));
  const [pins] = useState(() => load(PINS_KEY, []));
  
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trips = useMemo(() => {
    try {
      const raw = localStorage.getItem("tripmate_trips");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, []);

  const normalizedPins = useMemo(() => {
    return pins.map(pin => ({
      ...pin,
      label: pin.label || pin.title || "Trip Location",
      title: pin.title || pin.label || "Trip Location"
    }));
  }, [pins]);

  const stats = {
    countries: 1,
    cities: Math.min(normalizedPins.length, 5),
    places: normalizedPins.length,
  };

  const hasMinLength = newPassword.length >= 8;
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);
  const passwordsMatch = newPassword && newPassword === confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!hasMinLength) {
      setError("Password must be at least 8 characters long");
      return;
    }

    if (!hasSpecialChar) {
      setError("Password must contain at least one special character");
      return;
    }

    if (!passwordsMatch) {
      setError("New passwords do not match");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("http://localhost:5050/api/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: profile.email, 
          currentPassword: currentPassword,
          password: newPassword 
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || `Request failed (${response.status})`);
      }

      setSuccess(true);
      setTimeout(() => {
        navigate("/profile");
      }, 2000);
    } catch (err) {
      setError(
        err instanceof Error && err.message 
          ? err.message 
          : "Could not change your password. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white" data-testid="change-password-page">
      <AppHeader />

      <main className="mx-auto grid max-w-7xl gap-8 px-6 py-10 lg:grid-cols-[420px_1fr] sm:px-10">
        <section className="rounded-3xl bg-pink-100 p-8 shadow-[0_8px_0_rgba(0,0,0,0.05)]">
          <button
            onClick={() => navigate("/profile")}
            className="mb-4 flex items-center gap-2 text-pink-500 hover:text-pink-600"
            data-testid="back-to-profile-button"
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="font-semibold">Back to Profile</span>
          </button>

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
            </div>

            <h2 className="mt-6 text-3xl font-extrabold text-gray-800">Change Password</h2>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 rounded-2xl bg-pink-50 p-5">
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500">Current Password:</p>
                <div className="mt-1 rounded-full bg-white px-4 py-2 shadow-sm">
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full bg-transparent text-base text-gray-700 outline-none"
                    data-testid="current-password-input"
                    required
                  />
                </div>
              </div>

              <div className="rounded-xl bg-white p-4">
                <p className="mb-2 text-sm font-semibold text-gray-700">Password Rules:</p>
                <div className="space-y-1 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    {hasMinLength ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <X className="h-4 w-4 text-gray-400" />
                    )}
                    <span className={hasMinLength ? "text-green-600" : ""}>
                      Minimum 8 characters
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasSpecialChar ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <X className="h-4 w-4 text-gray-400" />
                    )}
                    <span className={hasSpecialChar ? "text-green-600" : ""}>
                      At least one special character
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">(e.g. ! @ # $ % ^ & * ? )</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-500">New Password:</p>
                <div className="mt-1 rounded-full bg-white px-4 py-2 shadow-sm">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-transparent text-base text-gray-700 outline-none"
                    data-testid="new-password-input"
                    required
                  />
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-500">Confirm New Password:</p>
                <div className="mt-1 rounded-full bg-white px-4 py-2 shadow-sm">
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-transparent text-base text-gray-700 outline-none"
                    data-testid="confirm-password-input"
                    required
                  />
                </div>
                {confirmPassword && !passwordsMatch && (
                  <p className="mt-1 text-xs text-red-500">Passwords do not match</p>
                )}
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600" data-testid="error-message">
                {error}
              </div>
            )}

            {success && (
              <div className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-600" data-testid="success-message">
                Password changed successfully! Redirecting...
              </div>
            )}

            <div className="mt-8 flex justify-center">
              <button
                type="submit"
                className="flex items-center gap-2 rounded-full bg-pink-400 px-8 py-3 text-base font-bold text-white shadow-[0_5px_0_rgba(0,0,0,0.08)] hover:bg-pink-500 active:translate-y-0.5 disabled:opacity-50"
                data-testid="confirm-button"
                disabled={success || isSubmitting}
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm
              </button>
            </div>
          </form>
        </section>

        <section className="flex flex-col gap-6">
          <div className="relative h-[420px] overflow-hidden rounded-3xl shadow-lg">
            <VisitedMap pins={normalizedPins} trips={trips} pinMode={false} />
          </div>

          <div className="rounded-3xl bg-pink-100 p-8 shadow-[0_8px_0_rgba(0,0,0,0.05)]">
            <h3 className="text-2xl font-extrabold text-pink-500">You have visited:</h3>
            <div className="mt-6 grid grid-cols-3 gap-4 text-center">
              <Stat value={stats.countries} label="Countries" />
              <Stat value={stats.cities} label="Cities" />
              <Stat value={stats.places} label="Places" />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({ value, label }) {
  return (
    <div>
      <p className="text-5xl font-extrabold text-pink-500">{value}</p>
      <p className="mt-2 text-lg font-semibold text-pink-400">{label}</p>
    </div>
  );
}