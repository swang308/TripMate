import { Loader2, Lock, Mail, User } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import TripMateLogo from "../components/TripMateLogo";

const initialForm = {
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
};

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5050";

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const titleStyle = {
    textShadow: "2px 2px 0 rgba(255, 105, 180, 0.25)",
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus({ type: "", message: "" });

    if (form.password !== form.confirmPassword) {
      setStatus({ type: "error", message: "Passwords do not match." });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username.trim(),
          email: form.email.trim(),
          password: form.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || data.message || "Registration failed");
      }

      setStatus({
        type: "success",
        message: data.message || "Account created! Taking you to login...",
      });
      setForm(initialForm);
      window.setTimeout(() => navigate("/login"), 900);
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error && error.message 
          ? error.message 
          : "Could not create your account. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white px-6 py-8 sm:px-10">
      <header className="flex items-center justify-start">
        <TripMateLogo />
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-116px)] max-w-6xl items-center gap-10 py-10 lg:grid-cols-[1fr_460px]">
        <section className="text-center lg:text-left">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-pink-400">
            Join the trip
          </p>
          <h1
            className="mt-4 text-4xl font-extrabold text-pink-500 sm:text-5xl lg:text-6xl"
            style={titleStyle}
          >
            Start planning smarter adventures.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-pink-500 sm:text-lg lg:mx-0">
            Create your TripMate account to save itineraries, track your travel
            budget, and build AI-powered plans for every destination.
          </p>
        </section>

        <section className="rounded-3xl bg-pink-100 p-6 shadow-[0_8px_0_rgba(0,0,0,0.06)] sm:p-8">
          <h2 className="text-3xl font-extrabold text-pink-500">
            Create account
          </h2>
          <p className="mt-2 text-sm text-pink-500">
            Your next itinerary is waiting.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="text-sm font-bold text-pink-500">Username</span>
              <span className="mt-2 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-pink-500 shadow-[0_4px_0_rgba(0,0,0,0.04)]">
                <User className="h-5 w-5 flex-none" />
                <input
                  className="w-full bg-transparent text-base text-pink-700 outline-none placeholder:text-pink-300"
                  name="username"
                  type="text"
                  value={form.username}
                  onChange={handleChange}
                  placeholder="traveler123"
                  minLength="3"
                  required
                />
              </span>
            </label>

            <label className="block">
              <span className="text-sm font-bold text-pink-500">Email</span>
              <span className="mt-2 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-pink-500 shadow-[0_4px_0_rgba(0,0,0,0.04)]">
                <Mail className="h-5 w-5 flex-none" />
                <input
                  className="w-full bg-transparent text-base text-pink-700 outline-none placeholder:text-pink-300"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  required
                />
              </span>
            </label>

            <label className="block">
              <span className="text-sm font-bold text-pink-500">Password</span>
              <span className="mt-2 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-pink-500 shadow-[0_4px_0_rgba(0,0,0,0.04)]">
                <Lock className="h-5 w-5 flex-none" />
                <input
                  className="w-full bg-transparent text-base text-pink-700 outline-none placeholder:text-pink-300"
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="At least 8 characters"
                  minLength="8"
                  required
                />
              </span>
            </label>

            <label className="block">
              <span className="text-sm font-bold text-pink-500">
                Confirm password
              </span>
              <span className="mt-2 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-pink-500 shadow-[0_4px_0_rgba(0,0,0,0.04)]">
                <Lock className="h-5 w-5 flex-none" />
                <input
                  className="w-full bg-transparent text-base text-pink-700 outline-none placeholder:text-pink-300"
                  name="confirmPassword"
                  type="password"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  placeholder="Repeat your password"
                  minLength="8"
                  required
                />
              </span>
            </label>

            {status.message && (
              <p
                className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
                  status.type === "success"
                    ? "bg-white text-emerald-600"
                    : "bg-white text-red-500"
                }`}
              >
                {status.message}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-pink-400 px-8 py-4 text-lg font-bold text-white shadow-[0_7px_0_rgba(0,0,0,0.08)] transition-all duration-200 hover:bg-pink-500 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting && <Loader2 className="h-5 w-5 animate-spin" />}
              Create my account
            </button>
          </form>

          <button
            type="button"
            onClick={() => navigate("/login")}
            className="mt-6 w-full text-center text-sm font-semibold text-pink-500 underline transition-colors hover:text-pink-600"
          >
            Already have an account?
          </button>
        </section>
      </main>
    </div>
  );
}