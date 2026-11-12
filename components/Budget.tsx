"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { now } from "@/lib/clock";
import type { Budget } from "@/lib/budget";
import type { PriceScan } from "@/lib/types";
import { Search } from "lucide-react";
import { money } from "./ui";

const monthName = (lang: string) => {
  const m = new Intl.DateTimeFormat(lang, { month: "long" }).format(now());
  return m.charAt(0).toUpperCase() + m.slice(1);
};

function AmountForm({ initial, label, onSave, cta }: { initial?: number; label: string; onSave: (n: number) => void; cta: string }) {
  const [value, setValue] = useState(initial ? String(initial) : "");
  const n = Number(value.replace(/[^\d.]/g, ""));
  return (
    <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (n > 0) onSave(n); }}>
      <span className="relative min-w-0 flex-1">
        <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-dim">$</span>
        <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} aria-label={label} placeholder="0" className="w-full rounded-full border border-line bg-white py-2.5 pl-8 pr-4 text-base tabular-nums" />
      </span>
      <button type="submit" disabled={!(n > 0)} className="rounded-full bg-fg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-25">{cta}</button>
    </form>
  );
}

/** Home: the month's envelope. Asked once, then shown as a bar. */
export function BudgetCard({ budget, spent, onSave }: { budget: Budget | null; spent: number; onSave: (b: Budget | null) => void }) {
  const { t, lang } = useI18n();
  const [editing, setEditing] = useState(false);
  if (!budget || editing) {
    return (
      <div className="rounded-3xl border border-line bg-white p-5">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-fg"><Wallet size={18} aria-hidden className="text-emerald-700" /> {t.budget.ask}</p>
        <AmountForm initial={budget?.amount} label={t.budget.ask} cta={t.budget.save} onSave={(n) => { onSave({ amount: n, currency: budget?.currency ?? "USD" }); setEditing(false); }} />
      </div>
    );
  }
  const pct = Math.min(100, (spent / budget.amount) * 100);
  return (
    <div className="rounded-3xl border border-line bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-dim"><Wallet size={16} aria-hidden className="text-emerald-700" /> {t.budget.spent(monthName(lang), money(spent, budget.currency, lang), money(budget.amount, budget.currency, lang))}</p>
        <button type="button" onClick={() => setEditing(true)} className="text-xs text-dim underline">{t.budget.edit}</button>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-emerald-100" aria-hidden>
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm font-semibold text-fg">{t.budget.left(money(Math.max(0, budget.amount - spent), budget.currency, lang))}</p>
    </div>
  );
}

/** Detail: how much of what's left this purchase would take. Neutral, never a verdict. */
export function BudgetImpact({ price, budget, spent }: { price: { amount: number; currency: string }; budget: Budget | null; spent: number }) {
  const { t, lang } = useI18n();
  if (!budget) return <p className="text-sm text-dim">💰 {t.budget.none}</p>;
  const left = Math.max(0, budget.amount - spent);
  const over = price.amount - left;
  const pct = left > 0 ? Math.round((price.amount / left) * 100) : 100;
  const spentPct = Math.min(100, (spent / budget.amount) * 100);
  const itemPct = Math.min(100 - spentPct, (price.amount / budget.amount) * 100);
  return (
    <div className="rounded-2xl bg-stone-50 p-4">
      <div className="flex h-3 overflow-hidden rounded-full bg-emerald-100" aria-hidden>
        <div className="h-full bg-slate-400" style={{ width: `${spentPct}%` }} />
        <div className={`h-full ${over > 0 ? "bg-amber-500" : "bg-[#0070BA]"}`} style={{ width: `${itemPct}%` }} />
      </div>
      <p className="mt-3 text-sm text-fg">
        {over > 0 ? <span className="font-semibold text-amber-800">{t.budget.over(money(over, price.currency, lang))}</span> : <span className="font-semibold">{t.budget.uses(money(price.amount, price.currency, lang), pct)}</span>}
        <span className="text-dim"> {t.budget.left(money(left, budget.currency, lang))}</span>
      </p>
    </div>
  );
}

/** Detail: when nothing has a price yet, ask for one instead of sending people to "add an option". */
export function PriceAsk({ onSave }: { onSave: (n: number) => void }) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-line p-4">
      <p className="text-[15px] font-semibold text-fg">{t.story.approxPrice}</p>
      <AmountForm label={t.budget.priceAsk} cta={t.budget.save} onSave={onSave} />
    </div>
  );
}

/** Real store prices next to the person's own estimate and budget. Source always visible. */
export function PriceScanNote({ scan, estimate, budget, spent }: { scan: PriceScan; estimate?: number | null; budget: Budget | null; spent: number }) {
  const { t, lang } = useI18n();
  const m = (n: number) => money(n, scan.currency, lang);
  const left = budget ? Math.max(0, budget.amount - spent) : null;
  const tooLow = typeof estimate === "number" && estimate > 0 && estimate < scan.low * 0.6;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-fg">
        <Search size={15} aria-hidden className="text-[#0070BA]" /> {t.scan.range(m(scan.low), m(scan.high))}
        <span className="font-normal text-dim">· {t.scan.typical(m(scan.typical))}</span>
      </p>
      {tooLow && <p className="mt-2 text-sm text-amber-900">{t.scan.low(m(estimate as number))}</p>}
      {!estimate && left !== null && (
        <p className="mt-2 text-sm text-fg">{scan.typical > left ? t.scan.over(m(scan.typical - left)) : t.scan.share(left > 0 ? Math.round((scan.typical / left) * 100) : 100)}</p>
      )}
      <p className="mt-2 text-[11px] text-slate-500">{t.scan.source(scan.count)}</p>
    </div>
  );
}
