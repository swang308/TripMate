import { useNavigate } from "react-router-dom";
import TripMateLogo from "../components/TripMateLogo";

const features = [
  { emoji: "📱", title: "Real-Time updates" },
  { emoji: "💰", title: "Budget Friendly" },
  { emoji: "🤖", title: "AI-Powered Planning" },
  { emoji: "🌍", title: "Smart Itineraries" },
];

export default function Landing() {
  const navigate = useNavigate();
  const pinkColor = {
    logo: { fontFamily: "'Comic Sans MS', cursive" },
    mainText: { textShadow: "2px 2px 0 rgba(255, 105, 180, 0.25)" },
    sectionText: { 
      textShadow: "1px 1px 0 #fff, 2px 2px 0 rgba(255,105,180,0.3), 3px 3px 6px rgba(255,105,180,0.2)" 
    },
    boxText: { 
      textShadow: "2px 2px 0 rgba(255,255,255,0.4), 3px 3px 6px rgba(0,0,0,0.15)" 
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="px-6 sm:px-10 pt-8">
        <TripMateLogo style={pinkColor.logo} />
      </header>

      <section className="px-6 pt-10 sm:pt-16 pb-16 text-center">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-pink-500" style={pinkColor.mainText}>
          Meet Your AI Travel Companion
        </h1>
        <p className="mt-6 max-w-2xl mx-auto text-pink-500 text-base sm:text-lg leading-relaxed">
          Plan smarter trips, discover unique spots, and travel with confidence.
          TripMate uses AI to create personalized itineraries just for you.
        </p>

        <div className="mt-12 flex flex-col items-center">
          <button
            onClick={() => navigate("/register")}
            className="bg-pink-400 hover:bg-pink-500 active:translate-y-0.5 transition-all duration-200 text-white font-bold text-2xl sm:text-3xl px-12 sm:px-16 py-5 rounded-full shadow-[0_8px_0_rgba(0,0,0,0.08)] hover:shadow-[0_4px_0_rgba(0,0,0,0.12)]"
          >
            Start your journey
          </button>
          <button
            onClick={() => navigate("/login")}
            className="mt-6 text-pink-500 underline text-sm hover:text-pink-500 transition-colors cursor-pointer"
          >
            Already have an account?
          </button>
        </div>
      </section>

      <section className="bg-pink-100 px-6 sm:px-12 py-16 mx-4 sm:mx-8 mb-12 rounded-3xl">
        <h2 className="text-center text-4xl sm:text-5xl font-extrabold text-pink-400 mb-12" style={pinkColor.sectionText}>
          Why choose TripMate?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-5xl mx-auto">
          {features.map((f, i) => (
            <div
              key={i}
              className="bg-pink-200/80 rounded-3xl p-12 sm:p-16 flex items-center justify-center min-h-[180px] shadow-[0_6px_0_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all"
            >
              <h3 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-3" style={pinkColor.boxText}>
                <span className="text-3xl sm:text-4xl">{f.emoji}</span>
                {f.title}
              </h3>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
