"use client";

import { RECALL_ENABLED } from "@/lib/flags";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Clock, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { findRelated, pairKey, recall } from "@/lib/link";
import type { Action, DecisionReminder, EventType, Intention, LinkState, Memory, ProductReference } from "@/lib/types";
import { ProductSection } from "./ProductSection";
import { now } from "@/lib/clock";
import { Recall } from "./Recall";
import { BudgetImpact, PriceAsk, PriceScanNote } from "./Budget";
import { scanPrices } from "@/lib/priceScan";
import { DetailStory } from "./DetailStory";
import { itemPrice, type Budget } from "@/lib/budget";
import { Btn, cap, fmtDate, fmtDateTime, Label, money, StatusMark } from "./ui";

const LINK_EVENTS: EventType[] = ["link_confirmed", "link_dismissed"];

function addDaysIso(days: number): string {
  const d = now();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function localDateInputToIso(ymd: string): string | null {
  const parts = ymd.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const [y, m, day] = parts;
  const d = new Date(y, m - 1, day, 9, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function localTodayYmd(): string {
  const d = now();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * The detail view lives in a native top-layer <dialog> sheet so the main page
 * stays calm and light. Answers five plain questions: what you wanted to solve,
 * whether you've been here before, what options you're weighing, what you did,
 * and where it stands.
 */
export function IntentionDetail({
  intention: i,
  memory,
  reminder,
  onClose,
  onAction,
  onDecide,
  onAddProduct,
  onRemoveProduct,
  onSelectProduct,
  onSetReminder,
  onCancelReminder,
  onDecideNow,
  onWaitAgain,
  onUndoLetGo,
  onLetGo,
  onSaveReflection,
  budget = null,
  spent = 0,
  onSetPrice,
  onWaitUntil,
  onPriceScan,
}: {
  intention: Intention;
  memory: Memory;
  reminder?: DecisionReminder;
  onClose: () => void;
  onAction: (id: string, action: Action, note?: string) => void;
  onDecide: (aId: string, bId: string, state: LinkState) => void;
  onAddProduct: (intentionId: string, product: Omit<ProductReference, "id" | "addedAt">) => void;
  onRemoveProduct: (intentionId: string, productId: string) => void;
  onSelectProduct: (intentionId: string, productId: string | null) => void;
  onSetReminder: (intentionId: string, dueAtIso: string) => void;
  onCancelReminder: (intentionId: string) => void;
  onDecideNow: (id: string) => void;
  onWaitAgain: (id: string, days: 1 | 3 | 7) => void;
  onUndoLetGo: (id: string) => void;
  onLetGo: (id: string) => void;
  onSaveReflection: (id: string, text: string) => void;
  budget?: Budget | null;
  spent?: number;
  onSetPrice?: (id: string, amount: number) => void;
  onWaitUntil?: (id: string, iso: string) => void;
  onPriceScan?: (id: string, scan: import("@/lib/types").PriceScan) => void;
}) {
  const { lang, t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<null | "reconsider" | "archive" | "checkout" | "remind">(null);
  const [note, setNote] = useState("");
  const [customDate, setCustomDate] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Open as a modal in the browser's top layer and close when the parent clears it.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (!d.open) d.showModal();
  }, [i.id]);

  // Fallback for browsers (e.g. Safari) without native `closedby="any"` light dismiss.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d || "closedBy" in HTMLDialogElement.prototype) return;
    const outside = (e: PointerEvent) => {
      const r = d.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    let armed = false;
    const down = (e: PointerEvent) => {
      armed = outside(e);
    };
    const up = (e: PointerEvent) => {
      if (armed && outside(e)) d.close();
    };
    d.addEventListener("pointerdown", down);
    d.addEventListener("pointerup", up);
    return () => {
      d.removeEventListener("pointerdown", down);
      d.removeEventListener("pointerup", up);
    };
  }, []);

  const it = i.interpretation;
  const chosenProduct = i.products?.find((p) => p.id === i.selectedProductId);
  // An agent proposal already carries a price: it is payable without adding an option.
  const proposal = i.source === "agent" && i.price && Number(i.price.value) > 0 ? i.price : null;
  const chosen = chosenProduct ?? (proposal
    ? { id: "proposal", name: cap(i.interpretation.subject), price: Number(proposal.value), currency: proposal.currency, merchant: undefined as string | undefined }
    : undefined);
  const approxPrice = itemPrice(i);
  const budgetLeft = budget ? { amount: Math.max(0, budget.amount - spent), currency: budget.currency } : null;
  // The price that matters at decision time: the chosen product, else the rough estimate.
  const decisionPrice = chosen?.price && chosen.price > 0 ? chosen.price : approxPrice?.amount;
  const overBudget = !!budgetLeft && typeof decisionPrice === "number" && decisionPrice > budgetLeft.amount;
  const [scanState, setScanState] = useState<"idle" | "busy" | "none">("idle");
  const runScan = async () => {
    setScanState("busy");
    const result = await scanPrices(i.interpretation.subject, now().toISOString());
    if (result) { onPriceScan?.(i.id, result); setScanState("idle"); } else setScanState("none");
  };
  const userEstimate = i.interpretation.budget?.amount ?? (i.source === "human" && i.price ? Number(i.price.value) : null);
  const scanBlock = i.status === "bought" || i.status === "purchased" ? null : i.priceScan
    ? <PriceScanNote scan={i.priceScan} estimate={userEstimate} budget={budget} spent={spent} />
    : onPriceScan
      ? <div className="text-sm">{scanState === "none" ? <p className="text-dim">{t.scan.none}</p> : <button type="button" onClick={runScan} disabled={scanState === "busy"} className="font-medium text-[#0070BA] underline disabled:opacity-50">{scanState === "busy" ? t.scan.checking : `🔎 ${t.scan.check}`}</button>}</div>
      : null;
  const firstOfNextMonth = () => { const n = now(); return new Date(n.getFullYear(), n.getMonth() + 1, 1, 9).toISOString(); };
  // Deciding means naming the real thing: without a priced product there is nothing for PayPal to pay for.
  const needsProduct = i.status === "ready" && mode !== "checkout" && !(chosen?.price && chosen.price > 0);
  const purchaseEvent = [...i.events].reverse().find((e) => e.type === "purchased");

  // Show all explicitly confirmed links (so they match the timeline and can be unlinked),
  // undecided links, and at most one unanswered suggestion worth asking about.
  const allRelated = findRelated(it, memory, i.id);
  const confirmedIntentions = memory.intentions.filter(
    (other) => other.id !== i.id && memory.links[pairKey(i.id, other.id)] === "confirmed",
  );
  const unsureLinks = allRelated.filter((r) => r.decision === "unsure");
  const unasked = recall(it, memory, i.id);

  function submit(action: Action, text?: string) {
    onAction(i.id, action, text);
    setMode(null);
    setNote("");
    setPayError(null);
  }

  async function startPayPal() {
    if (!chosen || !chosen.price || chosen.price <= 0) return;
    setPaying(true);
    setPayError(null);
    try {
      const res = await fetch("/api/paypal/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intentionId: i.id,
          item: chosen.name,
          price: { value: chosen.price.toFixed(2), currency: chosen.currency || "USD" },
          reason: it.purpose || i.rawText,
          paypalOrderId: i.paypalOrderId,
          merchant: chosen.merchant,
          productId: chosenProduct?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create order");
      window.location.href = data.approvalUrl;
    } catch (err) {
      setPaying(false);
      setPayError(err instanceof Error ? err.message : t.paypal.failed);
    }
  }

  const EVENT_TEXT: Record<EventType, string> = t.detail.events;
  const visibleEvents = RECALL_ENABLED ? i.events : i.events.filter((event) => !LINK_EVENTS.includes(event.type));
  const archiveReasons = [t.detail.reasons.gotIt, t.detail.reasons.noLongerNeed, t.detail.reasons.other];

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: "any" } as Record<string, string>)}
      onClose={() => {
        if (dialogRef.current) dialogRef.current.returnValue = "";
        onClose();
      }}
      aria-labelledby="sheet-title"
      className="sheet m-0 ml-auto h-dvh max-h-dvh w-full max-w-xl bg-white p-0 text-fg shadow-2xl"
    >
      <div className="flex min-h-full flex-col">
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-white/95 px-6 py-5 backdrop-blur-xs sm:px-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-dim">
              <StatusMark status={i.status}>{t.list.status[i.status]}</StatusMark>
              <span>·</span>
              <span>
                {t.detail.remembered} {fmtDate(i.createdAt, lang)}
              </span>
            </div>
            <h2 id="sheet-title" className="mt-1.5 font-display text-3xl leading-tight tracking-tight text-fg">
              {cap(it.subject)}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={t.detail.close}
            className="shrink-0 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-fg"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 space-y-10 px-6 py-8 sm:px-8">
          {/* 1. Where it is in the story, and why you wanted it — in your own words */}
          <DetailStory i={i} />
          <section aria-labelledby="why" className="border-t border-line pt-8">
            <h3 id="why">
              <Label>{t.detail.yourWords}</Label>
            </h3>
            {(() => {
              const original = i.rawText.split(" — ")[0];
              const words = (x: string) => x.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
              const subjectWords = new Set(words(it.subject));
              const reason = it.purpose && words(it.purpose).some((w) => !subjectWords.has(w)) ? it.purpose : null;
              return reason ? (
                <>
                  <p className="font-display text-3xl leading-snug text-fg">“{reason}”</p>
                  {original.trim().toLocaleLowerCase() !== reason.trim().toLocaleLowerCase() && <p className="mt-2 text-sm text-dim">{t.story.youWrote} “{original}”</p>}
                </>
              ) : (
                <p className="font-display text-2xl leading-snug text-fg">“{original}”</p>
              );
            })()}
          </section>

          {/* 2. Did you consider something similar before? */}
          {RECALL_ENABLED && (confirmedIntentions.length > 0 || unsureLinks.length > 0 || unasked) && (
            <section className="space-y-5 border-t border-line pt-8" aria-labelledby="similar">
              <h3 id="similar">
                <Label>{t.detail.similarTitle}</Label>
              </h3>

              {confirmedIntentions.map((other) => (
                <div key={other.id} className="border-l-2 border-emerald-600/70 pl-4">
                  <p className="text-[15px] font-medium text-fg">{cap(other.interpretation.subject)}</p>
                  <p className="mt-0.5 text-sm text-dim">“{other.rawText}”</p>
                  <div className="mt-1.5 flex items-center gap-3 text-xs">
                    <span className="text-emerald-800">{t.detail.sameNeed}</span>
                    <button
                      type="button"
                      onClick={() => onDecide(i.id, other.id, "dismissed")}
                      className="text-slate-400 underline decoration-slate-300 underline-offset-2 hover:text-fg"
                    >
                      {t.detail.notSame}
                    </button>
                  </div>
                </div>
              ))}

              {unsureLinks.map((r) => (
                <div key={r.intention.id} className="border-l-2 border-slate-300 pl-4">
                  <p className="text-[15px] font-medium text-fg">{cap(r.intention.interpretation.subject)}</p>
                  <p className="mt-0.5 text-sm text-dim">“{r.intention.rawText}”</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-dim">{t.detail.unsureLabel}</span>
                    <button type="button" onClick={() => onDecide(i.id, r.intention.id, "confirmed")} className="rounded-full border border-line bg-white px-2.5 py-0.5 text-fg hover:border-slate-300">
                      {t.recall.yes}
                    </button>
                    <button type="button" onClick={() => onDecide(i.id, r.intention.id, "dismissed")} className="rounded-full border border-line bg-white px-2.5 py-0.5 text-dim hover:border-slate-300 hover:text-fg">
                      {t.recall.no}
                    </button>
                  </div>
                </div>
              ))}

              {unasked && (
                <div className="rounded-2xl bg-stone-50 p-5 ring-1 ring-stone-200/70">
                  <Recall current={it} related={unasked} answer={unasked.decision} onAnswer={(state) => onDecide(i.id, unasked.intention.id, state)} onSaveReflection={(text) => onSaveReflection(i.id, text)} compact />
                </div>
              )}
            </section>
          )}

          {/* 4. What now? — PayPal Sandbox appears ONLY after choosing an option with a price and deciding to go ahead */}
          {i.status === "purchased" || i.status === "bought" ? (
            <section className="border-t border-line pt-8">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                  <Check size={16} /> {t.detail.boughtTitle}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-emerald-900/90">
                  {chosen?.name || cap(it.subject)}
                  {purchaseEvent?.amount !== undefined && purchaseEvent.currency && ` · ${money(purchaseEvent.amount, purchaseEvent.currency, lang)}`}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-emerald-800/80">{t.detail.receiptDesc}</p>
                <p className="mt-2 text-sm text-emerald-900">{t.detail.whyPrefix} “{it.purpose || i.rawText}”</p>
                <p className="mt-1 text-xs text-emerald-800/80">{t.detail.waited(i.waitDays)}</p>
                {purchaseEvent?.paypalOrderId && (
                  <p className="mt-2 font-mono text-[11px] text-emerald-800/70">
                    {t.detail.order}: {purchaseEvent.paypalOrderId}
                  </p>
                )}
              </div>
            </section>
          ) : (
            <section className="border-t border-line pt-8" aria-labelledby="what-now">
              <h3 id="what-now">
                <Label>{t.detail.nextTitle}</Label>
              </h3>

              {i.status === "waiting" ? <div className="space-y-3 py-3"><p className="text-lg font-semibold text-fg">{t.detail.waitingUntil(fmtDate(i.waitUntil, lang))}</p>{approxPrice ? <BudgetImpact price={approxPrice} budget={budget} spent={spent} /> : budget ? <PriceAsk onSave={(n) => onSetPrice?.(i.id, n)} /> : null}{scanBlock}<div className="flex gap-4 text-sm"><button type="button" className="underline" onClick={() => onDecideNow(i.id)}>{t.detail.decideNow}</button><button type="button" className="underline" onClick={() => onLetGo(i.id)}>{t.detail.letItGo}</button></div></div>
              : i.status === "let_go" || i.status === "archived" ? <div className="space-y-3 py-3"><p className="text-sm font-medium text-fg">{t.detail.letGoUndo}</p><button type="button" className="text-sm underline" onClick={() => onUndoLetGo(i.id)}>{t.composer.undo}</button></div>
              : i.status === "ready" && mode !== "checkout" ? <div className="space-y-4 py-3"><p className="text-lg font-semibold text-fg">{t.detail.readyWhen}</p>{chosen?.price && chosen.price > 0 ? <><BudgetImpact price={{ amount: chosen.price, currency: chosen.currency || "USD" }} budget={budget} spent={spent} /><button type="button" onClick={() => setMode("checkout")} className="w-full rounded-2xl bg-[#0070BA] py-4 text-base font-semibold text-white hover:bg-[#005EA6]">{t.detail.approve} · {money(chosen.price, chosen.currency || "USD", lang)}</button>{chosenProduct?.url && <a href={chosenProduct.url} target="_blank" rel="noopener noreferrer" className="block w-full rounded-2xl border border-line bg-white py-3 text-center text-sm font-semibold text-fg hover:bg-slate-50">{t.detail.visitStore(chosenProduct.merchant || "store")}<span className="block text-xs font-normal text-dim">{t.detail.visitStoreHint}</span></a>}</> : <div className="rounded-2xl border-2 border-[#0070BA]/30 bg-[#0070BA]/[0.03] p-4">
                {approxPrice && !(i.products ?? []).some((p) => typeof p.price === "number" && p.price > 0) && <div className="mb-4"><BudgetImpact price={approxPrice} budget={budget} spent={spent} /></div>}
                {scanBlock && <div className="mb-4">{scanBlock}</div>}
                <p className="text-lg font-semibold text-[#003087]">{t.story.exactly}</p>
                <p className="mt-1 text-sm text-dim">{t.story.exactlySub}</p>
                <div className="mt-2">
                  <ProductSection
                    products={i.products ?? []}
                    selectedProductId={i.selectedProductId}
                    onAddProduct={(p) => onAddProduct(i.id, p)}
                    onRemoveProduct={(pId) => onRemoveProduct(i.id, pId)}
                    onSelectProduct={(pId) => { onSelectProduct(i.id, pId); setMode(null); setPayError(null); }}
                    defaultSearchQuery={it.subject}
                    startAdding={!(i.products?.length)}
                    title=""
                    budgetLeft={budgetLeft}
                  />
                </div>
              </div>}{overBudget && onWaitUntil && <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4"><button type="button" onClick={() => onWaitUntil(i.id, firstOfNextMonth())} className="w-full rounded-xl bg-white py-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-50">{t.budget.nextMonth} ⏳</button><p className="mt-2 text-xs text-amber-900/80">{t.budget.nextMonthHint}</p></div>}<div className="flex gap-4 text-sm"><button type="button" className="underline" onClick={() => onWaitAgain(i.id, 3)}>{t.detail.waitMore}</button><button type="button" className="underline" onClick={() => onLetGo(i.id)}>{t.detail.letItGo}</button></div></div>
              : mode === "checkout" && chosen && chosen.price ? (
                <div className="rise rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-900">{t.detail.checkoutTitle}</p>
                  <p className="mt-2 font-display text-2xl text-fg">{chosen.name}</p>
                  <p className="mt-1 text-lg font-medium tabular-nums text-fg">{money(chosen.price, chosen.currency || "USD", lang)}</p>
                  <p className="mt-3 text-sm leading-relaxed text-amber-950/80">
                    {t.detail.checkoutDesc(chosen.merchant || t.detail.theMerchant)}
                  </p>
                  <p className="mt-2 text-xs text-amber-900/70">
                    {chosenProduct ? (chosenProduct.source === "channel3" ? t.detail.priceSource.channel3(chosenProduct.merchant || "the store") : chosenProduct.source === "url" ? t.detail.priceSource.url : t.detail.priceSource.manual) : t.detail.priceSource.agent}
                  </p>
                  {payError && (
                    <p role="alert" className="mt-3 text-sm font-medium text-amber-900">
                      {payError}
                    </p>
                  )}
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button type="button" onClick={startPayPal} disabled={paying} className="rounded-full bg-[#FFC439] px-6 py-3 text-sm font-semibold text-[#003087] hover:brightness-95 disabled:opacity-50">
                      {paying ? t.detail.redirecting : t.detail.payBtn}
                    </button>
                    <Btn onClick={() => setMode(null)} disabled={paying}>
                      {t.detail.back}
                    </Btn>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {chosen ? (
                    chosen.price && chosen.price > 0 ? (
                      <div className="rounded-2xl border border-line bg-stone-50/60 p-4">
                        <p className="text-sm text-dim">
                          {chosen.name} · <span className="font-medium text-fg">{money(chosen.price, chosen.currency || "USD", lang)}</span>
                        </p>
                        <div className="mt-3">
                          <Btn variant="primary" onClick={() => setMode("checkout")}>
                            {t.detail.decideBuy}
                          </Btn>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-dim">{t.detail.needsPrice}</p>
                    )
                  ) : (
                    (i.products?.length ?? 0) > 0 && <p className="text-sm text-dim">{t.detail.chooseFirst}</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Btn onClick={() => submit("continue")}>{t.detail.keep}</Btn>
                    {
                      <Btn onClick={() => setMode(mode === "reconsider" ? null : "reconsider")}>{t.detail.thinkAgain}</Btn>
                    }
                    {
                      <Btn onClick={() => setMode(mode === "remind" ? null : "remind")}>
                        <Clock size={14} /> {t.detail.reminder.trigger}
                      </Btn>
                    }
                    {
                      <Btn onClick={() => setMode(mode === "archive" ? null : "archive")}>{t.detail.letGo}</Btn>
                    }
                  </div>

                  {reminder && mode !== "remind" && (
                    <div className="flex flex-wrap items-center gap-3 text-xs text-dim">
                      <span className="inline-flex items-center gap-1.5 text-emerald-800">
                        <Clock size={12} /> {t.detail.reminder.scheduled(fmtDate(reminder.dueAt, lang))}
                      </span>
                      <button type="button" onClick={() => setMode("remind")} className="underline decoration-slate-300 underline-offset-2 hover:text-fg">
                        {t.detail.reminder.change}
                      </button>
                      <button type="button" onClick={() => onCancelReminder(i.id)} className="underline decoration-slate-300 underline-offset-2 hover:text-fg">
                        {t.detail.reminder.cancel}
                      </button>
                    </div>
                  )}

                  {mode === "remind" && (
                    <div className="rise space-y-3 rounded-2xl border border-line bg-stone-50/70 p-4">
                      <div className="flex flex-wrap gap-2">
                        {[
                          [1, t.detail.reminder.tomorrow],
                          [3, t.detail.reminder.in3Days],
                          [7, t.detail.reminder.in7Days],
                        ].map(([days, text]) => (
                          <Btn
                            key={String(days)}
                            onClick={() => {
                              onSetReminder(i.id, addDaysIso(days as number));
                              setMode(null);
                            }}
                          >
                            {text}
                          </Btn>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-xs text-dim" htmlFor="custom-reminder-date">
                          {t.detail.reminder.chooseDate}
                        </label>
                        <input
                          id="custom-reminder-date"
                          type="date"
                          min={localTodayYmd()}
                          value={customDate}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomDate(val);
                            const iso = localDateInputToIso(val);
                            if (iso) {
                              onSetReminder(i.id, iso);
                              setMode(null);
                            }
                          }}
                          className="rounded-full border border-line bg-white px-3 py-1 text-xs text-fg focus:border-slate-400"
                        />
                        {reminder && (
                          <button
                            type="button"
                            onClick={() => {
                              onCancelReminder(i.id);
                              setMode(null);
                            }}
                            className="ml-auto text-xs text-dim underline decoration-slate-300 underline-offset-2 hover:text-fg"
                          >
                            {t.detail.reminder.cancel}
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{t.detail.reminder.localNote}</p>
                    </div>
                  )}

                  {mode === "reconsider" && (
                    <div className="rise flex items-center gap-2 pt-1">
                      <input
                        autoFocus
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && submit("reconsider", note)}
                        placeholder={t.detail.thinkPrompt}
                        className="flex-1 rounded-full border border-line bg-white px-4 py-2 text-sm text-fg placeholder:text-slate-400 focus:border-slate-400"
                      />
                      <Btn variant="primary" onClick={() => submit("reconsider", note)}>
                        {t.detail.save}
                      </Btn>
                    </div>
                  )}

                  {mode === "archive" && (
                    <div className="rise flex flex-wrap items-center gap-2 pt-1">
                      <span className="mr-1 text-xs text-dim">{t.detail.why}</span>
                      {archiveReasons.map((r) => (
                        <Btn key={r} onClick={() => submit("archive", r)}>
                          {r}
                        </Btn>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* 3. Options you're weighing */}
          {!needsProduct && <div className="border-t border-line pt-8">
            <ProductSection
              products={i.products ?? []}
              selectedProductId={i.selectedProductId}
              onAddProduct={(p) => onAddProduct(i.id, p)}
              onRemoveProduct={(pId) => onRemoveProduct(i.id, pId)}
              onSelectProduct={(pId) => {
                onSelectProduct(i.id, pId);
                setMode(null);
                setPayError(null);
              }}
              defaultSearchQuery={it.subject}
              isPurchased={i.status === "purchased" || i.status === "bought"}
              budgetLeft={budgetLeft}
            />
          </div>}

          {/* 5. Quiet history, collapsed by default */}
          <details className="group/hist border-t border-line pt-6">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-dim hover:text-fg">
              <ChevronDown size={13} className="transition-transform group-open/hist:rotate-180" />
              {t.detail.history} <span className="tabular-nums text-slate-400">{visibleEvents.length}</span>
            </summary>
            <ol className="mt-4 space-y-2.5 text-sm">
              {visibleEvents.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="w-28 shrink-0 text-xs tabular-nums text-slate-400">{fmtDateTime(e.at, lang)}</span>
                  <span className="text-slate-700">
                    <span>{EVENT_TEXT[e.type]}</span>
                    {e.productName && e.type !== "product_added" && e.type !== "product_removed" && (
                      <span className="font-medium text-fg"> · {e.productName}</span>
                    )}
                    {e.note &&
                      (LINK_EVENTS.includes(e.type) ? (
                        <span className="text-fg"> “{e.note}”</span>
                      ) : e.type !== "product_selected" ? (
                        <span className="text-dim"> — {e.note === "Ended wait early" && lang === "es" ? "Terminó la espera antes" : e.note}</span>
                      ) : null)}
                  </span>
                </li>
              ))}
            </ol>
          </details>
        </div>
      </div>
    </dialog>
  );
}
