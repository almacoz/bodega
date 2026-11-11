"use client";

import { Check, CircleCheck, Hourglass, PenLine } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { now } from "@/lib/clock";
import type { Intention } from "@/lib/types";

/** Where this one thing is in its story: Want it → Sleep on it → Decide. */
export function DetailStory({ i }: { i: Intention }) {
  const { t } = useI18n();
  const decided = i.status === "bought" || i.status === "purchased" || i.status === "let_go" || i.status === "archived";
  const stage = decided ? 3 : i.status === "ready" ? 2 : 1;
  const day = Math.min(Math.max(1, Math.floor((now().getTime() - Date.parse(i.createdAt)) / 86_400_000) + 1), Math.max(1, i.waitDays));
  const steps = [
    { icon: PenLine, title: t.flow.want, sub: t.story.done1 },
    { icon: Hourglass, title: t.flow.rest, sub: i.waitDays === 0 ? t.wait.none : t.wait.waiting(day, i.waitDays) },
    { icon: CircleCheck, title: t.flow.decide, sub: i.status === "let_go" || i.status === "archived" ? t.list.status.let_go : i.status === "bought" || i.status === "purchased" ? t.list.status.bought : t.flow.decideSub },
  ];
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Progress">
      {steps.map(({ icon: Icon, title, sub }, n) => {
        const done = n < stage;
        const active = n === stage;
        const tone = active ? (n === 2 ? "bg-[#0070BA] text-white" : "bg-amber-400 text-fg") : done ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-400";
        return (
          <li key={title} className="flex flex-col items-center text-center">
            <span className={`flex h-10 w-10 items-center justify-center rounded-full ${tone}`}>{done ? <Check size={18} aria-hidden /> : <Icon size={18} aria-hidden />}</span>
            <span className={`mt-2 text-sm font-semibold ${active ? "text-fg" : done ? "text-emerald-800" : "text-slate-400"}`}>{title}</span>
            <span className="text-xs text-slate-500">{sub}</span>
            {n === 1 && i.waitDays > 0 && (
              <span className="mt-1 flex gap-1" aria-hidden>
                {Array.from({ length: i.waitDays }, (_, d) => {
                  const c = i.checkins?.[d];
                  return <span key={d} className={`h-2 w-2 rounded-full ${c ? (c.stillWant ? "bg-emerald-600" : "bg-rose-500") : "bg-slate-200"}`} />;
                })}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
