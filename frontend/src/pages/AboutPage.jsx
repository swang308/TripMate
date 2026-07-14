import AppHeader from "../components/AppHeader";

const FEATURES = [
  {
    emoji: "🤖",
    title: "AI-Powered Planning",
    text: "Our built-in assistant suggests food, sightseeing, and nature spots tailored to your trip — add them to any day in one click.",
  },
  {
    emoji: "🗺️",
    title: "Smart Itineraries",
    text: "Build day-by-day plans with an interactive map, drag-and-drop ordering, and automatic place pins.",
  },
  {
    emoji: "💰",
    title: "Shared Budgets",
    text: "Track expenses, split costs among travellers, and see who owes what — in the currency of your choice.",
  },
  {
    emoji: "⚡",
    title: "Real-Time Collaboration",
    text: "Plan together. Itinerary, destination, and budget changes sync live to everyone on the trip.",
  },
];

const TEAM = [
  { name: "Shan-Yun Wang", role: "Full-Stack Developer" },
  { name: "Heng-Min Tsao", role: "Full-Stack Developer" },
  { name: "Syed Abdullah", role: "Full-Stack Developer" },
  { name: "Jackey Zhou", role: "Full-Stack Developer" },
  { name: "Uny Li", role: "Full-Stack Developer" },
];

function initialsFor(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">
      <AppHeader />

      <main className="mx-auto max-w-5xl px-6 py-12 sm:px-10">
        {/* Hero */}
        <section className="text-center">
          <h1 className="text-4xl font-extrabold text-pink-500 sm:text-5xl">
            About TripMate
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-gray-600 sm:text-lg">
            TripMate is your AI travel companion. We help travellers plan smarter
            trips, discover unique places, and collaborate with friends — all in
            one friendly, easy-to-use app.
          </p>
        </section>

        {/* Mission */}
        <section className="mt-12 rounded-3xl bg-pink-100 p-8 shadow-[0_8px_0_rgba(0,0,0,0.05)] sm:p-10">
          <h2 className="text-2xl font-extrabold text-pink-500 sm:text-3xl">
            Our Mission
          </h2>
          <p className="mt-4 text-base leading-relaxed text-gray-700">
            Planning a trip should be exciting, not exhausting. TripMate brings
            itineraries, budgets, recommendations, and group coordination
            together in a single place, so you can spend less time juggling tabs
            and more time looking forward to the journey ahead.
          </p>
        </section>

        {/* What we do */}
        <section className="mt-12">
          <h2 className="text-center text-2xl font-extrabold text-pink-500 sm:text-3xl">
            What TripMate Does
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-3xl border border-pink-100 bg-white p-6 shadow-[0_6px_0_rgba(0,0,0,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_0_rgba(0,0,0,0.06)]"
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{feature.emoji}</span>
                  <h3 className="text-xl font-extrabold text-gray-800">
                    {feature.title}
                  </h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">
                  {feature.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Team */}
        <section className="mt-14">
          <h2 className="text-center text-2xl font-extrabold text-pink-500 sm:text-3xl">
            Meet the Team
          </h2>
          <p className="mt-2 text-center text-sm font-semibold text-pink-400">
            Group 8 · PRJ666 · Summer 2026
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-5 sm:gap-5">
            {TEAM.map((member) => (
              <div
                key={member.name}
                className="flex flex-col items-center rounded-3xl bg-pink-50 p-6 text-center shadow-sm"
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-pink-200 text-2xl font-extrabold text-pink-600">
                  {initialsFor(member.name)}
                </div>
                <p className="mt-4 font-bold text-gray-800">{member.name}</p>
                <p className="mt-1 text-xs font-semibold text-pink-400">
                  {member.role}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
