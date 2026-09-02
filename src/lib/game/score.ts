const BEST_DISTANCE_KEY = "catapal:v0:best-distance-m";

export function loadBestDistance(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(BEST_DISTANCE_KEY);
  const value = raw ? Number.parseFloat(raw) : 0;
  return Number.isFinite(value) ? value : 0;
}

export function saveBestDistance(distanceMeters: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BEST_DISTANCE_KEY, String(distanceMeters));
}
