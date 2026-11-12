import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { inspect, clientIp } from "@/lib/shield";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const verdict = inspect({
    method: request.method,
    pathname,
    rawPath: pathname + search,
    headers: request.headers,
    host: request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host,
  });
  if (!verdict.ok) {
    // One structured line per blocked request, visible in your hosting logs.
    console.warn(JSON.stringify({ shield: "blocked", reason: verdict.reason, status: verdict.status, ip: clientIp(request.headers), method: request.method, path: pathname.slice(0, 200), ua: (request.headers.get("user-agent") || "").slice(0, 120) }));
    const blocked = NextResponse.json({ error: verdict.error }, { status: verdict.status });
    if (verdict.retryAfter) blocked.headers.set("Retry-After", String(verdict.retryAfter));
    blocked.headers.set("Cache-Control", "no-store");
    return blocked;
  }

  const response = NextResponse.next();

  // HSTS: Force HTTPS for 1 year, include subdomains
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

  // Prevent MIME type sniffing
  response.headers.set("X-Content-Type-Options", "nosniff");

  // Referrer policy: send origin only for cross-origin requests
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Frame options: prevent clickjacking
  response.headers.set("X-Frame-Options", "DENY");

  // XSS protection (legacy but still useful)
  response.headers.set("X-XSS-Protection", "0"); // modern guidance: disable the legacy auditor, rely on CSP

  // Content Security Policy
  // - default-src 'self': only load resources from same origin by default
  // - script-src 'self' 'unsafe-inline': allow inline scripts for Next.js hydration
  // - style-src 'self' 'unsafe-inline': allow inline styles for Tailwind
  // - font-src 'self' data: https://fonts.gstatic.com: allow Google Fonts
  // - connect-src 'self': allow fetch to own API routes only (LLM calls are server-side)
  // - img-src 'self' data: blob:: allow images from same origin, data URIs, and blobs
  // - frame-ancestors 'none': equivalent to X-Frame-Options DENY
  const isDev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://www.paypal.com https://www.sandbox.paypal.com", // PayPal SDK connections
    "img-src 'self' data: blob: https:", // Product reference thumbnails & PayPal assets over HTTPS
    "frame-src https://www.paypal.com https://www.sandbox.paypal.com", // PayPal checkout frames
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);

  // Permissions Policy: restrict browser features
  response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=(), usb=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups"); // PayPal opens popups
  if (pathname.startsWith("/api/")) response.headers.set("Cache-Control", "no-store");

  return response;
}

// Apply middleware to all routes
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, robots.txt, etc.
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt).*)",
  ],
};
