"use client";

import { Link2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { Intention, Memory } from "@/lib/types";
import { cap, relDate, StatusMark } from "./ui";
import { now } from "@/lib/clock";

const DAY = 86_400_000;

/** Wait progress 0..1 and whole days left. */
function waitProgress(i: Intention) {
  const total = Math.max(1, (i.waitDays ?? 0) * DAY);
  const start = Date.parse(i.createdAt);
  const end = i.waitUntil ? Date.parse(i.waitUntil) : start;
  const t = now().getTime();
  return { pct: Math.min(1, Math.max(0, (t - start) / total)), daysLeft: Math.ceil((end - t) / DAY) };
}

/** Subjects of intentions the person confirmed as the same need. */
function confirmedWith(i: Intention, memory: Memory): string[] {
  return Object.entries(memory.links)
    .filter(([k, s]) => s === "confirmed" && k.split("~").includes(i.id))
    .map(([k]) => k.split("~").find((x) => x !== i.id))
    .map((id) => memory.intentions.find((x) => x.id === id)?.interpretation.subject)
    .filter((s): s is string => !!s);
}

function Row({ i, memory, isNew, onSelect }: { i: Intention; memory: Memory; isNew: boolean; onSelect: (id: string) => void }) {
  const { lang, t } = useI18n();
  const linked = process.env.NEXT_PUBLIC_RECALL_ENABLED === "true" ? confirmedWith(i, memory) : [];
  const chosen = i.products?.find((p) => p.id === i.selectedProductId);
  const options = i.products?.length ?? 0;
  const faded = i.status === "archived" || i.status === "let_go";

  return (
    <li className={isNew ? "row-new" : ""}>
      <button
        type="button"
        onClick={() => onSelect(i.id)}
        className="group grid w-full grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1 border-t border-line py-5 text-left transition-colors sm:py-6"
      >
        <span className={`font-display text-2xl leading-tight tracking-tight transition-colors group-hover:text-emerald-800 ${faded ? "text-slate-400" : "text-fg"}`}>
          {cap(i.interpretation.subject)}
        </span>
        <time dateTime={i.createdAt} className="text-xs tabular-nums text-slate-400">
          {relDate(i.createdAt, lang)}
        </time>
        <span className={`line-clamp-1 text-[15px] ${faded ? "text-slate-400" : "text-dim"}`}>
          {i.interpretation.purpose ?? i.rawText}
        </span>
        <span className="row-span-2 self-center justify-self-end">
          {i.status === "ready" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#0070BA] px-4 py-2 text-sm font-semibold text-white group-hover:bg-[#005EA6]">{t.list.decideCta} →</span>
          ) : i.status === "waiting" ? null : (
            i.status !== "active" && <StatusMark status={i.status}>{t.list.status[i.status]}</StatusMark>
          )}
        </span>
        {i.status === "waiting" && (() => {
          const { pct, daysLeft } = waitProgress(i);
          return (
            <span className="col-span-1 flex items-center gap-3 pt-1">
              <span className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                <span className="block h-full rounded-full bg-amber-400 transition-all" style={{ width: `${Math.max(6, pct * 100)}%` }} />
              </span>
              <span className="text-xs font-medium text-amber-700">{t.list.readyIn(daysLeft)}</span>
            </span>
          );
        })()}
        {(linked.length > 0 || options > 0) && (
          <span className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-slate-500">
            {linked.length > 0 && (
              <span className="inline-flex items-center gap-1 text-emerald-800">
                <Link2 size={12} /> {t.list.linked(linked.join(", "))}
              </span>
            )}
            {chosen ? <span>→ {chosen.name}</span> : options > 0 && <span>{t.list.options(options)}</span>}
          </span>
        )}
      </button>
    </li>
  );
}

/** What the person is considering, newest first. Decided things step back. */
export function Timeline({
  memory,
  newestId,
  onSelect,
}: {
  memory: Memory;
  newestId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();
  const newestFirst = [...memory.intentions].reverse();
  const ready = newestFirst.filter((i) => i.status === "ready");
  const open = newestFirst.filter((i) => ["active", "reconsidering", "waiting"].includes(i.status));
  const decided = newestFirst.filter((i) => ["purchased", "archived", "bought", "let_go"].includes(i.status));

  if (!newestFirst.length) {
    return <p className="mt-24 border-t border-line pt-6 text-[15px] text-slate-400">{t.list.empty}</p>;
  }

  return (
    <div className="mt-8 space-y-12">
      {ready.length > 0 && (
        <section aria-labelledby="ready">
          <h2 id="ready" className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#003087]">
            {t.list.ready} <span className="ml-1 tabular-nums">{ready.length}</span>
          </h2>
          <ul className="border-b border-line">
            {ready.map((i) => (
              <Row key={i.id} i={i} memory={memory} isNew={i.id === newestId} onSelect={onSelect} />
            ))}
          </ul>
        </section>
      )}

      {open.length > 0 && (
        <section aria-labelledby="resting">
          <h2 id="resting" className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">
            {t.list.resting} <span className="ml-1 tabular-nums text-slate-400">{open.length}</span>
          </h2>
          <ul className="border-b border-line">
            {open.map((i) => (
              <Row key={i.id} i={i} memory={memory} isNew={i.id === newestId} onSelect={onSelect} />
            ))}
          </ul>
        </section>
      )}

      {decided.length > 0 && (
        <details className="group/decided" open={open.length === 0}>
          <summary className="mb-2 flex cursor-pointer list-none items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-dim hover:text-fg">
            <span aria-hidden className="transition-transform group-open/decided:rotate-90">›</span>
            {t.list.decided} <span className="tabular-nums text-slate-400">{decided.length}</span>
          </summary>
          <ul className="border-b border-line">
            {decided.map((i) => (
              <Row key={i.id} i={i} memory={memory} isNew={i.id === newestId} onSelect={onSelect} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
