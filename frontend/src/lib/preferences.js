// Shared accessibility preferences (Week 9 - Settings page).
//
// Single source of truth for the accessibility toggles. Each maps to a WCAG 2.0
// AA success criterion (the standard adopted by Ontario's AODA) and takes real
// effect by toggling a class on the document root. Persisted in localStorage.

export const PREFERENCES_KEY = "tripmate_preferences";

export const DEFAULT_PREFERENCES = {
  highContrast: false, // WCAG 1.4.3 Contrast (Minimum)
  largeText: false, // WCAG 1.4.4 Resize Text
  reducedMotion: false, // WCAG 2.3.3 Animation from Interactions
  underlineLinks: false, // WCAG 1.4.1 Use of Color
};

export function loadPreferences() {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    return raw
      ? { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) }
      : { ...DEFAULT_PREFERENCES };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function getPreference(key) {
  return loadPreferences()[key];
}

export function savePreferences(preferences) {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.error("Failed to save preferences:", error);
  }
}

// Apply document-level effects for the accessibility preferences by toggling
// classes on <html> that the global stylesheet (index.css) targets.
export function applyPreferenceEffects(preferences = loadPreferences()) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("high-contrast", !!preferences.highContrast);
  root.classList.toggle("text-larger", !!preferences.largeText);
  root.classList.toggle("reduce-motion", !!preferences.reducedMotion);
  root.classList.toggle("underline-links", !!preferences.underlineLinks);
}
