import type { PriceScan } from "./types";

type Listing = { name?: string; price?: number; currency?: string };

const STOP = new Set(["quiero", "quisiera", "comprar", "comprarme", "una", "uno", "unos", "unas", "the", "for", "para", "del", "las", "los", "new", "nuevo", "nueva", "with", "con", "and", "some", "algo"]);
const words = (s: string) =>
  s.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2 && !STOP.has(w));

/**
 * A price range for what the person named, from real listings.
 * Strict on purpose: listings must share the item's words (so "mac mini" never matches MAC cosmetics),
 * at least 3 must match, and the extremes are trimmed. Otherwise it returns null and nothing is shown.
 */
export function summarizePrices(subject: string, listings: Listing[], at: string): PriceScan | null {
  const want = words(subject);
  if (!want.length) return null;
  const need = Math.min(2, want.length);
  const priced = listings.filter((l) => typeof l.price === "number" && l.price > 0 && typeof l.name === "string");
  const currency = priced[0]?.currency || "USD";
  const prices = priced
    .filter((l) => (l.currency || "USD") === currency)
    .filter((l) => {
      const have = new Set(words(l.name as string));
      return want.filter((w) => have.has(w)).length >= need;
    })
    .map((l) => l.price as number)
    .sort((a, b) => a - b);
  if (prices.length < 3) return null;
  const core = prices.length >= 5 ? prices.slice(1, -1) : prices;
  const mid = Math.floor(core.length / 2);
  const typical = core.length % 2 ? core[mid] : (core[mid - 1] + core[mid]) / 2;
  return { low: core[0], typical: Math.round(typical * 100) / 100, high: core[core.length - 1], currency, count: prices.length, at };
}

/** Runs one Channel3 search for the item and summarizes it. Never throws: no data means no note. */
export async function scanPrices(subject: string, at: string): Promise<PriceScan | null> {
  try {
    const res = await fetch("/api/products/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: subject }) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.source !== "channel3-live") return null; // sample results are not prices
    return summarizePrices(subject, Array.isArray(data.products) ? data.products : [], at);
  } catch {
    return null;
  }
}
