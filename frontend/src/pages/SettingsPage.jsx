import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Accessibility, AlertTriangle, ArrowRight, Contrast, KeyRound, Trash2, Type, Underline, User as UserIcon, Zap } from "lucide-react";
import { toast } from "sonner";
import AppHeader from "../components/AppHeader";
import { API_BASE_URL, clearSession, getAuthHeaders } from "../lib/api";
import {
  PREFERENCES_KEY,
  loadPreferences,
  savePreferences,
  applyPreferenceEffects,
} from "../lib/preferences";

const PREFERENCE_OPTIONS = [
  {
    key: "highContrast",
    icon: Contrast,
    label: "High contrast",
    description: "Darken muted text and strengthen accents for readability (WCAG 1.4.3).",
  },
  {
    key: "largeText",
    icon: Type,
    label: "Larger text",
    description: "Increase the base font size across the app (WCAG 1.4.4).",
  },
  {
    key: "reducedMotion",
    icon: Zap,
    label: "Reduced motion",
    description: "Minimize animations and transitions (WCAG 2.3.3).",
  },
  {
    key: "underlineLinks",
    icon: Underline,
    label: "Underline links",
    description: "Always underline links so they aren't shown by color alone (WCAG 1.4.1).",
  },
];

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative h-7 w-12 flex-none rounded-full transition-colors ${
        checked ? "bg-pink-500" : "bg-gray-300"
      }`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? "left-6" : "left-1"
        }`}
      />
    </button>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState(loadPreferences);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    savePreferences(preferences);
    applyPreferenceEffects(preferences);
  }, [preferences]);

  const togglePreference = (key) =>
    setPreferences((current) => ({ ...current, [key]: !current[key] }));

  const handleDeleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/me`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Failed to delete account");
      }

      // Clear all local session/state, then send the user to the landing page.
      clearSession();
      localStorage.removeItem("tripmate_favorite_trips");
      localStorage.removeItem(PREFERENCES_KEY);
      toast.success("Your account has been deleted.");
      navigate("/");
    } catch (error) {
      toast.error(error.message || "Could not delete your account.");
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <AppHeader />

      <main className="mx-auto max-w-3xl px-6 py-12 sm:px-10">
        <h1 className="text-4xl font-extrabold text-pink-500">Settings</h1>

        {/* Account */}
        <section className="mt-8 rounded-3xl bg-pink-50 p-6 shadow-[0_8px_0_rgba(0,0,0,0.05)] sm:p-8">
          <h2 className="text-xl font-extrabold text-gray-800">Account</h2>
          <div className="mt-4 space-y-3">
            <button
              type="button"
              onClick={() => navigate("/profile")}
              className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-left shadow-sm transition-colors hover:bg-pink-100/50"
            >
              <span className="flex items-center gap-3 font-semibold text-gray-700">
                <UserIcon className="h-5 w-5 text-pink-500" />
                Edit Profile
              </span>
              <ArrowRight className="h-4 w-4 text-gray-400" />
            </button>

            <button
              type="button"
              onClick={() => navigate("/change-password")}
              className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-left shadow-sm transition-colors hover:bg-pink-100/50"
            >
              <span className="flex items-center gap-3 font-semibold text-gray-700">
                <KeyRound className="h-5 w-5 text-pink-500" />
                Change Password
              </span>
              <ArrowRight className="h-4 w-4 text-gray-400" />
            </button>
          </div>
        </section>

        {/* Accessibility */}
        <section className="mt-6 rounded-3xl bg-pink-50 p-6 shadow-[0_8px_0_rgba(0,0,0,0.05)] sm:p-8">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-gray-800">
            <Accessibility className="h-6 w-6 text-pink-500" />
            Accessibility
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Aligned with AODA / WCAG 2.0 AA. Saved on this device.
          </p>
          <div className="mt-4 space-y-3">
            {PREFERENCE_OPTIONS.map(({ key, icon: Icon, label, description }) => (
              <div
                key={key}
                className="flex items-center justify-between gap-4 rounded-2xl bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-5 w-5 flex-none text-pink-500" />
                  <div>
                    <p className="font-semibold text-gray-700">{label}</p>
                    <p className="text-xs text-gray-500">{description}</p>
                  </div>
                </div>
                <Toggle
                  checked={preferences[key]}
                  onChange={() => togglePreference(key)}
                  label={label}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Danger zone — delete account */}
        <section className="mt-6 rounded-3xl border border-red-200 bg-red-50/60 p-6 shadow-[0_8px_0_rgba(0,0,0,0.04)] sm:p-8">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Delete Account
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Permanently delete your account and all associated data — trips you
            created, itineraries, budgets, and saved items. This action cannot be
            undone.
          </p>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-red-500 px-6 py-3 text-sm font-bold text-white shadow-[0_5px_0_rgba(0,0,0,0.08)] transition-all hover:bg-red-600 active:translate-y-0.5"
          >
            <Trash2 className="h-4 w-4" />
            Delete my account
          </button>
        </section>
      </main>

      {confirmOpen && (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/40 px-4">
          <div
            className="absolute inset-0"
            onClick={() => (deleting ? null : setConfirmOpen(false))}
            aria-hidden="true"
          />
          <div
            className="relative z-[6001] w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
          >
            <h3
              id="delete-account-title"
              className="flex items-center gap-2 text-lg font-extrabold text-red-600"
            >
              <AlertTriangle className="h-5 w-5" />
              Delete your account?
            </h3>
            <p className="mt-3 text-sm text-gray-600">
              This will permanently remove your account and everything tied to
              it. This <span className="font-bold">cannot be undone</span>. Are
              you sure?
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
                className="rounded-full px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-full bg-red-500 px-5 py-2 text-sm font-bold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? "Deleting..." : "Yes, delete my account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
