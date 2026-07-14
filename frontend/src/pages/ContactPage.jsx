import { useState } from "react";
import { Mail, MapPin, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import AppHeader from "../components/AppHeader";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emptyForm = { name: "", email: "", message: "" };

export default function ContactPage() {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    if (errors[name]) setErrors((current) => ({ ...current, [name]: "" }));
  };

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = "Please enter your name.";
    if (!EMAIL_REGEX.test(form.email.trim()))
      next.email = "Please enter a valid email address.";
    if (form.message.trim().length < 10)
      next.message = "Message should be at least 10 characters.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    setSubmitting(true);
    // Frontend-only: simulate sending, then confirm.
    window.setTimeout(() => {
      setSubmitting(false);
      setForm(emptyForm);
      toast.success("Thanks for reaching out! We'll get back to you soon.");
    }, 600);
  };

  return (
    <div className="min-h-screen bg-white">
      <AppHeader />

      <main className="mx-auto max-w-5xl px-6 py-12 sm:px-10">
        <section className="text-center">
          <h1 className="text-4xl font-extrabold text-pink-500 sm:text-5xl">
            Get in Touch
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-gray-600">
            Questions, feedback, or ideas? <br />Send us a message and the TripMate
            team will get back to you.
          </p>
        </section>

        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
          {/* Form */}
          <form
            onSubmit={handleSubmit}
            noValidate
            className="rounded-3xl bg-pink-50 p-6 shadow-[0_8px_0_rgba(0,0,0,0.05)] sm:p-8"
          >
            <div className="space-y-5">
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-gray-700">
                  Name
                </span>
                <input
                  name="name"
                  type="text"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Your name"
                  className="w-full rounded-full border border-pink-200 bg-white px-4 py-3 text-gray-700 outline-none focus:border-pink-400"
                />
                {errors.name && (
                  <span className="mt-1 block text-xs font-semibold text-red-500">
                    {errors.name}
                  </span>
                )}
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-bold text-gray-700">
                  Email
                </span>
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  className="w-full rounded-full border border-pink-200 bg-white px-4 py-3 text-gray-700 outline-none focus:border-pink-400"
                />
                {errors.email && (
                  <span className="mt-1 block text-xs font-semibold text-red-500">
                    {errors.email}
                  </span>
                )}
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-bold text-gray-700">
                  Message
                </span>
                <textarea
                  name="message"
                  value={form.message}
                  onChange={handleChange}
                  placeholder="How can we help?"
                  rows={5}
                  className="w-full resize-none rounded-2xl border border-pink-200 bg-white px-4 py-3 text-gray-700 outline-none focus:border-pink-400"
                />
                {errors.message && (
                  <span className="mt-1 block text-xs font-semibold text-red-500">
                    {errors.message}
                  </span>
                )}
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-pink-500 px-8 py-3 text-base font-bold text-white shadow-[0_5px_0_rgba(0,0,0,0.08)] transition-all hover:bg-pink-600 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send className="h-5 w-5" />
              {submitting ? "Sending..." : "Send Message"}
            </button>
          </form>

          {/* Contact info */}
          <aside className="flex flex-col gap-4">
            <div className="rounded-3xl bg-pink-100 p-6 shadow-[0_8px_0_rgba(0,0,0,0.05)]">
              <h2 className="text-lg font-extrabold text-pink-500">
                Contact Info
              </h2>
              <ul className="mt-4 space-y-4 text-sm text-gray-700">
                <li className="flex items-center gap-3">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white text-pink-500">
                    <Mail className="h-4 w-4" />
                  </span>
                  support@tripmate.app
                </li>
                <li className="flex items-center gap-3">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white text-pink-500">
                    <MessageSquare className="h-4 w-4" />
                  </span>
                  TripMate — Group 8, PRJ666
                </li>
                <li className="flex items-center gap-3">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white text-pink-500">
                    <MapPin className="h-4 w-4" />
                  </span>
                  Seneca Polytechnic, Toronto
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
