import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { clearSession, getSessionExpiresAt, isSessionExpired } from "../lib/api";

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/account-recovery",
  "/reset-password",
  "/about",
  "/contact",
]);

export default function SessionTimeoutGuard() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (PUBLIC_PATHS.has(location.pathname)) return undefined;

    const expireAndRedirect = () => {
      if (!isSessionExpired()) return;
      clearSession();
      navigate("/login", {
        replace: true,
        state: { message: "Your session expired. Please log in again." },
      });
    };

    expireAndRedirect();

    const expiresAt = getSessionExpiresAt();
    if (!expiresAt) return undefined;

    const delay = Math.max(expiresAt - Date.now(), 0);
    const timeoutId = window.setTimeout(expireAndRedirect, delay);

    return () => window.clearTimeout(timeoutId);
  }, [location.pathname, navigate]);

  return null;
}
