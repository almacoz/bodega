"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { reflectionPrompt } from "@/lib/link";
import type { Interpretation, LinkState, Related } from "@/lib/types";
import { relDate } from "./ui";

/**
 * The one observation worth interrupting for: an earlier intention that may
 * solve the same problem. It asks; it never recommends.
 */
export function Recall({
  current,
  related,
  answer,
  onAnswer,
  compact = false,
  onSaveReflection,
}: {
  current: Interpretation;
  related: Related;
  answer: LinkState | null;
  onAnswer: (state: LinkState) => void;
  compact?: boolean;
  onSaveReflection?: (text: string) => void;
}) {
  const { lang, t } = useI18n();
  const prev = related.intention;
  const subject = prev.interpretation.subject;
  const [reflection, setReflection] = useState("");
  const [finished, setFinished] = useState(false);

  const headline = related.sameSubject
    ? t.recall.askSame(subject)
    : prev.status === "purchased"
      ? t.recall.askPurchased(subject)
      : prev.status === "archived"
        ? t.recall.askArchived(subject)
        : t.recall.askActive(subject);

  const choices: [LinkState, string][] = [
    ["confirmed", t.recall.yes],
    ["dismissed", t.recall.no],
    ["unsure", t.recall.unsure],
  ];

  return (
    <section aria-live="polite" className={compact ? "" : "rise"}>
      {!compact && (
        <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
          {t.recall.eyebrow}
        </p>
      )}

      <h2 className={`font-display tracking-tight text-fg ${compact ? "text-xl leading-snug" : "text-3xl leading-[1.15] sm:text-[2.5rem]"}`}>
        {headline}
      </h2>

      <figure className={`border-l-2 border-emerald-600/70 pl-5 ${compact ? "mt-4" : "mt-6"}`}>
        <blockquote className={`text-slate-700 ${compact ? "text-[15px] leading-relaxed" : "text-lg leading-relaxed"}`}>
          “{prev.rawText}”
        </blockquote>
        <figcaption className="mt-2 text-xs text-dim">
          {relDate(prev.createdAt, lang)}
          {prev.status !== "active" && ` · ${t.list.status[prev.status]}`}
        </figcaption>
      </figure>

      {answer === null || (compact && answer === "unsure") ? (
        <div className={compact ? "mt-5" : "mt-8"}>
          <p className={`font-medium text-fg ${compact ? "text-sm" : "text-base"}`}>{t.recall.question}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {choices.map(([state, text]) => (
              <button
                key={state}
                type="button"
                onClick={() => onAnswer(state)}
                aria-pressed={answer === state}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  state === "confirmed"
                    ? "border-fg bg-fg text-white hover:bg-slate-800"
                    : answer === state
                      ? "border-slate-300 bg-slate-100 text-fg"
                      : "border-line bg-white text-slate-700 hover:border-slate-300 hover:text-fg"
                }`}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className={`rise ${compact ? "mt-4" : "mt-7"} text-[15px] leading-relaxed text-slate-700`}>
          {answer === "confirmed" ? (
            <>
              <p className="flex items-center gap-1.5 font-medium text-emerald-800">
                <Check size={15} /> {t.recall.afterYes}
              </p>
              {!finished ? <div className="mt-3 space-y-2"><label className="sr-only" htmlFor="recall-reflection">{reflectionPrompt(current, related, lang)}</label><input id="recall-reflection" value={reflection} onChange={(e) => setReflection(e.target.value)} placeholder={reflectionPrompt(current, related, lang)} className="w-full rounded-full border border-line bg-white px-4 py-2 text-sm text-fg"/><div className="flex gap-2"><button type="button" onClick={() => { if (reflection.trim()) onSaveReflection?.(reflection.trim()); setFinished(true); }} className="rounded-full bg-fg px-4 py-2 text-sm text-white">Save</button><button type="button" onClick={() => setFinished(true)} className="rounded-full border border-line px-4 py-2 text-sm text-dim">Skip</button></div></div> : <p className="mt-2 text-sm text-dim">Saved. You can keep considering your item.</p>}
            </>
          ) : (
            <p>{answer === "dismissed" ? t.recall.afterNo : t.recall.afterUnsure}</p>
          )}
        </div>
      )}
    </section>
  );
}
