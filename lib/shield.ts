/**
 * Shield: lightweight, dependency-free abuse protection for the API.
 *
 * Runs inside proxy.ts (Node runtime) before any route handler. State is in-memory,
 * so limits are per server instance — good enough for a hackathon demo, and the
 * global LLM budget caps damage even if an attacker rotates IPs or spoofs headers.
 */

export type Verdict =
  | { ok: true }
  | { ok: false; status: number; error: string; reason: string; retryAfter?: number };

type Bucket = { count: number; resetAt: number };

const MAX_TRACKED = 10_000;

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  constructor(private limit: number, private windowMs: number) {}

  /** Returns seconds until reset if blocked, or 0 when allowed. */
  hit(key: string, nowMs = Date.now()): number {
    const b = this.buckets.get(key);
    if (!b || nowMs > b.resetAt) {
      if (this.buckets.size >= MAX_TRACKED) this.sweep(nowMs);
      this.buckets.set(key, { count: 1, resetAt: nowMs + this.windowMs });
      return 0;
    }
    if (b.count >= this.limit) return Math.max(1, Math.ceil((b.resetAt - nowMs) / 1000));
    b.count++;
    return 0;
  }

  private sweep(nowMs: number) {
    for (const [k, b] of this.buckets) if (nowMs > b.resetAt) this.buckets.delete(k);
    // Still full (flood of unique keys): drop the oldest half instead of growing forever.
    if (this.buckets.size >= MAX_TRACKED) {
      let n = Math.floor(this.buckets.size / 2);
      for (const k of this.buckets.keys()) { if (n-- <= 0) break; this.buckets.delete(k); }
    }
  }

  reset() { this.buckets.clear(); }
}

const envInt = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

export const MAX_BODY_BYTES = 32 * 1024;

const perIpApi = new RateLimiter(60, 60_000);
const routeLimits: { prefix: string; limiter: RateLimiter }[] = [
  { prefix: "/api/agent", limiter: new RateLimiter(10, 60_000) },
  { prefix: "/api/extract", limiter: new RateLimiter(20, 60_000) },
  { prefix: "/api/products", limiter: new RateLimiter(30, 60_000) },
  { prefix: "/api/paypal", limiter: new RateLimiter(10, 60_000) },
];
// Global budgets: protect paid keys no matter how many IPs are used.
const globalLlm = new RateLimiter(envInt("SHIELD_LLM_PER_HOUR", 300), 3_600_000);
const globalPaypal = new RateLimiter(envInt("SHIELD_PAYPAL_PER_HOUR", 200), 3_600_000);

// Strikes → temporary ban.
const strikes = new RateLimiter(8, 10 * 60_000);
const banned = new Map<string, number>();
const BAN_MS = 15 * 60_000;

const SCANNER_UA = /(sqlmap|nikto|nuclei|nmap|masscan|zgrab|acunetix|netsparker|wpscan|dirbuster|gobuster|ffuf|feroxbuster|hydra|burpcollaborator|commix|xsstrike|jaeles|arachni|whatweb)/i;
const PROBE_PATH = /(\/\.env|\/\.git|\/\.aws|\/\.ssh|wp-admin|wp-login|wp-content|xmlrpc\.php|phpmyadmin|\/cgi-bin|\.php$|\/vendor\/phpunit|\/actuator|\/server-status|\/etc\/passwd|\.\.\/|%2e%2e)/i;

export function clientIp(h: Headers): string {
  // Platform-set headers first (Vercel / Cloudflare), then the standard chain.
  const direct = h.get("x-vercel-forwarded-for") || h.get("cf-connecting-ip") || h.get("x-real-ip");
  if (direct) return direct.split(",")[0].trim().slice(0, 64);
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64);
  return "unknown";
}

function strike(ip: string, nowMs: number) {
  if (strikes.hit(ip, nowMs) > 0) banned.set(ip, nowMs + BAN_MS);
}

function block(status: number, error: string, reason: string, retryAfter?: number): Verdict {
  return { ok: false, status, error, reason, retryAfter };
}

export interface ShieldRequest {
  method: string;
  pathname: string;
  /** Raw path + query, used for probe detection. */
  rawPath: string;
  headers: Headers;
  host: string;
}

export function inspect(req: ShieldRequest, nowMs = Date.now()): Verdict {
  const ip = clientIp(req.headers);

  const bannedUntil = banned.get(ip);
  if (bannedUntil) {
    if (nowMs < bannedUntil) return block(403, "Access temporarily blocked.", "banned", Math.ceil((bannedUntil - nowMs) / 1000));
    banned.delete(ip);
  }

  const ua = req.headers.get("user-agent") || "";
  if (SCANNER_UA.test(ua)) { banned.set(ip, nowMs + BAN_MS); return block(403, "Forbidden.", "scanner-ua"); }

  let decoded = req.rawPath;
  try { decoded = decodeURIComponent(req.rawPath); } catch { /* keep raw */ }
  if (PROBE_PATH.test(req.rawPath) || PROBE_PATH.test(decoded)) { for (let i = 0; i < 3; i++) strike(ip, nowMs); return block(404, "Not found.", "probe-path"); } // 3 probes → ban

  if (!req.pathname.startsWith("/api/")) return { ok: true };

  // --- API-only checks ---
  if (req.method !== "POST") { strike(ip, nowMs); return block(405, "Method not allowed.", "method"); }

  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (!ct.startsWith("application/json")) { strike(ip, nowMs); return block(415, "Content-Type must be application/json.", "content-type"); }

  const len = Number(req.headers.get("content-length") || "0");
  if (!Number.isFinite(len) || len > MAX_BODY_BYTES) { strike(ip, nowMs); return block(413, "Request too large.", "body-size"); }

  // Same-origin only for browsers. (Scripts without Origin still face the limits below.)
  const origin = req.headers.get("origin");
  if (origin) {
    let originHost = "";
    try { originHost = new URL(origin).host; } catch { /* invalid */ }
    if (originHost !== req.host) { strike(ip, nowMs); return block(403, "Cross-origin requests are not allowed.", "origin"); }
  }
  if (req.headers.get("sec-fetch-site") === "cross-site") { strike(ip, nowMs); return block(403, "Cross-origin requests are not allowed.", "sec-fetch-site"); }

  let wait = perIpApi.hit(ip, nowMs);
  if (wait) { strike(ip, nowMs); return block(429, "Too many requests. Please wait a minute.", "ip-api-limit", wait); }

  const rule = routeLimits.find((r) => req.pathname.startsWith(r.prefix));
  if (rule && (wait = rule.limiter.hit(ip, nowMs))) { strike(ip, nowMs); return block(429, "Too many requests. Please wait a minute.", `route-limit:${rule.prefix}`, wait); }

  if (req.pathname.startsWith("/api/agent") || req.pathname.startsWith("/api/extract")) {
    if ((wait = globalLlm.hit("global", nowMs))) return block(503, "The assistant is busy right now. Try again shortly.", "global-llm-budget", wait);
  }
  if (req.pathname.startsWith("/api/paypal") || req.pathname.startsWith("/api/agent")) {
    if ((wait = globalPaypal.hit("global", nowMs))) return block(503, "Payments are busy right now. Try again shortly.", "global-paypal-budget", wait);
  }

  return { ok: true };
}

/** Test helper. */
export function __resetShield() {
  perIpApi.reset(); routeLimits.forEach((r) => r.limiter.reset()); globalLlm.reset(); globalPaypal.reset(); strikes.reset(); banned.clear();
}
