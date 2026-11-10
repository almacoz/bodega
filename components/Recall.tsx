"use client";

import { Check } from "lucide-react";
import { reflectionPrompt } from "@/lib/link";
import type { Interpretation, LinkState, Related } from "@/lib/types";
import { Btn, Chip, fmtDate, Label, label } from "./ui";

/** Earlier intentions that may serve the same need. Asks a question; never recommends. */
export function Recall({
  current,
  related,
  onDecide,
}: {
  current: Interpretation;
  related: Related[];
  onDecide: (otherId: string, state: LinkState) => void;
}) {
  if (!related.length) return null;
  return (
    <section className="rise">
      <Label>You’ve been here before</Label>
      <ul className="space-y-7">
        {related.map((r) => {
          const prev = r.intention;
          return (
            <li key={prev.id} className="border-l border-mint/40 pl-5">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-serif text-2xl italic">{prev.interpretation.subject}</span>
                <span className="font-mono text-[11px] text-dim">
                  {fmtDate(prev.createdAt)}
                  {prev.status !== "active" && `, ${prev.status}`}
                </span>
              </div>
              <p className="mt-1 font-serif text-lg italic leading-snug text-dim">“{prev.rawText}”</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {r.sharedNeeds.map((n) => (
                  <Chip key={n} tone="mint">{label(n)}</Chip>
                ))}
                {r.sameCategory && <Chip>same kind: {label(prev.interpretation.category)}</Chip>}
              </div>
              <p className="mt-4 max-w-prose font-serif text-lg italic leading-relaxed">{reflectionPrompt(current, r)}</p>
              <div className="mt-4 flex gap-2">
                <Btn variant={r.decision === "confirmed" ? "on" : "ghost"} aria-pressed={r.decision === "confirmed"} onClick={() => onDecide(prev.id, "confirmed")}>
                  {r.decision === "confirmed" && <Check size={14} />}Same underlying need
                </Btn>
                <Btn variant={r.decision === "dismissed" ? "on" : "ghost"} aria-pressed={r.decision === "dismissed"} onClick={() => onDecide(prev.id, "dismissed")}>
                  {r.decision === "dismissed" && <Check size={14} />}Not related
                </Btn>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
