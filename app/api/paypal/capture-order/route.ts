import { NextResponse } from "next/server";
import { capturePayPalOrder } from "@/lib/paypal";

export const runtime = "nodejs";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * POST /api/paypal/capture-order
 * 
 * Captures (completes) a PayPal order after user approval.
 * 
 * Security:
 * - Verifies order with PayPal server-side before returning success
 * - Returns verified amount and currency from PayPal (not client input)
 * - Idempotent: repeated captures of same order handled safely
 * - Never trusts client-supplied payment status
 * 
 * Flow:
 * 1. User approves payment on PayPal
 * 2. PayPal redirects back with order ID in URL
 * 3. Client calls this endpoint with order ID
 * 4. Server verifies and captures with PayPal
 * 5. Server returns verified payment details
 * 6. Client updates local state with purchase event
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    
    if (!body || typeof body !== "object") {
      return fail("Invalid request body.", 400);
    }
    
    const { orderId, intentionId } = body;
    
    // Validate required fields
    if (typeof orderId !== "string" || orderId.length < 3) {
      return fail("Invalid order ID.", 400);
    }
    
    if (typeof intentionId !== "string" || intentionId.length < 3) {
      return fail("Invalid intention ID.", 400);
    }
    
    // Capture payment and get verified details from PayPal
    const result = await capturePayPalOrder(orderId);
    
    if (!result.success) {
      return fail("Payment capture failed.", 400);
    }
    
    // Return verified payment details from PayPal
    // Client will use these to record the purchase event
    return NextResponse.json({
      success: true,
      orderId,
      intentionId,
      captureId: result.captureId,
      amount: result.amount,
      currency: result.currency,
      capturedAt: new Date().toISOString(),
    });
    
  } catch (err) {
    console.error("PayPal capture-order error:", err);
    
    // Handle specific PayPal errors
    if (err instanceof Error) {
      // Order already captured (idempotency)
      if (err.message.includes("INSTRUMENT_DECLINED")) {
        return fail("Payment method was declined. Please try a different payment method.", 400);
      }
      
      if (err.message.includes("not completed")) {
        return fail("Payment was not completed. Please try again.", 400);
      }
      
      // Generic PayPal error
      if (err.message.includes("PayPal")) {
        return fail("Unable to complete payment. Please try again.", 502);
      }
    }
    
    return fail("Payment service temporarily unavailable.", 503);
  }
}
