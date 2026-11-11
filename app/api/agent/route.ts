import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Intention } from "@/lib/types";
import { now } from "@/lib/clock";

export const runtime = "nodejs";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const assistantPrompt = [
  "Always reply in the language the person writes in.", "You are a shopping assistant inside WhyBuy. You can PROPOSE purchases with the proposePurchase tool. You can NEVER pay or approve. The person approves later in WhyBuy, with PayPal, after a short waiting period.",
  "To propose you need three things: the item, the person's reason in their own words, and an approximate price.",
  "If something is missing, ask ONLY for the missing pieces, in one short question (max 15 words). Example: 'What's it for, and roughly how much is it?'",
  "Never guess or invent a price or a reason: only use what the person wrote. Naming the item is not a reason.", "As soon as you have the three things, call proposePurchase immediately. Use the person's own words for the reason. If they gave no currency, use USD.",
  "Never ask 'are you sure' or 'do you want to buy it'. Never judge the purchase. Never mention errors, tools, JSON or formats.",
  "If a tool result contains 'ask', ask the person exactly that, briefly.",
  "After a successful proposal, reply with exactly one short sentence addressed to the person, like: 'Done — it\'s resting in WhyBuy. You decide later.'",
].join(" ");
const proposalSchema = z.object({
  item: z.string().min(1).max(120),
  price: z.any(),
  reason: z.string().max(500).optional().default(""),
  waitDays: z.coerce.number().optional(),
});

/** Accepts "100", 100, "$100", "100 USD", "1.299,50", {value, currency}. Returns null when no number is found. */
function normalizePrice(raw: unknown): { value: string; currency: string } | null {
  let value: unknown = raw;
  let currency = "USD";
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    value = r.value ?? r.amount;
    if (typeof r.currency === "string" && /^[a-zA-Z]{3}$/.test(r.currency.trim())) currency = r.currency.trim().toUpperCase();
  }
  const text = String(value ?? "");
  const code = text.match(/\b([A-Za-z]{3})\b/);
  if (code && !(raw && typeof raw === "object")) currency = code[1].toUpperCase();
  const digits = text.replace(/[^\d.,]/g, "");
  if (!digits) return null;
  const normalized = /,\d{1,2}$/.test(digits) ? digits.replace(/\./g, "").replace(",", ".") : digits.replace(/,/g, "");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return { value: n.toFixed(2), currency };
}

const words = (s: string) => s.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);

/** The reason must come from the person: at least half its words appear somewhere in what they wrote. */
function reasonFromUser(reason: string, userText: string): boolean {
  const r = words(reason);
  if (!r.length) return false;
  const said = new Set(words(userText));
  return r.filter((w) => said.has(w)).length / r.length >= 0.5;
}

const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW = 60_000;

function checkRateLimit(req: Request): boolean {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip") || "unknown";
  const nowMs = Date.now();
  const record = rateLimits.get(ip);
  if (!record || nowMs > record.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: nowMs + RATE_WINDOW });
    return true;
  }
  if (record.count >= RATE_LIMIT) return false;
  record.count++;
  return true;
}

export async function POST(req: Request) {
  if (!checkRateLimit(req)) return fail("Too many requests. Please wait a minute before trying again.", 429);
  const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL } = process.env;
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) return fail("PayPal Sandbox is not configured.", 503);
  if (!LLM_API_KEY || !LLM_BASE_URL || !LLM_MODEL) return fail("The AI model isn't configured. Set LLM_API_KEY, LLM_BASE_URL and LLM_MODEL in .env.local, then restart.", 503);
  const body = await req.json().catch(() => null);
  const messages = Array.isArray(body?.messages) ? body.messages.slice(-20) : null;
  const language = body?.language === "es" ? "es" : "en";
  if (!messages || messages.some((m: any) => !m || !["user", "assistant"].includes(m.role) || typeof m.content !== "string" || m.content.length > 2000)) return fail("Invalid conversation.", 400);

  const appBaseUrl = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const toolkit = new PayPalAgentToolkit({ clientId: PAYPAL_CLIENT_ID, clientSecret: PAYPAL_CLIENT_SECRET, configuration: { actions: { orders: { create: true, get: true } }, context: { sandbox: true } } });
  const proposals: Intention[] = [];
  const execute = async (name: string, rawArgs: string) => {
    const args = JSON.parse(rawArgs);
    if (name === "proposePurchase") {
      const parsed = proposalSchema.parse(args);
      const { item } = parsed;
      const reason = parsed.reason.trim();
      const waitDays = ([1, 3, 7] as const).find((d) => d === parsed.waitDays) ?? 3;
      const price = normalizePrice(parsed.price);
      const userText = messages.filter((m: any) => m.role === "user").map((m: any) => m.content).join(" \n ");
      const missing: string[] = [];
      const STOP = new Set(["quiero", "quisiera", "comprar", "compra", "comprarme", "buy", "want", "would", "like", "need", "una", "uno", "unos", "unas", "the", "for", "que", "algo", "something", "get", "this", "that", "esta", "este", "and", "por"]);
      const itemWords = new Set(words(item));
      const reasonContent = words(reason).filter((w) => !STOP.has(w) && !itemWords.has(w));
      // The price must be something the person actually said, not a guess.
      const priceSaid = !!price && userText.replace(/[.,\s]/g, "").includes(String(Math.trunc(Number(price.value))));
      if (!reason || reasonContent.length === 0 || !reasonFromUser(reason, userText)) missing.push(language === "es" ? "para qué lo quiere" : "what it's for");
      if (!price || !priceSaid || Number(price.value) > 10000) missing.push(language === "es" ? "más o menos cuánto cuesta" : "roughly how much it costs");
      if (missing.length) return { ask: language === "es" ? `Pregunta en una frase: ${missing.join(" y ")}.` : `Ask in one sentence: ${missing.join(" and ")}.` };
      if (!price) throw new Error("unreachable");
      const id = crypto.randomUUID();
      const response = await fetch(`${toolkit.client.getBaseUrl()}/v2/checkout/orders`, { method: "POST", headers: await toolkit.client.getHeaders(), body: JSON.stringify({ intent: "CAPTURE", purchase_units: [{ amount: { currency_code: price.currency, value: price.value }, description: (`WhyBuy: ${reason}`).slice(0, 127), custom_id: id }], application_context: { return_url: `${appBaseUrl}/paypal/return?intentionId=${encodeURIComponent(id)}`, cancel_url: `${appBaseUrl}/paypal/cancel?intentionId=${encodeURIComponent(id)}`, brand_name: "WhyBuy", user_action: "PAY_NOW" } }) });
      const order = await response.json().catch(() => null);
      if (!response.ok || typeof order?.id !== "string") throw new Error("Unable to create a PayPal Sandbox order.");
      const createdAt = now().toISOString();
      const intention: Intention = { id, rawText: reason, interpretation: { language, subject: item, category: "other", purpose: reason, needs: [], utility: [], context: null, timing: null, budget: { amount: Number(price.value), currency: price.currency }, signals: [] }, status: "waiting", source: "agent", waitDays, waitUntil: new Date(Date.parse(createdAt) + waitDays * 86_400_000).toISOString(), checkins: [], price, paypalOrderId: order.id, createdAt, events: [{ id: crypto.randomUUID(), at: createdAt, type: "captured" }], products: [] };
      proposals.push(intention);
      return { intention, paypalOrderId: order.id };
    }
    if (name === "getOrder") {
      const id = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{3,80}$/) }).parse(args).id;
      const response = await fetch(`${toolkit.client.getBaseUrl()}/v2/checkout/orders/${encodeURIComponent(id)}`, { headers: await toolkit.client.getHeaders() });
      const order = await response.json().catch(() => null);
      return response.ok ? { id: order.id, status: order.status } : { error: "Order could not be found." };
    }
    throw new Error("Unknown assistant tool.");
  };

  const toolSpecs = [
    { type: "function", function: { name: "proposePurchase", description: "Create an unapproved PayPal Sandbox order. Require the user's item, exact reason, and declared price.", parameters: { type: "object", properties: { item: { type: "string" }, price: { type: "object", properties: { value: { type: "string" }, currency: { type: "string" } }, required: ["value", "currency"], additionalProperties: false }, reason: { type: "string" }, waitDays: { type: "integer", enum: [1, 3, 7] } }, required: ["item", "price", "reason"], additionalProperties: false } } },
    { type: "function", function: { name: "getOrder", description: "Read the status of a PayPal order. Read-only.", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false } } },
  ];
  const chat: any[] = [{ role: "system", content: `${assistantPrompt}${language === "es" ? " Responde siempre en español." : ""}` }, ...messages];
  try {
    for (let turn = 0; turn < 4; turn++) {
      const response = await fetch(`${LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${LLM_API_KEY}` }, body: JSON.stringify({ model: LLM_MODEL, messages: chat, tools: toolSpecs, tool_choice: "auto" }), signal: AbortSignal.timeout(60_000) });
      const data = await response.json().catch(() => null);
      if (!response.ok) return fail(`The AI provider returned an error (${response.status}). Please try again.`, 502);
      const message = data?.choices?.[0]?.message;
      if (!message) return fail("The AI model returned an empty answer. Try again.", 502);
      chat.push(message);
      const calls = message.tool_calls ?? [];
      if (!calls.length) return NextResponse.json({ text: message.content || "", proposals });
      for (const call of calls) {
        let result: unknown;
        try { result = await execute(call.function.name, call.function.arguments); }
        catch (error) { result = { error: error instanceof Error ? error.message : "The tool call failed." }; }
        chat.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    return fail("The assistant reached its tool-call limit. Try again.", 502);
  } catch (error) {
    return fail(error instanceof Error && error.name === "TimeoutError" ? "The AI model didn't respond in time. Try again." : "The assistant could not respond. Try again.", 502);
  }
}
