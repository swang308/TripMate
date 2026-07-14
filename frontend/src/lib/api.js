export const API_BASE_URL =
  process.env.REACT_APP_API_URL || "http://localhost:5050";

const TOKEN_KEY = "token";
const CURRENT_USER_KEY = "tripmate_currentUser";
const SESSION_EXPIRES_AT_KEY = "tripmate_sessionExpiresAt";

export function getAuthHeaders(extraHeaders = {}) {
  if (isSessionExpired()) {
    clearSession();
  }

  const token = localStorage.getItem(TOKEN_KEY);
  return {
    ...extraHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function getCurrentUser() {
  try {
    if (isSessionExpired()) {
      clearSession();
      return null;
    }

    const raw = localStorage.getItem(CURRENT_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getSessionExpiresAt() {
  const raw = localStorage.getItem(SESSION_EXPIRES_AT_KEY);
  const expiresAt = Number(raw);
  return Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : null;
}

export function isSessionExpired(now = Date.now()) {
  const expiresAt = getSessionExpiresAt();
  return Boolean(expiresAt && now >= expiresAt);
}

export function saveSession({ token, user, session }) {
  if (user) {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  }

  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  if (session?.expiresAt) {
    localStorage.setItem(SESSION_EXPIRES_AT_KEY, String(session.expiresAt * 1000));
  }
}

export function clearSession() {
  localStorage.removeItem(CURRENT_USER_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SESSION_EXPIRES_AT_KEY);
}
