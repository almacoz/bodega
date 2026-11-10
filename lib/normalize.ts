import type { Interpretation, Signal, SignalKind } from "./types";

const SIGNAL_KINDS: SignalKind[] = ["urgency", "doubt", "enthusiasm", "frustration", "budget-pressure", "curiosity"];

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** "Portabilidad móvil!" -> "portabilidad-movil" */
export function toTag(value: unknown): string {
  if (typeof value !== "string") return "";
  return fold(value)
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");
}

export function toTags(values: unknown, max = 5): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(toTag).filter(Boolean))].slice(0, max);
}

const text = (v: unknown, max = 200): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

function toSignals(values: unknown, original: string): Signal[] {
  if (!Array.isArray(values)) return [];
  const folded = fold(original);
  const seen = new Set<SignalKind>();
  const out: Signal[] = [];
  for (const v of values) {
    const kind = (v as { kind?: SignalKind })?.kind;
    const quote = text((v as { quote?: unknown })?.quote, 160);
    if (!kind || !SIGNAL_KINDS.includes(kind) || !quote || seen.has(kind)) continue;
    const at = folded.indexOf(fold(quote));
    if (at < 0) continue; // no evidence in the original text, no signal
    // Prefer the user's exact wording (same length when folding didn't change offsets).
    const exact = folded.length === original.length ? original.slice(at, at + fold(quote).length) : quote;
    seen.add(kind);
    out.push({ kind, quote: exact });
  }
  return out;
}

function toBudget(v: unknown): Interpretation["budget"] {
  const b = (v && typeof v === "object" ? v : {}) as { amount?: unknown; currency?: unknown };
  const amount = Number(b.amount);
  const currency = typeof b.currency === "string" ? b.currency.trim().toUpperCase() : "";
  return Number.isFinite(amount) && amount > 0 && /^[A-Z]{3}$/.test(currency) ? { amount, currency } : null;
}

/** Turns untrusted LLM JSON into a safe Interpretation. Throws if there is no subject. */
export function normalizeInterpretation(raw: unknown, originalText: string): Interpretation {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const subject = text(r.subject, 80);
  if (!subject) throw new Error("no-subject");
  return {
    language: r.language === "es" ? "es" : "en",
    subject,
    category: toTag(r.category) || "other",
    purpose: text(r.purpose, 240),
    needs: toTags(r.needs, 5),
    utility: Array.isArray(r.utility) ? [...new Set(r.utility.map((u) => text(u, 80)).filter((u): u is string => !!u))].slice(0, 4) : [],
    context: text(r.context, 160),
    timing: text(r.timing, 80),
    budget: toBudget(r.budget),
    signals: toSignals(r.signals, originalText),
  };
}
