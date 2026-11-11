import { now } from "./clock";
import type { Intention, Memory } from "./types";

const KEY = "whybuy:budget";

export type Budget = { amount: number; currency: string };

/** Monthly shopping budget, kept apart from the intentions blob. */
export function getBudget(): Budget | null {
  if (typeof window === "undefined") return null;
  try {
    const b = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return b && Number(b.amount) > 0 ? { amount: Number(b.amount), currency: typeof b.currency === "string" ? b.currency : "USD" } : null;
  } catch {
    return null;
  }
}

export function saveBudget(b: Budget | null) {
  try {
    if (b) localStorage.setItem(KEY, JSON.stringify(b));
    else localStorage.removeItem(KEY);
  } catch {}
}

/** Best known price: chosen option, then the proposal's price, then what the person mentioned. */
export function itemPrice(i: Intention): { amount: number; currency: string } | null {
  const chosen = i.products?.find((p) => p.id === i.selectedProductId);
  if (chosen?.price && chosen.price > 0) return { amount: chosen.price, currency: chosen.currency || "USD" };
  if (i.price && Number(i.price.value) > 0) return { amount: Number(i.price.value), currency: i.price.currency };
  const b = i.interpretation.budget;
  if (b && b.amount > 0) return { amount: b.amount, currency: b.currency || "USD" };
  return null;
}

/** What was bought this calendar month (demo clock aware). Currencies are not converted. */
export function spentThisMonth(m: Memory, at = now()): number {
  const month = at.toISOString().slice(0, 7);
  return m.intentions
    .filter((i) => i.status === "bought" || i.status === "purchased")
    .reduce((sum, i) => {
      const event = [...i.events].reverse().find((e) => e.type === "purchased");
      const when = i.paypal?.capturedAt ?? event?.at ?? i.createdAt;
      if (when.slice(0, 7) !== month) return sum;
      return sum + (event?.amount ?? itemPrice(i)?.amount ?? 0);
    }, 0);
}
