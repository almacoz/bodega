import type { Interpretation, Memory, Related } from "./types";

export const pairKey = (a: string, b: string) => [a, b].sort().join("~");
const words = (tag: string) => tag.replace(/-/g, " ");

/**
 * Deterministic and transparent: two intentions are related if they share at
 * least one need tag, or the same (known) category. Nothing is scored beyond
 * counting shared needs. Dismissed pairs stay in the result with decision
 * "dismissed" so callers can hide them.
 */
export function findRelated(interp: Interpretation, memory: Memory, selfId?: string): Related[] {
  const found: Related[] = [];
  for (const intention of memory.intentions) {
    if (intention.id === selfId) continue;
    const other = intention.interpretation;
    const sharedNeeds = interp.needs.filter((n) => other.needs.includes(n));
    const sameCategory = interp.category !== "other" && interp.category === other.category;
    if (!sharedNeeds.length && !sameCategory) continue;
    found.push({
      intention,
      sharedNeeds,
      sameCategory,
      strength: sharedNeeds.length >= 2 ? "strong" : "possible",
      decision: selfId ? (memory.links[pairKey(selfId, intention.id)] ?? null) : null,
    });
  }
  return found
    .sort((a, b) => b.sharedNeeds.length - a.sharedNeeds.length || b.intention.createdAt.localeCompare(a.intention.createdAt))
    .slice(0, 3);
}

/** A question, never a recommendation. Template text, in the user's language. */
export function reflectionPrompt(current: Interpretation, r: Related): string {
  const prev = r.intention.interpretation;
  const shared = r.sharedNeeds.length ? r.sharedNeeds.map(words).join(", ") : words(current.category);
  return current.language === "es"
    ? `Ambos podrían responder a: ${shared}. ¿Qué te daría “${current.subject}” que “${prev.subject}” no te da?`
    : `Both could serve: ${shared}. What would “${current.subject}” give you that “${prev.subject}” doesn’t?`;
}
