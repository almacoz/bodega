import { NextResponse } from "next/server";
import { createPayPalOrder, getPayPalOrderDetails } from "@/lib/paypal";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const { intentionId, paypalOrderId, item, price, reason, merchant, productId } = body ?? {};
    if (typeof intentionId !== "string" || !/^[A-Za-z0-9_-]{3,80}$/.test(intentionId) || typeof item !== "string" || item.length < 1 || item.length > 120 || typeof reason !== "string" || !reason.trim() || reason.length > 500) return NextResponse.json({ error: "Invalid purchase details." }, { status: 400 });
    if (!price || typeof price.value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(price.value) || Number(price.value) <= 0 || Number(price.value) > 10000 || typeof price.currency !== "string" || !/^[A-Z]{3}$/.test(price.currency)) return NextResponse.json({ error: "Invalid price." }, { status: 400 });

    if (typeof paypalOrderId === "string" && /^[A-Za-z0-9_-]{3,80}$/.test(paypalOrderId)) {
      try {
        const existing = await getPayPalOrderDetails(paypalOrderId);
        if (existing.status === "CREATED" || existing.status === "APPROVED") {
          const link = existing.links.find((candidate) => candidate.rel === "payer-action" || candidate.rel === "approve");
          if (link && /^https:\/\/(www\.)?(sandbox\.)?paypal\.com\//i.test(link.href)) return NextResponse.json({ orderId: existing.id, approvalUrl: link.href });
        }
      } catch { /* Expired or unavailable orders are replaced below. */ }
    }

    const { orderId, approvalUrl } = await createPayPalOrder(intentionId, item, Number(price.value), price.currency, typeof productId === "string" ? productId.slice(0, 80) : undefined, reason.trim(), typeof merchant === "string" ? merchant.slice(0, 80) : undefined);
    return NextResponse.json({ orderId, approvalUrl });
  } catch {
    return NextResponse.json({ error: "Unable to create a PayPal Sandbox approval. Try again." }, { status: 502 });
  }
}
