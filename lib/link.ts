import type { Interpretation, Memory, Related } from "./types";

export const pairKey = (a: string, b: string) => [a, b].sort().join("~");

/**
 * Qualities, moods, routines, or financial framing almost any purchase can
 * share. Sharing one of these says nothing about whether two purchases solve
 * the same problem (coffee, vitamin D, and a car can all be "morning-routine",
 * "commuting", "convenience", or "financing"), so they never count as evidence.
 */
const GENERIC_NEEDS = new Set([
  "convenience", "quality", "value", "value-for-money", "savings", "save-money", "saving-money",
  "cost-savings", "cost-effective", "cost-effectiveness", "budget-friendly", "economical",
  "affordability", "affordable", "financing", "payment-flexibility", "installments", "budget",
  "price", "low-cost", "durability", "reliability", "comfort", "style", "aesthetics", "status",
  "gift", "upgrade", "replacement", "everyday-use", "daily-use", "personal-use", "productivity",
  "efficiency", "time-saving", "save-time", "saving-time", "health", "wellness", "well-being",
  "wellbeing", "enjoyment", "fun", "happiness", "self-care", "practicality", "practical",
  "versatility", "performance", "ease-of-use", "convenience-and-ease", "comfort-and-convenience",
  "safety", "security", "lifestyle", "lifestyle-upgrade", "necessity", "personal", "home",
  "routine", "daily-routine", "morning-routine", "evening-routine", "energy", "energy-boost",
  "focus", "concentration", "commuting", "commute", "travel", "mobility", "work", "study",
  "relaxation", "leisure", "self-improvement", "flexibility",
]);

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export const specificNeeds = (needs: string[]) => needs.filter((n) => !GENERIC_NEEDS.has(n));

/** What the two intentions really have in common. */
function evidence(a: Interpretation, b: Interpretation) {
  const bNeeds = new Set(specificNeeds(b.needs));
  const sharedNeeds = specificNeeds(a.needs).filter((n) => bNeeds.has(n));
  const sameCategory = a.category !== "other" && a.category === b.category;
  const sameSubject = fold(a.subject) === fold(b.subject);
  return { sharedNeeds, sameCategory, sameSubject };
}

/**
 * The question is not "do these share a tag?" but "could these solve the same
 * problem for this person?". Deliberately strict: it is better to say nothing
 * than to surface a coincidence.
 *   - the same thing, wanted again; or
 *   - two specific needs in common; or
 *   - one specific need and the same kind of thing.
 */
function isRelevant(e: ReturnType<typeof evidence>) {
  return e.sameSubject || e.sharedNeeds.length >= 2 || (e.sharedNeeds.length >= 1 && e.sameCategory);
}

const strength = (r: Related) => (r.sameSubject ? 10 : 0) + r.sharedNeeds.length * 2 + (r.sameCategory ? 1 : 0);

/**
 * Earlier intentions that could serve the same need, strongest first.
 * `hintId` is the model's own judgement ("this note solves the same problem as …").
 * It can promote a candidate with at least some real evidence, never invent one.
 */
export function findRelated(interp: Interpretation, memory: Memory, selfId?: string, hintId?: string | null): Related[] {
  const found: Related[] = [];
  for (const intention of memory.intentions) {
    if (intention.id === selfId) continue;
    const e = evidence(interp, intention.interpretation);
    const hinted = intention.id === hintId && (e.sharedNeeds.length >= 2 || (e.sharedNeeds.length >= 1 && e.sameSubject));
    if (!isRelevant(e) && !hinted) continue;
    found.push({
      intention,
      ...e,
      decision: selfId ? (memory.links[pairKey(selfId, intention.id)] ?? null) : null,
    });
  }
  return found.sort(
    (a, b) =>
      Number(b.intention.id === hintId) - Number(a.intention.id === hintId) ||
      strength(b) - strength(a) ||
      b.intention.createdAt.localeCompare(a.intention.createdAt),
  );
}

/** The single observation worth making, or nothing. Pairs the person already answered stay quiet. */
export function recall(interp: Interpretation, memory: Memory, selfId?: string, hintId?: string | null): Related | null {
  return findRelated(interp, memory, selfId, hintId).find((r) => r.decision === null) ?? null;
}

/** A question, never a recommendation. Uses only the two subjects the person wrote about. */
export function reflectionPrompt(current: Interpretation, r: Related, lang: "en" | "es" = current.language): string {
  const prev = r.intention.interpretation.subject;
  if (r.sameSubject) {
    return lang === "es"
      ? `¿Qué ha cambiado desde la última vez que pensaste en “${prev}”?`
      : `What has changed since you last thought about “${prev}”?`;
  }
  return lang === "es"
    ? `¿Qué te daría “${current.subject}” que “${prev}” no te da?`
    : `What would “${current.subject}” give you that “${prev}” doesn’t?`;
}
