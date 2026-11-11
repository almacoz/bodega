import { NextResponse } from "next/server";
import { createPayPalOrder } from "@/lib/paypal";

export const runtime = "nodejs";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * POST /api/paypal/create-order
 * 
 * Creates a PayPal Sandbox order for demonstration purposes.
 * 
 * TRUST MODEL (Hackathon/Demo Only):
 * - Amount is USER-DECLARED from client-side localStorage
 * - Server validates amount is numeric and within bounds (0-10000)
 * - Server CANNOT verify amount matches any "true" price (no server-side storage)
 * - Suitable for Sandbox demos; NOT suitable for real merchant transactions
 * 
 * Security:
 * - PayPal credentials remain server-side only
 * - Returns only order ID and approval URL (no secrets)
 * - Input validation prevents malformed requests
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    
    if (!body || typeof body !== "object") {
      return fail("Invalid request body.", 400);
    }
    
    const { intentionId, subject, amount, currency, productId } = body;
    
    // Validate required fields
    if (typeof intentionId !== "string" || intentionId.length < 3) {
      return fail("Invalid intention ID.", 400);
    }
    
    if (typeof subject !== "string" || subject.length < 1 || subject.length > 200) {
      return fail("Invalid subject.", 400);
    }
    
    // Validate user-declared amount is numeric and within demonstration bounds
    // NOTE: This is client-supplied from localStorage, not a verified merchant price
    if (typeof amount !== "number" || amount <= 0 || amount > 10000) {
      return fail("Invalid amount. Must be between 0 and 10000.", 400);
    }
    
    if (currency && (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency))) {
      return fail("Invalid currency code.", 400);
    }
    
    // Create PayPal Sandbox order with user-declared parameters
    const { orderId, approvalUrl } = await createPayPalOrder(
      intentionId,
      subject,
      amount,
      currency || "USD",
      productId
    );
    
    return NextResponse.json({
      orderId,
      approvalUrl,
    });
    
  } catch (err) {
    console.error("PayPal create-order error:", err);
    
    // Don't expose internal error details
    if (err instanceof Error && err.message.includes("PayPal")) {
      return fail("Unable to create PayPal order. Please try again.", 502);
    }
    
    return fail("Payment service temporarily unavailable.", 503);
  }
}
