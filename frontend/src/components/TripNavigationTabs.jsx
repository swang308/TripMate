import { useNavigate } from "react-router-dom";
import { DollarSign, MapPin, Star, Users } from "lucide-react";

function TripNavigationTab({ icon: Icon, label, active, disabled = false, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={
        active
          ? "flex flex-1 items-center justify-center gap-2 rounded-2xl bg-pink-500 px-4 py-5 text-base font-bold text-white shadow-[0_4px_0_rgba(0,0,0,0.06)]"
          : disabled
          ? "flex flex-1 items-center justify-center gap-2 rounded-2xl bg-pink-50 px-4 py-5 text-base font-bold text-pink-300 opacity-60"
          : "flex flex-1 items-center justify-center gap-2 rounded-2xl bg-pink-100 px-4 py-5 text-base font-bold text-pink-500 transition-all hover:bg-pink-200"
      }
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );
}

export default function TripNavigationTabs({ tripId, activeTab, canEditDestination = false }) {
  const navigate = useNavigate();
  const destinationPath = tripId ? `/trips/${tripId}/edit` : "/destination";
  const itineraryPath = tripId ? `/trips/${tripId}` : "/itinerary";
  const budgetPath = tripId ? `/trips/${tripId}/budget` : "/budget";
  const groupPath = tripId ? `/trips/${tripId}/group` : "/group";

  return (
    <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <TripNavigationTab
        icon={MapPin}
        label="Manage Destination"
        active={activeTab === "destination"}
        disabled={!canEditDestination}
        onClick={() => navigate(destinationPath)}
      />
      <TripNavigationTab
        icon={Star}
        label="Manage Itinerary"
        active={activeTab === "itinerary"}
        onClick={() => navigate(itineraryPath)}
      />
      <TripNavigationTab
        icon={DollarSign}
        label="Manage Budget"
        active={activeTab === "budget"}
        onClick={() => navigate(budgetPath)}
      />
      <TripNavigationTab
        icon={Users}
        label="Manage Group"
        active={activeTab === "group"}
        onClick={() => navigate(groupPath)}
      />
    </div>
  );
}