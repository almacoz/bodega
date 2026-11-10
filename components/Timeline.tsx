"use client";

import type { Action, LinkState, Memory } from "@/lib/types";
import { IntentionDetail } from "./IntentionDetail";
import { Chip, fmtDate, label } from "./ui";

const BEAD = { active: "bg-mint", reconsidering: "bg-amber", archived: "bg-dim/50", purchased: "bg-mint" } as const;

/** Newest first. A luminous thread runs through every bead; the thread is time. */
export function Timeline({
  memory,
  selectedId,
  newestId,
  onSelect,
  onAction,
  onDecide,
}: {
  memory: Memory;
  selectedId: string | null;
  newestId: string | null;
  onSelect: (id: string | null) => void;
  onAction: (id: string, action: Action, note?: string, paypalOrderId?: string) => void;
  onDecide: (aId: string, bId: string, state: LinkState) => void;
}) {
  const items = [...memory.intentions].reverse();

  if (!items.length) {
    return <p className="mt-24 max-w-sm font-serif text-xl italic text-dim">Nothing remembered yet. Say what you want, and why. BODEGA will keep it for you.</p>;
  }

  return (
    <section className="mt-24" aria-label="Memory timeline">
      <ol>
        {items.map((i, idx) => {
          const open = i.id === selectedId;
          const last = idx === items.length - 1;
          return (
            <li key={i.id} className="grid grid-cols-[4.25rem_1.5rem_1fr] gap-x-3 pb-10">
              <time dateTime={i.createdAt} className="pt-2 text-right font-mono text-[11px] text-dim">{fmtDate(i.createdAt)}</time>
              <div className="relative">
                {!last && <span aria-hidden className="absolute -bottom-10 left-1/2 top-4 w-px bg-gradient-to-b from-mint/50 via-mint/15 to-line" />}
                <span
                  aria-hidden
                  className={`absolute left-1/2 top-2.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full ${BEAD[i.status]} ${open ? "ring-4 ring-white/10" : ""} ${i.id === newestId ? "bead-new" : ""}`}
                />
              </div>
              <div className="min-w-0">
                <button onClick={() => onSelect(open ? null : i.id)} aria-expanded={open} className="block w-full text-left">
                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className={`font-serif text-3xl italic leading-tight ${i.status === "archived" ? "text-dim" : ""}`}>{i.interpretation.subject}</span>
                    {i.status !== "active" && (
                      <Chip tone={i.status === "reconsidering" ? "amber" : i.status === "purchased" ? "mint" : "dim"}>{i.status}</Chip>
                    )}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {i.interpretation.needs.map((n) => (
                      <span key={n} className="font-mono text-[11px] text-dim">{label(n)}</span>
                    ))}
                  </span>
                </button>
                {open && <IntentionDetail intention={i} memory={memory} onAction={onAction} onDecide={onDecide} />}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
