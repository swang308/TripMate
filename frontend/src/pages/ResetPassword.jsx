import { KeyRound, Loader2, Mail } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import TripMateLogo from "../components/TripMateLogo";

const createInitialForm = (prefilledEmail = "") => ({
  email: prefilledEmail,
  password: "",
  confirmPassword: "",
});

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState(
    createInitialForm(location.state?.email || "")
  );
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const titleStyle = {
    fontFamily: "'Comic Sans MS', cursive",
    textShadow: "2px 2px 0 rgba(255, 105, 180, 0.25)",
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus({ type: "", message: "" });

    if (form.password.length < 8) {
      setStatus({ type: "error", message: "Password must be at least 8 characters." });
      return;
    }
    if (form.password !== form.confirmPassword) {
      setStatus({ type: "error", message: "Passwords do not match." });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("http://localhost:5050/api/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || `Request failed (${response.status})`);
      }

      const rawProfile = localStorage.getItem("tripmate_currentUser");
      const existingProfile = rawProfile ? JSON.parse(rawProfile) : {};
      
      const updatedProfile = {
        ...existingProfile,
        email: form.email,
        password: form.password
      };
      localStorage.setItem("tripmate_currentUser", JSON.stringify(updatedProfile));

      setStatus({ type: "success", message: "Password updated! Taking you to login..." });
      setForm(createInitialForm(location.state?.email || ""));
      window.setTimeout(() => navigate("/login"), 900);
    } catch (error) {
      setStatus({ 
        type: "error", 
        message: error instanceof Error && error.message 
          ? error.message 
          : "Could not reset your password. Please try again." 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center bg-pink-100 px-6 py-10"
      data-testid="reset-password-page"
    >
      <div className="w-full max-w-2xl">
        <header className="absolute left-6 top-6 sm:left-10 sm:top-8">
          <TripMateLogo />
        </header>
        <h1
          className="text-center text-5xl font-extrabold text-pink-500 sm:text-6xl"
          style={titleStyle}
          data-testid="reset-password-title"
        >
          Reset Password
        </h1>

        <section className="mt-10 rounded-3xl bg-white p-8 shadow-[0_8px_0_rgba(0,0,0,0.06)] sm:p-10">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-pink-50">
              <KeyRound className="h-9 w-9 text-pink-500" />
            </div>
          </div>

          <form
            className="mt-8 space-y-6"
            onSubmit={handleSubmit}
            data-testid="reset-password-form"
          >
            <label className="block">
              <span className="text-sm font-bold text-pink-500">Email</span>
              <span className="mt-2 flex items-center gap-3 rounded-2xl border border-pink-100 bg-white px-4 py-3 text-pink-500 shadow-[0_4px_0_rgba(0,0,0,0.04)]">
                <Mail className="h-5 w-5 flex-none" />
                <input
                  className="w-full bg-transparent text-base text-pink-700 outline-none placeholder:text-pink-300"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  required
                  data-testid="reset-password-email-input"
                />
              </span>
            </label>

            <div>
              <p className="text-sm font-semibold text-pink-400">
                New password:
              </p>
              <div className="mt-2 grid gap-3 rounded-2xl border border-pink-100 bg-white p-3 shadow-[0_4px_0_rgba(0,0,0,0.04)] sm:grid-cols-2">
                <input
                  className="w-full rounded-xl bg-transparent px-3 py-2 text-base text-pink-700 outline-none placeholder:text-pink-300"
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="New password"
                  minLength="8"
                  required
                  data-testid="reset-password-new-input"
                />
                <input
                  className="w-full rounded-xl bg-transparent px-3 py-2 text-base text-pink-700 outline-none placeholder:text-pink-300 sm:border-l sm:border-pink-100 sm:pl-4"
                  name="confirmPassword"
                  type="password"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  placeholder="Confirm password"
                  minLength="8"
                  required
                  data-testid="reset-password-confirm-input"
                />
              </div>
            </div>

            {status.message && (
              <p
                className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
                  status.type === "success"
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-red-50 text-red-500"
                }`}
                data-testid="reset-password-status"
              >
                {status.message}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-pink-400 px-8 py-4 text-lg font-bold text-white shadow-[0_7px_0_rgba(0,0,0,0.08)] transition-all duration-200 hover:bg-pink-500 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
              data-testid="reset-password-submit-button"
            >
              {isSubmitting && <Loader2 className="h-5 w-5 animate-spin" />}
              Confirm password
            </button>
          </form>

          <button
            type="button"
            onClick={() => navigate("/login")}
            className="mt-6 w-full text-center text-sm font-semibold text-pink-500 underline transition-colors hover:text-pink-600"
            data-testid="reset-password-back-to-login"
          >
            Back to login
          </button>
        </section>
      </div>
    </div>
  );
}