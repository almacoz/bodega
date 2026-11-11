const OFFSET_KEY = "whybuy:demo-day-offset";

/** Business clock. The demo offset is local to this browser and enabled only by env. */
export function now(): Date {
  const current = Date.now();
  if (typeof window === "undefined" || process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return new Date(current);
  let days = 0;
  try { days = Number(window.localStorage.getItem(OFFSET_KEY) ?? 0); } catch { /* storage can be unavailable */ }
  return new Date(current + (Number.isFinite(days) ? days : 0) * 86_400_000);
}

export function demoDayOffset(): number {
  if (typeof window === "undefined" || process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return 0;
  let value = 0;
  try { value = Number(window.localStorage.getItem(OFFSET_KEY) ?? 0); } catch { /* storage can be unavailable */ }
  return Number.isFinite(value) ? value : 0;
}

export function skipDemoDay(): number {
  if (typeof window === "undefined" || process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return 0;
  const next = demoDayOffset() + 1;
  try { window.localStorage.setItem(OFFSET_KEY, String(next)); } catch { /* storage can be unavailable */ }
  return next;
}

export function resetDemoClock(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(OFFSET_KEY); } catch { /* storage can be unavailable */ }
}
