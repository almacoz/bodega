"use client";

import { ArrowRight, CircleCheck, Hourglass, PenLine } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/** Three steps, icons first. Counts show where the person's things are right now. */
export function Flow({ resting, ready }: { resting: number; ready: number }) {
  const { t } = useI18n();
  const steps = [
    { icon: PenLine, title: t.flow.want, sub: t.flow.wantSub, count: 0 },
    { icon: Hourglass, title: t.flow.rest, sub: t.flow.restSub, count: resting },
    { icon: CircleCheck, title: t.flow.decide, sub: t.flow.decideSub, count: ready },
  ];
  return (
    <ol className="mb-6 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-start gap-2" aria-label="How WhyBuy works">
      {steps.map(({ icon: Icon, title, sub, count }, n) => (
        <li key={title} className="contents">
          {n > 0 && <ArrowRight aria-hidden size={14} className="mt-3 text-slate-300" />}
          <div className="flex flex-col items-center text-center">
            <span className={`relative flex h-10 w-10 items-center justify-center rounded-full ${n === 2 ? (count > 0 ? "bg-[#0070BA] text-white" : "bg-[#0070BA]/10 text-[#0070BA]") : n === 1 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
              <Icon size={18} aria-hidden />
              {count > 0 && <span className={`absolute -right-1 -top-1 min-w-[18px] rounded-full px-1 text-[11px] font-semibold leading-[18px] tabular-nums ${n === 2 ? "bg-fg text-white" : "bg-amber-400 text-fg"}`}>{count}</span>}
            </span>
            <span className="mt-2 text-sm font-semibold text-fg">{title}</span>
            <span className="text-xs text-slate-500">{sub}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
