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

function systemPrompt(knownNeeds: string[], knownCategories: string[]) {
  const known =
    knownNeeds.length || knownCategories.length
      ? `\nTags already in this person's memory. Reuse one exactly when it means the same thing; invent a new tag only when none fits.\nneeds: ${knownNeeds.join(", ") || "(none)"}\ncategories: ${knownCategories.join(", ") || "(none)"}\n`
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
  "signals": { "kind": "urgency" | "doubt" | "enthusiasm" | "frustration" | "budget-pressure" | "curiosity", "quote": string }[]
}

Rules:
- subject: the thing wanted, a short noun phrase in the note's own language, e.g. "laptop".
- category: the kind of thing, a 1-3 word kebab-case ENGLISH tag, e.g. "computing-device".
- purpose: what the person wants to do with it, in the note's language. null if not stated.
- needs: 1-5 kebab-case ENGLISH tags for the underlying needs the purpose reveals, e.g. "software-development", "portability", "note-taking". Always English, even for Spanish notes, so notes in different languages can be matched.
- utility: up to 4 short phrases, in the note's language, for benefits the person expects.
- context: the work, study or personal setting, or constraints, only if stated.
- timing: the exact time phrase from the note (e.g. "next month", "para marzo"), or null.
- budget: only if an amount is stated. Currency as an ISO 4217 code; a bare "$" means "USD".
- signals: wording cues only. "quote" MUST be copied exactly from the note. If you cannot quote it, leave the signal out. Do not infer feelings the words do not show. Use [] when there are none.
Never invent facts. Use null or [] when unsure.
${known}`;
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

  // Call LLM provider with timeout
  let res: Response;
  try {
    res = await fetch(`${LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LLM_API_KEY}` },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt(toTags(body.knownNeeds, 40), toTags(body.knownCategories, 20)) },
          { role: "user", content: `Note:\n"""\n${text}\n"""` },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    // Safe error handling - don't expose internal details
    if (err instanceof Error && err.name === "AbortError") {
      return fail("The AI model didn't respond in time. Try again.", 504);
    }
    return fail("Unable to reach the AI model. Please try again.", 503);
  }
  
  if (!res.ok) {
    // Don't expose raw provider errors to client in production
    return fail(`The AI provider returned an error (${res.status}). Please try again.`, 502);
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
    return NextResponse.json({ interpretation: normalizeInterpretation(raw, text) });
  } catch {
    return fail("I couldn't find something you want in that note. Say what you want, and why.", 422);
  }
}
