"use client";

import { useEffect, useState } from "react";
import { loadMemory, saveMemory } from "@/lib/storage";
import { recordPayPalPurchase } from "@/lib/memory";

export default function PayPalReturn() {
  const [message, setMessage] = useState("Confirming your PayPal Sandbox approval…");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("token");
    const intentionId = params.get("intentionId");
    if (!orderId || !intentionId) { setMessage("This payment could not be matched to a WhyBuy item."); return; }
    (async () => {
      try {
        const response = await fetch("/api/paypal/capture-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, intentionId }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Payment confirmation failed.");
        const memory = loadMemory();
        const intention = memory.intentions.find((item) => item.id === intentionId);
        if (!intention) throw new Error("The purchase intention is no longer in this browser's local memory.");
        saveMemory(recordPayPalPurchase(memory, intentionId, { orderId, captureId: data.captureId, capturedAt: data.capturedAt, amount: data.amount, currency: data.currency }));
        setMessage("Bought · paid with PayPal. Returning to WhyBuy…");
        window.setTimeout(() => window.location.replace(`/?bought=${encodeURIComponent(intentionId)}`), 900);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Payment confirmation failed.");
      }
    })();
  }, []);
  return <main className="mx-auto max-w-xl px-6 py-24"><p role="status" className="text-lg text-fg">{message}</p><a href="/" className="mt-6 inline-block text-sm underline">Return to WhyBuy</a></main>;
}
