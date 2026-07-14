// Persisted "liked" / saved trips (Week 8 - ticket 8.2).
//
// The homepage trip cards have a heart button, but the liked state was only
// kept in component memory. We persist it in localStorage (as a list of trip
// IDs) so likes survive a reload and can be read by the profile page to show
// "Saved Trips". Consistent with how budget/pins/user are already stored.

const FAVORITES_KEY = "tripmate_favorite_trips";

export function loadFavoriteIds() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function isFavorite(id) {
  return loadFavoriteIds().includes(String(id));
}

// Toggle a trip's saved state. Returns the new boolean (true = now saved).
export function toggleFavorite(id) {
  const key = String(id);
  const ids = loadFavoriteIds();
  const exists = ids.includes(key);
  const next = exists ? ids.filter((value) => value !== key) : [...ids, key];
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  } catch (error) {
    console.error("Failed to save favorite trips:", error);
  }
  return !exists;
}
