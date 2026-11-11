import { NextResponse } from "next/server";
import { normalizeInterpretation, toTags } from "@/lib/normalize";

export const runtime = "nodejs";

// Simple in-memory rate limiting (per IP)
// LIMITATION: This is best-effort only. On serverless platforms (Vercel, Netlify, AWS Lambda),
// each function instance has its own memory space, so limits are per-instance, not global.
// A user could bypass limits by triggering requests that hit different instances.
// Additionally, limits reset on cold starts and deployments.
// For the MVP, this provides basic abuse protection without adding infrastructure costs.
// For production scale, consider: Vercel KV, Upstash Redis, or Cloudflare Workers KV.
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // requests per window
const RATE_WINDOW = 60_000; // 1 minute in ms

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimits.get(ip);
  
  if (!record || now > record.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  
  if (record.count >= RATE_LIMIT) {
    return false;
  }
  
  record.count++;
  return true;
}

function getClientIP(req: Request): string {
  // Check common proxy headers
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  
  const realIP = req.headers.get("x-real-ip");
  if (realIP) return realIP;
  
  return "unknown";
}

interface Recent {
  id: string;
  subject: string;
  purpose: string | null;
}

/** Up to 15 earlier intentions, trimmed. Anything malformed is dropped. */
function toRecent(v: unknown): Recent[] {
  if (!Array.isArray(v)) return [];
  const out: Recent[] = [];
  for (const r of v.slice(0, 15)) {
    const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    if (typeof o.id !== "string" || !/^[a-z0-9]{4,40}$/i.test(o.id) || typeof o.subject !== "string") continue;
    out.push({
      id: o.id,
      subject: o.subject.slice(0, 80),
      purpose: typeof o.purpose === "string" ? o.purpose.slice(0, 160) : null,
    });
  }
  return out;
}

function systemPrompt(knownNeeds: string[], knownCategories: string[], recent: Recent[]) {
  const known =
    knownNeeds.length || knownCategories.length
      ? `\nTags already in this person's memory. Reuse one exactly when it means the same thing; invent a new tag only when none fits.\nneeds: ${knownNeeds.join(", ") || "(none)"}\ncategories: ${knownCategories.join(", ") || "(none)"}\n`
      : "";
  const earlier = recent.length
    ? `\nThings this person considered earlier (id: subject — purpose):\n${recent
        .map((r) => `${r.id}: ${r.subject}${r.purpose ? ` — ${r.purpose}` : ""}`)
        .join("\n")}\n`
    : "";
  return `You turn a short personal note about something a person wants or is considering into structured JSON. The note may be in English or Spanish.

Return ONLY one JSON object with exactly these keys:
{
  "language": "en" | "es",
  "subject": string,
  "category": string,
  "purpose": string | null,
  "needs": string[],
  "utility": string[],
  "context": string | null,
  "timing": string | null,
  "budget": { "amount": number, "currency": string } | null,
  "signals": { "kind": "urgency" | "doubt" | "enthusiasm" | "frustration" | "budget-pressure" | "curiosity", "quote": string }[],
  "reasonType": "emotional" | "functional" | "mixed",
  "reflection": string,
  "hasReason": boolean,
  "sameProblemAs": string | null
}

Rules:
- subject: the thing wanted, a short noun phrase in the note's own language, e.g. "laptop".
- category: the kind of thing, a 1-3 word kebab-case ENGLISH tag, e.g. "computing-device".
- purpose: what the person wants to do with it, in the note's language. null if not stated.
- hasReason: true only when the note explicitly states a reason, purpose, need, or context beyond naming the wanted item.
- needs: 1-4 kebab-case ENGLISH tags naming the concrete functional problem or activity the purchase serves, e.g. "software-development", "portability", "note-taking", "running", "walking", "athletic-wear", "sleep-quality". Always English, even for Spanish notes. NEVER use generic qualities, routines, or contexts such as "convenience", "quality", "value", "savings", "financing", "health", "comfort", "productivity", "efficiency", "routine", "morning-routine", "daily-routine", "energy", "commuting", "travel", "work", "lifestyle".
- utility: up to 4 short phrases, in the note's language, for benefits the person expects.
- context: the work, study or personal setting, or constraints, only if stated.
- timing: the exact time phrase from the note (e.g. "next month", "para marzo"), or null.
- budget: only if an amount is stated. Currency as an ISO 4217 code; a bare "$" means "USD".
- signals: wording cues only. "quote" MUST be copied exactly from the note. If you cannot quote it, leave the signal out. Do not infer feelings the words do not show. Use [] when there are none.
- sameProblemAs: the id of ONE earlier item ONLY if this new purchase is a realistic alternative or addresses the exact same functional problem (e.g. joggers vs sweatpants for walking/exercise, or a tablet vs a laptop for coding on the go). Never link unrelated domains (such as coffee, vitamins, and a car) just because they happen in the same routine or commute. When in doubt, use null.
Never invent facts. Use null or [] when unsure.
"Never judge, warn, or discourage. Buying is fine."
"The reflection mirrors the user's own words. No advice, no product suggestions."
"Max 20 words."
${known}${earlier}`;
}

const fail = (error: string, status: number, detail?: string) =>
  NextResponse.json({ error, ...(detail && process.env.NODE_ENV !== "production" ? { detail } : {}) }, { status });

export async function POST(req: Request) {
  // Rate limiting
  const clientIP = getClientIP(req);
  if (!checkRateLimit(clientIP)) {
    return fail("Too many requests. Please wait a minute before trying again.", 429);
  }

  const { LLM_API_KEY, LLM_BASE_URL, LLM_MODEL } = process.env;
  if (!LLM_API_KEY || !LLM_BASE_URL || !LLM_MODEL) {
    return fail("The AI model isn't configured. Set LLM_API_KEY, LLM_BASE_URL and LLM_MODEL in .env.local, then restart.", 500);
  }

  // Input validation
  const body = await req.json().catch(() => null);
  
  if (!body || typeof body !== "object") {
    return fail("Invalid request body.", 400);
  }
  
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (text.length < 3 || text.length > 1000) {
    return fail("Write between 3 and 1000 characters.", 400);
  }

  // Validate known needs and categories arrays
  if (body.knownNeeds !== undefined && (!Array.isArray(body.knownNeeds) || body.knownNeeds.some((n: any) => typeof n !== "string"))) {
    return fail("Invalid knownNeeds format.", 400);
  }
  
  if (body.knownCategories !== undefined && (!Array.isArray(body.knownCategories) || body.knownCategories.some((c: any) => typeof c !== "string"))) {
    return fail("Invalid knownCategories format.", 400);
  }

  // Call LLM provider with retries for transient 503s
  const recent = toRecent(body.recent);
  const payload = JSON.stringify({
    model: LLM_MODEL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt(toTags(body.knownNeeds, 40), toTags(body.knownCategories, 20), recent) },
      { role: "user", content: `Note:\n"""\n${text}\n"""` },
    ],
  });

  let res: Response | null = null;
  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * attempt)); // 1s, 2s
    try {
      res = await fetch(`${LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${LLM_API_KEY}` },
        body: payload,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return fail("The AI model didn't respond in time. Try again.", 504);
      }
      if (attempt === MAX_ATTEMPTS - 1) return fail("Unable to reach the AI model. Please try again.", 503);
      continue;
    }
    if (res.status !== 503) break; // success or a non-retryable error
  }

  if (!res || !res.ok) {
    return fail(`The AI provider returned an error (${res?.status ?? "unknown"}). Please try again.`, 502);
  }

  const data = await res.json().catch(() => null);
  const content: unknown = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return fail("The AI model returned an empty answer. Try again.", 502);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
  } catch {
    return fail("The AI model returned something unreadable. Try again.", 502);
  }

  try {
    const interpretation = normalizeInterpretation(raw, text);
    // Only an id we actually sent counts; anything else is a hallucination.
    const hint = (raw as { sameProblemAs?: unknown })?.sameProblemAs;
    const sameProblemAs = typeof hint === "string" && recent.some((r) => r.id === hint) ? hint : null;
    return NextResponse.json({ interpretation, hasReason: interpretation.hasReason, sameProblemAs });
  } catch {
    return fail("I couldn't find something you want in that note. Say what you want, and why.", 422);
  }
}
