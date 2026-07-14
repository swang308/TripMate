import { KeyRound, Loader2, Mail } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import TripMateLogo from "../components/TripMateLogo";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5050";

export default function AccountRecoveryPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const titleStyle = {
    fontFamily: "'Comic Sans MS', cursive",
    textShadow: "2px 2px 0 rgba(255, 105, 180, 0.25)",
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus({ type: "", message: "" });

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/users/account-recovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Could not find that account.");
      }

      setStatus({
        type: "success",
        message: "Account found! Taking you to reset your password...",
      });

      window.setTimeout(() => {
        navigate("/reset-password", { state: { email: email.trim() } });
      }, 900);
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error && error.message 
          ? error.message 
          : "Could not recover your account. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center bg-pink-100 px-6 py-10"
      data-testid="account-recovery-page"
    >
      <div className="w-full max-w-2xl">
        <header className="absolute left-6 top-6 sm:left-10 sm:top-8">
          <TripMateLogo />
        </header>

        <h1
          className="text-center text-5xl font-extrabold text-pink-500 sm:text-6xl"
          style={titleStyle}
        >
          Account Recovery
        </h1>

        <section className="mt-10 rounded-3xl bg-white p-8 shadow-[0_8px_0_rgba(0,0,0,0.06)] sm:p-10">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-pink-50">
              <KeyRound className="h-9 w-9 text-pink-500" />
            </div>
          </div>

          <p className="mt-6 text-center text-sm font-semibold text-pink-400">
            Enter your email address to find your TripMate account.
          </p>

          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <label className="block">
              <span className="text-sm font-bold text-pink-500">Email</span>
              <span className="mt-2 flex items-center gap-3 rounded-2xl border border-pink-100 bg-white px-4 py-3 text-pink-500 shadow-[0_4px_0_rgba(0,0,0,0.04)]">
                <Mail className="h-5 w-5 flex-none" />
                <input
                  className="w-full bg-transparent text-base text-pink-700 outline-none placeholder:text-pink-300"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </span>
            </label>

            {status.message && (
              <p
                className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
                  status.type === "success"
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-red-50 text-red-500"
                }`}
              >
                {status.message}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-pink-400 px-8 py-4 text-lg font-bold text-white shadow-[0_7px_0_rgba(0,0,0,0.08)] transition-all duration-200 hover:bg-pink-500 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting && <Loader2 className="h-5 w-5 animate-spin" />}
              Continue
            </button>
          </form>

          <button
            type="button"
            onClick={() => navigate("/login")}
            className="mt-6 w-full text-center text-sm font-semibold text-pink-500 underline transition-colors hover:text-pink-600"
          >
            Back to login
          </button>
        </section>
      </div>
    </div>
  );
}