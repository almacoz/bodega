import { describe, it, expect, beforeEach } from "vitest";
import { inspect, __resetShield, RateLimiter } from "@/lib/shield";

const req = (o: Partial<{ method: string; path: string; headers: Record<string, string>; host: string }> = {}) => {
  const path = o.path ?? "/api/extract";
  return {
    method: o.method ?? "POST",
    pathname: path.split("?")[0],
    rawPath: path,
    host: o.host ?? "whybuy.app",
    headers: new Headers({ "content-type": "application/json", "content-length": "100", "x-forwarded-for": "1.1.1.1", "user-agent": "Mozilla/5.0", ...(o.headers ?? {}) }),
  };
};

describe("shield", () => {
  beforeEach(() => __resetShield());

  it("allows a normal same-origin API call and normal pages", () => {
    expect(inspect(req({ headers: { origin: "https://whybuy.app", "sec-fetch-site": "same-origin" } })).ok).toBe(true);
    expect(inspect(req({ method: "GET", path: "/", headers: { "content-type": "" } })).ok).toBe(true);
  });

  it("blocks cross-origin, wrong method, wrong content-type, huge body", () => {
    expect(inspect(req({ headers: { origin: "https://evil.com" } }))).toMatchObject({ ok: false, status: 403 });
    expect(inspect(req({ headers: { "x-forwarded-for": "2.2.2.2", "sec-fetch-site": "cross-site" } }))).toMatchObject({ ok: false, status: 403 });
    expect(inspect(req({ method: "GET", headers: { "x-forwarded-for": "3.3.3.3" } }))).toMatchObject({ ok: false, status: 405 });
    expect(inspect(req({ headers: { "content-type": "text/plain", "x-forwarded-for": "4.4.4.4" } }))).toMatchObject({ ok: false, status: 415 });
    expect(inspect(req({ headers: { "content-length": "999999", "x-forwarded-for": "5.5.5.5" } }))).toMatchObject({ ok: false, status: 413 });
  });

  it("rate-limits the LLM route per IP", () => {
    for (let i = 0; i < 20; i++) expect(inspect(req()).ok).toBe(true);
    expect(inspect(req())).toMatchObject({ ok: false, status: 429 });
    expect(inspect(req({ headers: { "x-forwarded-for": "9.9.9.9" } })).ok).toBe(true);
  });

  it("caps the global LLM budget even when IPs rotate", () => {
    let blocked = false;
    for (let i = 0; i < 400 && !blocked; i++) blocked = !inspect(req({ headers: { "x-forwarded-for": `10.0.${i >> 8}.${i & 255}` } })).ok;
    expect(blocked).toBe(true);
  });

  it("blocks scanners and bans probing IPs", () => {
    expect(inspect(req({ headers: { "user-agent": "sqlmap/1.7" } }))).toMatchObject({ ok: false, status: 403 });
    const ip = { "x-forwarded-for": "6.6.6.6" };
    for (const p of ["/.env", "/wp-admin", "/.git/config", "/x.php"]) expect(inspect(req({ method: "GET", path: p, headers: ip })).ok).toBe(false);
    expect(inspect(req({ method: "GET", path: "/", headers: ip }))).toMatchObject({ ok: false, status: 403, reason: "banned" });
  });

  it("limiter memory stays bounded under a flood of unique keys", () => {
    const l = new RateLimiter(1, 60_000);
    for (let i = 0; i < 25_000; i++) l.hit(`k${i}`);
    expect((l as any).buckets.size).toBeLessThanOrEqual(10_000);
  });
});
