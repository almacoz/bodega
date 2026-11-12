"use client";

import { RECALL_ENABLED } from "@/lib/flags";
import { useState, type ReactNode } from "react";
import { ArrowUp, Bot, Check, Hourglass, Loader2, PenLine, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { recall } from "@/lib/link";
import type { Interpretation, LinkState, Memory, PriceScan, Related } from "@/lib/types";
import { scanPrices } from "@/lib/priceScan";
import { now } from "@/lib/clock";
import type { Budget } from "@/lib/budget";
import { PriceScanNote } from "./Budget";
import { Recall } from "./Recall";
import { cap } from "./ui";

interface Result {
  id: string;
  interp: Interpretation;
  related: Related | null;
  answer: LinkState | null;
}

type Phase = "input" | "why" | "pause" | "done";
type Wait = 0 | 1 | 3 | 7;
const suggestedWait = (reason?: string): Wait => (reason === "functional" ? 0 : reason === "emotional" ? 3 : 1);

const WHY_CHIPS = [
  { key: "need", emoji: "🛠️", kind: "functional" },
  { key: "replace", emoji: "🔁", kind: "functional" },
  { key: "saw", emoji: "✨", kind: "emotional" },
  { key: "treat", emoji: "🎁", kind: "emotional" },
] as const;

const FILLER = new Set(["quiero", "quisiera", "comprar", "compra", "comprarme", "necesito", "una", "uno", "unos", "unas", "the", "some", "want", "buy", "would", "like", "get", "for", "para", "que", "and", "con"]);
const contentWords = (s: string) =>
  s.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !FILLER.has(w));

/** Used when the AI is unreachable: the note is kept verbatim and the person says why with one tap. */
function offlineInterpretation(text: string): Interpretation {
  const head = text.split(/[,.;:\n]| because | para | porque | for /i)[0].trim();
  const subject = head.replace(/^(i (want|need|would like)( to (buy|get))?|quiero|quisiera|necesito|me gustaria|me gustaría)( comprar| comprarme| una| un| unos| unas| a| an| some| the)?\s*/i, "").trim() || head;
  const money = text.match(/(?:\$|usd\s?)(\d[\d.,]*)|(\d[\d.,]*)\s?(?:usd|dollars|dólares|dolares)/i);
  const amount = money ? Number((money[1] ?? money[2]).replace(/,/g, "")) : NaN;
  return { language: "en", subject: subject.slice(0, 80), category: "other", purpose: null, needs: [], utility: [], context: null, timing: null, budget: Number.isFinite(amount) && amount > 0 ? { amount, currency: "USD" } : null, signals: [], hasReason: false };
}

/** A "reason" that only repeats the item's name is not a reason. */
function lacksReason(interp: Interpretation): boolean {
  if (interp.hasReason === false) return true;
  const purpose = interp.purpose?.trim();
  // The model can flag a reason without extracting it as a phrase; the note itself then carries the why.
  if (!purpose) return interp.hasReason !== true;
  // A budget is not a reason ("around $1400").
  if (/^(around|about|approx\.?|roughly|unos|unas|cerca de|aprox\.?|~)?\s*(\$|usd\s?)?\d[\d.,]*\s*(usd|dollars|dólares|dolares)?\s*$/i.test(purpose)) return true;
  const item = new Set(contentWords(interp.subject));
  return contentWords(purpose).every((w) => item.has(w));
}

/** Story progress: Want it → Why? → The pause. One step on screen at a time. */
function StoryDots({ phase }: { phase: Phase }) {
  const { t } = useI18n();
  const current = phase === "input" ? 0 : phase === "why" ? 1 : phase === "pause" ? 2 : 3;
  const steps = [
    { label: t.story.step1, icon: PenLine },
    { label: t.story.step2, icon: null },
    { label: t.story.step3, icon: Hourglass },
  ];
  return (
    <ol className="mb-4 flex items-center gap-2 text-xs font-medium" aria-label="Progress">
      {steps.map(({ label, icon: Icon }, n) => {
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="flex items-center gap-2">
            {n > 0 && <span aria-hidden className={`h-px w-6 ${done || active ? "bg-fg" : "bg-slate-200"}`} />}
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors ${active ? "bg-fg text-white" : done ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-400"}`}>
              {done ? <Check size={12} aria-hidden /> : Icon ? <Icon size={12} aria-hidden /> : <span aria-hidden>?</span>}
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The front door, told as a short story: what you want, why, and how long it rests.
 * The person can also hand the first step to their AI assistant.
 */
export function Composer({
  memory,
  onSave,
  onInterpret,
  onWaitDays,
  onSaveReflection,
  onDecide,
  onUndo,
  onOpen,
  agentSlot,
  onPriceScan,
  budget = null,
  spent = 0,
}: {
  memory: Memory;
  onSave: (text: string, interp: Interpretation, waitDays: Wait) => string;
  onInterpret: (id: string, interp: Interpretation, related: Related | null) => void;
  onWaitDays: (id: string, days: Wait) => void;
  onSaveReflection: (id: string, text: string) => void;
  onDecide: (aId: string, bId: string, state: LinkState) => void;
  onUndo: (id: string) => void;
  onOpen: (id: string) => void;
  agentSlot?: ReactNode;
  onPriceScan?: (id: string, scan: PriceScan) => void;
  budget?: Budget | null;
  spent?: number;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"me" | "agent">("me");
  const [phase, setPhase] = useState<Phase>("input");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [saved, setSaved] = useState<{ id: string; text: string } | null>(null);
  const [waitDays, setWaitDays] = useState<Wait>(3);
  const [suggested, setSuggested] = useState<Wait>(3);
  const [followup, setFollowup] = useState<{ text: string; interp: Interpretation } | null>(null);
  const [reasonAnswer, setReasonAnswer] = useState("");
  const [scan, setScan] = useState<PriceScan | null>(null);

  function commit(note: string, interp: Interpretation, related: Related | null = null) {
    setError(null);
    const wait = suggestedWait(interp.reasonType);
    setError(null);
    setWaitDays(wait);
    setSuggested(wait);
    const id = onSave(note, interp, wait);
    onInterpret(id, interp, related);
    setSaved({ id, text: note });
    setResult({ id, interp, related, answer: null });
    setPhase("pause");
    // One background Channel3 search: real store prices for what was named. Silent if nothing solid comes back.
    setScan(null);
    scanPrices(interp.subject, now().toISOString()).then((s) => {
      if (!s) return;
      setScan(s);
      onPriceScan?.(id, s);
    });
  }

  async function remember() {
    const note = text.trim();
    if (busy || note.length < 3) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setSaved(null);
    try {
      const known = memory.intentions.map((i) => i.interpretation);
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: note,
          knownNeeds: [...new Set(known.flatMap((k) => k.needs))],
          knownCategories: [...new Set(known.map((k) => k.category))],
          recent: [...memory.intentions]
            .reverse()
            .slice(0, 15)
            .map((i) => ({ id: i.id, subject: i.interpretation.subject, purpose: i.interpretation.purpose })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      const interp: Interpretation = data.interpretation;
      setText("");
      if (data.hasReason === false || lacksReason(interp)) {
        setFollowup({ text: note, interp: { ...interp, purpose: null } });
        setReasonAnswer("");
        setPhase("why");
        return;
      }
      // Look back before saving, so the only candidates are things remembered earlier.
      const related = RECALL_ENABLED ? recall(interp, memory, undefined, data.sameProblemAs ?? null) : null;
      commit(note, interp, related);
    } catch (e) {
      // The model is optional: never lose what the person wrote. Ask why with one tap and continue locally.
      setText("");
      setFollowup({ text: note, interp: offlineInterpretation(note) });
      setReasonAnswer("");
      setPhase("why");
      setError(t.composer.offline);
    } finally {
      setBusy(false);
    }
  }

  function answerWhy(purpose: string | null, kind?: "functional" | "emotional") {
    if (!followup) return;
    const interp: Interpretation = {
      ...followup.interp,
      purpose: purpose ?? followup.interp.purpose,
      hasReason: !!purpose,
      reasonType: kind ?? followup.interp.reasonType ?? "mixed",
    };
    const note = purpose ? `${followup.text} — ${purpose}` : followup.text;
    setFollowup(null);
    commit(note, interp);
  }

  function chooseWait(days: Wait) {
    if (!saved) return;
    setWaitDays(days);
    onWaitDays(saved.id, days);
  }

  function finish() {
    setPhase("done");
    if (waitDays === 0 && saved) onOpen(saved.id);
  }

  function answer(state: LinkState) {
    if (!result?.related) return;
    onDecide(result.id, result.related.intention.id, state);
    setResult({ ...result, answer: state });
  }

  function undo() {
    const id = result?.id ?? saved?.id;
    if (id) onUndo(id);
    setResult(null);
    setSaved(null);
    setFollowup(null);
    setPhase("input");
  }

  const remembered = new Set(memory.intentions.map((i) => i.rawText));
  const examples = memory.intentions.length < 2 ? t.composer.examples.filter((e) => !remembered.has(e)).slice(0, 1) : [];
  const subject = cap(result?.interp.subject ?? followup?.interp.subject ?? "");
  const card = "mt-6 rounded-3xl border border-line bg-white p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04),0_8px_24px_-12px_rgb(15_23_42/0.08)] sm:p-6";

  return (
    <section aria-labelledby="ask">
      <h1 id="ask" className="font-display text-[2.5rem] leading-[1.05] tracking-tight text-fg sm:text-6xl">
        {t.hero.title}
      </h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-dim">{t.hero.sub}</p>

      {/* One door, two ways in: write it yourself, or let your AI assistant propose it. */}
      <div role="tablist" className="mt-8 inline-flex rounded-full bg-slate-100 p-1 text-sm font-medium">
        <button role="tab" aria-selected={mode === "me"} type="button" onClick={() => setMode("me")} className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 transition-colors ${mode === "me" ? "bg-white text-fg shadow-sm" : "text-slate-500 hover:text-fg"}`}>
          <PenLine size={14} aria-hidden /> {t.story.me}
        </button>
        <button role="tab" aria-selected={mode === "agent"} type="button" onClick={() => setMode("agent")} className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 transition-colors ${mode === "agent" ? "bg-white text-violet-800 shadow-sm" : "text-slate-500 hover:text-fg"}`}>
          <Bot size={14} aria-hidden /> {t.story.agent}
        </button>
      </div>

      {mode === "agent" ? (
        <div className="mt-4">{agentSlot}</div>
      ) : (
        <>
          {/* Step 1 — what you want */}
          {(phase === "input" || phase === "done") && (
            <div className={card + " !p-2"}>
              <div className="px-3 pt-3"><StoryDots phase="input" /></div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && remember()}
                disabled={busy}
                rows={2}
                maxLength={1000}
                aria-label={t.hero.title}
                placeholder={t.composer.placeholder}
                className="block w-full resize-none bg-transparent px-4 pt-1 text-xl leading-relaxed text-fg placeholder:text-slate-400 disabled:opacity-50"
              />
              <div className="flex items-center justify-between gap-3 px-2 pb-1 pt-2">
                <kbd className="hidden pl-2 font-sans text-xs text-slate-400 sm:block">{t.composer.hint}</kbd>
                <button
                  type="button"
                  onClick={remember}
                  disabled={busy || text.trim().length < 3}
                  className="ml-auto inline-flex items-center gap-2 rounded-full bg-fg py-2.5 pl-4 pr-5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-25"
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={15} />}
                  <span>{busy ? t.composer.reading : t.composer.remember}</span>
                </button>
              </div>
            </div>
          )}

          {/* Step 2 — why (only when the note didn't say) */}
          {phase === "why" && followup && (
            <div className={card + " rise"}>
              <StoryDots phase="why" />
              <h2 className="font-display text-3xl leading-tight tracking-tight text-fg">{t.story.whyTitle((followup.interp.subject || "").toLocaleLowerCase())}</h2>
              <div className="mt-5 grid grid-cols-2 gap-2">
                {WHY_CHIPS.map(({ key, emoji, kind }) => (
                  <button key={key} type="button" onClick={() => answerWhy(t.story.chips[key], kind)} className="flex items-center gap-2 rounded-2xl border border-line bg-white px-4 py-4 text-left text-[15px] font-medium text-fg transition-colors hover:border-fg hover:bg-slate-50">
                    <span aria-hidden className="text-xl">{emoji}</span> {t.story.chips[key]}
                  </button>
                ))}
              </div>
              <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (reasonAnswer.trim()) answerWhy(reasonAnswer.trim()); }}>
                <input value={reasonAnswer} onChange={(e) => setReasonAnswer(e.target.value)} aria-label={t.story.orWrite} placeholder={t.story.orWrite} className="min-w-0 flex-1 rounded-full border border-line px-4 py-2.5 text-sm" />
                <button type="submit" disabled={!reasonAnswer.trim()} className="rounded-full bg-fg px-4 py-2.5 text-sm text-white disabled:opacity-25"><ArrowUp size={15} /></button>
              </form>
              <div className="mt-3 flex justify-between text-xs text-dim">
                <button type="button" onClick={() => answerWhy(null)} className="underline">{t.story.skip}</button>
                <button type="button" onClick={undo} className="underline">{t.composer.undo}</button>
              </div>
            </div>
          )}

          {/* Step 3 — the pause */}
          {phase === "pause" && saved && (
            <div className={card + " rise"}>
              <StoryDots phase="pause" />
              <p className="text-sm text-dim">
                <span className="font-semibold text-fg">{subject}</span>
                {result?.interp.purpose && <span> · “{result.interp.purpose}”</span>}
              </p>
              <div className="mt-5 flex items-center gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"><Hourglass size={26} aria-hidden /></span>
                <div>
                  <h2 className="font-display text-3xl leading-tight tracking-tight text-fg">{t.story.pauseTitle}</h2>
                  <p className="mt-1 text-sm text-amber-800">{t.story.suggest(suggested)}</p>
                </div>
              </div>
              {scan && <div className="rise mt-4"><PriceScanNote scan={scan} estimate={result?.interp.budget?.amount ?? null} budget={budget} spent={spent} /></div>}
              <div className="mt-5 grid grid-cols-4 gap-2">
                {([1, 3, 7, 0] as const).map((days) => (
                  <button key={days} type="button" onClick={() => chooseWait(days)} aria-pressed={waitDays === days} className={`rounded-2xl border py-3 text-sm font-semibold transition-colors ${waitDays === days ? "border-amber-500 bg-amber-50 text-amber-900" : "border-line bg-white text-dim hover:border-slate-300"}`}>
                    {days === 0 ? t.wait.none : t.wait.day(days)}
                    {days === suggested && <span aria-hidden className="ml-1">★</span>}
                  </button>
                ))}
              </div>
              <button type="button" onClick={finish} className={`mt-5 w-full rounded-2xl py-4 text-base font-semibold text-white transition-colors ${waitDays === 0 ? "bg-[#0070BA] hover:bg-[#005EA6]" : "bg-fg hover:bg-slate-800"}`}>
                {waitDays === 0 ? t.story.doneNow : `${t.story.done} · ${t.wait.day(waitDays)} ⏳`}
              </button>
              <div className="mt-3 text-right text-xs text-dim">
                <button type="button" onClick={undo} className="underline">{t.composer.undo}</button>
              </div>
            </div>
          )}

          {/* The end of the story: it's resting */}
          {phase === "done" && saved && (
            <div className="rise mt-4 flex items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <Hourglass size={16} aria-hidden className="shrink-0" />
              <span className="min-w-0 flex-1">{waitDays === 0 ? t.story.readyNow(subject) : t.story.resting(subject)}</span>
              <button type="button" onClick={() => onOpen(saved.id)} className="font-medium underline">{t.composer.open}</button>
              <button type="button" onClick={undo} className="underline">{t.composer.undo}</button>
              <button type="button" onClick={() => { setPhase("input"); setSaved(null); setResult(null); }} aria-label={t.detail.close} className="rounded-full p-1 hover:bg-amber-100"><X size={14} /></button>
            </div>
          )}

          {examples.length > 0 && phase === "input" && !busy && !text && (
            <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-2 pl-1 text-sm">
              <span className="text-slate-400">{t.composer.tryLabel}</span>
              {examples.map((e) => (
                <button key={e} type="button" onClick={() => setText(e)} className="text-left text-slate-600 underline decoration-slate-300 underline-offset-4 transition-colors hover:text-fg hover:decoration-fg">
                  “{e}”
                </button>
              ))}
            </div>
          )}

          {error && (
            <p role="alert" className="mt-4 pl-1 text-sm text-amber-800">
              {error}
            </p>
          )}

          {result?.related && (
            <div className="rise mt-6 rounded-3xl bg-stone-50 p-6 ring-1 ring-stone-200/70 sm:p-10">
              <Recall current={result.interp} related={result.related} answer={result.answer} onAnswer={answer} onSaveReflection={(note) => onSaveReflection(result.id, note)} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
