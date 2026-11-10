"use client";

import { useEffect, useState } from "react";
import { Composer } from "@/components/Composer";
import { Timeline } from "@/components/Timeline";
import { addIntention, applyAction, decideLink } from "@/lib/memory";
import { loadMemory, saveMemory } from "@/lib/storage";
import type { Action, Interpretation, LinkState, Memory } from "@/lib/types";

export default function Home() {
  const [memory, setMemory] = useState<Memory | null>(null); // null until localStorage is read
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newestId, setNewestId] = useState<string | null>(null);
  const [paypalProcessing, setPaypalProcessing] = useState(false);
  const [paypalError, setPaypalError] = useState<string | null>(null);

  useEffect(() => {
    setMemory(loadMemory());
  }, []);
  
  useEffect(() => {
    if (memory) saveMemory(memory);
  }, [memory]);

  // Handle PayPal callback after user approves payment
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token"); // PayPal order ID
    const intentionId = params.get("intention");

    if (token && !paypalProcessing && memory) {
      // Check if this order ID was already captured
      const alreadyCaptured = memory.intentions.some((i) =>
        i.events.some((e) => e.paypalOrderId === token)
      );

      if (alreadyCaptured) {
        // Already processed this order - just clean up URL
        window.history.replaceState({}, "", window.location.pathname);
        setPaypalError("This payment has already been processed.");
        return;
      }

      handlePayPalCallback(token, intentionId);
    }
  }, [memory, paypalProcessing]);

  async function handlePayPalCallback(orderId: string, intentionId: string | null) {
    // Find intention from memory if not in URL
    if (!intentionId && memory) {
      // Try to match order to most recent active intention with budget
      const candidate = [...memory.intentions]
        .reverse()
        .find((i) => i.status === "active" && i.interpretation.budget);
      intentionId = candidate?.id || null;
    }

    if (!intentionId) {
      setPaypalError("Unable to match payment to an intention.");
      // Clean up URL even on error
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    setPaypalProcessing(true);
    setPaypalError(null);

    try {
      const res = await fetch("/api/paypal/capture-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, intentionId }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Capture failed");
      }

      const result = await res.json();

      // Record purchase in memory with verified details from PayPal
      // Note: Client-side deduplication is not production-grade server-side idempotency
      act(
        intentionId,
        "purchase",
        `Purchased via PayPal Sandbox for ${result.currency} ${result.amount}`,
        orderId
      );

      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);
      setSelectedId(intentionId);
      setNewestId(intentionId);
    } catch (err) {
      setPaypalError(err instanceof Error ? err.message : "Payment processing failed");
      // Clean up URL even on error
      window.history.replaceState({}, "", window.location.pathname);
    } finally {
      setPaypalProcessing(false);
    }
  }

  function save(text: string, interp: Interpretation, decisions: Record<string, LinkState>) {
    if (!memory) return;
    const r = addIntention(memory, text, interp, decisions);
    setMemory(r.memory);
    setSelectedId(r.id);
    setNewestId(r.id);
  }

  const act = (id: string, action: Action, note?: string, paypalOrderId?: string) =>
    setMemory((m) => m && applyAction(m, id, action, note, paypalOrderId));
  const decide = (a: string, b: string, state: LinkState) => setMemory((m) => m && decideLink(m, a, b, state));

  return (
    <main className="mx-auto max-w-3xl px-6 pb-40 pt-14 sm:pt-20">
      <header className="mb-16 flex items-baseline gap-4">
        <h1 className="font-serif text-3xl">Bodega</h1>
        <p className="text-sm text-dim">A memory of what you intend.</p>
      </header>

      {paypalProcessing && (
        <div className="mb-8 rounded-sm border border-mint/40 bg-mint/5 p-4" role="status">
          <p className="text-sm">Processing your payment...</p>
        </div>
      )}

      {paypalError && (
        <div className="mb-8 rounded-sm border border-amber/40 bg-amber/5 p-4" role="alert">
          <p className="text-sm text-amber">{paypalError}</p>
        </div>
      )}

      {memory ? (
        <>
          <Composer memory={memory} onSave={save} />
          <Timeline memory={memory} selectedId={selectedId} newestId={newestId} onSelect={setSelectedId} onAction={act} onDecide={decide} />
        </>
      ) : (
        <div aria-hidden className="h-40 animate-pulse rounded-sm bg-white/[0.03]" />
      )}
    </main>
  );
}
