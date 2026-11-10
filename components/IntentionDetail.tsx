"use client";

import { useState } from "react";
import { findRelated } from "@/lib/link";
import type { Action, EventType, Intention, LinkState, Memory } from "@/lib/types";
import { Recall } from "./Recall";
import { Btn, Chip, fmtDateTime, Highlighted, Label, label } from "./ui";

const EVENT_TEXT: Record<EventType, string> = {
  captured: "Remembered",
  continued: "Still wanted",
  reconsidered: "Reconsidering",
  archived: "Archived",
  purchased: "Purchased",
  link_confirmed: "Same underlying need as",
  link_dismissed: "Marked not related to",
};
const LINK_EVENTS: EventType[] = ["link_confirmed", "link_dismissed"];
const ARCHIVE_REASONS = ["I got it", "I no longer need it", "Other"];

export function IntentionDetail({
  intention: i,
  memory,
  onAction,
  onDecide,
}: {
  intention: Intention;
  memory: Memory;
  onAction: (id: string, action: Action, note?: string, paypalOrderId?: string) => void;
  onDecide: (aId: string, bId: string, state: LinkState) => void;
}) {
  const [mode, setMode] = useState<null | "reconsider" | "archive" | "purchase" | "purchase-confirm">(null);
  const [note, setNote] = useState("");
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const it = i.interpretation;
  const related = findRelated(it, memory, i.id).filter((r) => r.decision !== "dismissed");
  const rows = [
    it.purpose && ["Purpose", it.purpose],
    it.utility.length && ["Expected benefits", it.utility.join(", ")],
    it.context && ["Context", it.context],
    it.timing && ["Timing", it.timing],
    it.budget && ["Budget", `${it.budget.amount.toLocaleString()} ${it.budget.currency}`],
  ].filter((r): r is string[] => Array.isArray(r));

  function submit(action: Action, text?: string, paypalOrderId?: string) {
    onAction(i.id, action, text, paypalOrderId);
    setMode(null);
    setNote("");
    setPurchaseError(null);
  }

  async function handlePurchase() {
    if (!it.budget) {
      setPurchaseError("No budget specified for this intention.");
      return;
    }

    setPurchasing(true);
    setPurchaseError(null);

    try {
      // Create PayPal Sandbox order with user-declared amount from localStorage
      const createRes = await fetch("/api/paypal/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intentionId: i.id,
          subject: it.subject,
          amount: it.budget.amount,  // User-declared amount from localStorage
          currency: it.budget.currency,
        }),
      });

      if (!createRes.ok) {
        const error = await createRes.json();
        throw new Error(error.error || "Failed to create order");
      }

      const { orderId, approvalUrl } = await createRes.json();

      // Redirect to PayPal Sandbox for approval
      window.location.href = approvalUrl;
    } catch (err) {
      setPurchasing(false);
      setPurchaseError(err instanceof Error ? err.message : "Payment failed");
    }
  }

  return (
    <div className="rise mt-5 space-y-8 border-t border-line pt-6">
      <p className="max-w-prose font-serif text-xl italic leading-relaxed">
        <Highlighted text={i.rawText} quotes={it.signals.map((s) => s.quote)} />
      </p>

      {rows.length > 0 && (
        <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-dim">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {it.signals.length > 0 && (
        <div>
          <Label>Wording cues from your note</Label>
          <ul className="space-y-1.5">
            {it.signals.map((s) => (
              <li key={s.kind} className="flex flex-wrap items-baseline gap-3">
                <Chip>{label(s.kind)}</Chip>
                <span className="font-serif text-lg italic text-dim">“{s.quote}”</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Recall current={it} related={related} onDecide={(otherId, state) => onDecide(i.id, otherId, state)} />

      {it.budget && i.status !== "purchased" && (
        <div>
          <Label>Purchase (Sandbox Demo)</Label>
          {mode !== "purchase-confirm" ? (
            <div className="rounded-sm border border-line bg-white/[0.02] p-4">
              <p className="mb-3 text-sm text-dim">
                Ready to purchase <span className="font-serif italic">{it.subject}</span>?
              </p>
              <div className="mb-4 flex items-baseline gap-3">
                <span className="font-mono text-2xl font-medium">
                  {it.budget.currency} {it.budget.amount.toLocaleString()}
                </span>
                {it.purpose && <span className="text-sm text-dim">for {it.purpose}</span>}
              </div>
              <Btn variant="primary" onClick={() => setMode("purchase-confirm")}>
                Purchase with PayPal Sandbox
              </Btn>
            </div>
          ) : (
            <div className="rise rounded-sm border border-amber/40 bg-amber/5 p-4">
              <p className="mb-2 text-sm font-medium">Confirm PayPal Sandbox Purchase</p>
              <dl className="mb-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-dim">Product:</dt>
                  <dd className="font-serif italic">{it.subject}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-dim">Amount:</dt>
                  <dd className="font-mono font-medium">{it.budget.currency} {it.budget.amount.toLocaleString()}</dd>
                </div>
                {it.purpose && (
                  <div className="flex justify-between">
                    <dt className="text-dim">Purpose:</dt>
                    <dd>{it.purpose}</dd>
                  </div>
                )}
              </dl>
              <div className="mb-4 rounded border border-amber/30 bg-amber/10 p-3 text-xs">
                <p className="mb-2 font-medium">⚠️ Sandbox Demonstration</p>
                <p className="text-dim">
                  This is a PayPal Sandbox test environment. The amount shown is user-declared from your local browser storage,
                  not a verified merchant price. No real money will be charged.
                </p>
              </div>
              {purchaseError && (
                <p role="alert" className="mb-4 text-sm text-amber">
                  {purchaseError}
                </p>
              )}
              <div className="flex gap-2">
                <Btn variant="primary" onClick={handlePurchase} disabled={purchasing}>
                  {purchasing ? "Redirecting to PayPal..." : "Continue to PayPal"}
                </Btn>
                <Btn onClick={() => { setMode(null); setPurchaseError(null); }}>Cancel</Btn>
              </div>
            </div>
          )}
        </div>
      )}

      {i.status === "purchased" && (
        <div>
          <Label>Purchase completed</Label>
          <div className="rounded-sm border border-mint/40 bg-mint/5 p-4">
            <p className="text-sm">
              ✓ You purchased <span className="font-serif italic">{it.subject}</span>
              {it.budget && ` for ${it.budget.currency} ${it.budget.amount.toLocaleString()}`}.
            </p>
          </div>
        </div>
      )}

      <div>
        <Label>History</Label>
        <ol className="space-y-2 text-sm">
          {i.events.map((e) => (
            <li key={e.id} className="flex gap-4">
              <span className="w-28 shrink-0 font-mono text-[11px] leading-5 text-dim">{fmtDateTime(e.at)}</span>
              <span>
                {EVENT_TEXT[e.type]}
                {e.note && (LINK_EVENTS.includes(e.type) ? <span className="font-serif text-base italic"> “{e.note}”</span> : <span className="font-serif text-base italic text-dim">. {e.note}</span>)}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => (i.status === "archived" ? submit("continue") : submit("continue", "Still want this"))}>
            {i.status === "archived" ? "Reopen" : "Still want this"}
          </Btn>
          {i.status !== "archived" && <Btn onClick={() => setMode(mode === "reconsider" ? null : "reconsider")}>Reconsider</Btn>}
          {i.status !== "archived" && <Btn onClick={() => setMode(mode === "archive" ? null : "archive")}>Archive</Btn>}
        </div>

        {mode === "reconsider" && (
          <div className="rise flex items-end gap-3">
            <input
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit("reconsider", note)}
              placeholder="What makes you reconsider? (optional)"
              className="flex-1 border-b border-line bg-transparent py-1.5 font-serif text-lg italic placeholder:text-dim/60 focus:border-amber/60"
            />
            <Btn variant="primary" onClick={() => submit("reconsider", note)}>Save</Btn>
          </div>
        )}

        {mode === "archive" && (
          <div className="rise flex flex-wrap items-center gap-2">
            <span className="text-sm text-dim">Why?</span>
            {ARCHIVE_REASONS.map((r) => (
              <Btn key={r} onClick={() => submit("archive", r)}>{r}</Btn>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
