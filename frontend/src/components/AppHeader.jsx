import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  LogOut,
  Settings,
  User as UserIcon,
} from "lucide-react";
import TripMateLogo from "./TripMateLogo";
import { clearSession } from "../lib/api";

function initialsFor(name) {
  if (!name) return "T";
  const parts = name.trim().split(/\s+/);
  return (
    parts
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "T"
  );
}

const NAV_ITEMS = [
  { to: "/homepage", label: "Home" },
  { to: "/about", label: "About Us" },
  { to: "/contact", label: "Contact" },
];

export default function AppHeader({ showBackButton = false, backTo = "/homepage" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const currentUser = useMemo(() => {
    try {
      const raw = localStorage.getItem("tripmate_currentUser");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const displayName =
    currentUser?.displayName ||
    currentUser?.firstName ||
    currentUser?.username ||
    currentUser?.email ||
    "Traveler";

  const avatar = currentUser?.avatar || currentUser?.avatarUrl || "";

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleLogout = () => {
    clearSession();
    navigate("/login");
  };

  const isActive = (to) => {
    if (to === "/homepage") {
      return (
        location.pathname === "/homepage" || location.pathname === "/"
      );
    }
    return location.pathname.startsWith(to);
  };

  return (
    <header className="flex items-center justify-between border-b border-gray-100 px-6 py-4 sm:px-10">
      <div className="flex items-center gap-3">
        {showBackButton && (
          <button
            type="button"
            onClick={() => navigate(backTo)}
            className="rounded-full p-2 text-pink-500 transition-colors hover:bg-pink-50"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <TripMateLogo to="/homepage" className="py-1" />
      </div>

      <nav className="flex items-center gap-2 sm:gap-6">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={
              isActive(item.to)
                ? "rounded-md bg-gray-100 px-3 py-1 text-sm font-medium text-gray-800 sm:text-base"
                : "px-2 text-sm text-gray-700 hover:text-pink-500 sm:text-base"
            }
          >
            {item.label}
          </Link>
        ))}

        <div className="relative ml-2" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-pink-500 transition-colors hover:bg-pink-200"
            aria-label="Open profile menu"
            aria-expanded={menuOpen}
          >
            {avatar ? (
              <img
                src={avatar}
                alt={displayName}
                className="h-full w-full object-cover"
              />
            ) : (
              <UserIcon className="h-5 w-5" />
            )}
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-12 z-[1001] w-64 rounded-2xl border border-gray-100 bg-white p-2 shadow-xl">
              <div className="flex items-center gap-3 rounded-xl px-3 py-3">
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-sm font-bold text-pink-500">
                  {avatar ? (
                    <img
                      src={avatar}
                      alt={displayName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    initialsFor(displayName)
                  )}
                </div>
                <p className="font-bold text-gray-800">{displayName}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  navigate("/profile");
                }}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-pink-50"
              >
                <span className="flex items-center gap-3">
                  <UserIcon className="h-4 w-4" />
                  Edit Profile
                </span>
                <ArrowRight className="h-4 w-4 text-gray-400" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  navigate("/settings");
                }}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-pink-50"
              >
                <span className="flex items-center gap-3">
                  <Settings className="h-4 w-4" />
                  Settings
                </span>
                <ArrowRight className="h-4 w-4 text-gray-400" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  handleLogout();
                }}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-pink-50"
              >
                <span className="flex items-center gap-3">
                  <LogOut className="h-4 w-4" />
                  Logout
                </span>
                <ArrowRight className="h-4 w-4 text-gray-400" />
              </button>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
