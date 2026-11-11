import type { ButtonHTMLAttributes, ReactNode } from "react";
import { X } from "lucide-react";
import { now } from "@/lib/clock";

export const label = (tag: string) => tag.replace(/-/g, " ");

/** "laptop" -> "Laptop" (subjects come back lower-case from the model). */
export const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function fmtDate(iso: string, lang?: string) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === now().getFullYear();
  return d.toLocaleDateString(lang, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

export function fmtDateTime(iso: string, lang?: string) {
  return new Date(iso).toLocaleString(lang, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "today", "3 days ago", "hace 2 semanas". Falls back to a date after a couple of months. */
export function relDate(iso: string, lang: string) {
  const days = Math.round((now().getTime() - new Date(iso).getTime()) / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  if (days < 1) return rtf.format(0, "day");
  if (days < 7) return rtf.format(-days, "day");
  if (days < 60) return rtf.format(-Math.round(days / 7), "week");
  return fmtDate(iso, lang);
}

export function money(amount: number, currency: string, lang: string) {
  try {
    return new Intl.NumberFormat(lang, { style: "currency", currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString(lang)}`;
  }
}

const TONES = {
  dim: "border-slate-200 bg-slate-50 text-slate-700",
  mint: "border-emerald-200 bg-emerald-50 text-emerald-800 font-medium",
  amber: "border-amber-200 bg-amber-50 text-amber-800 font-medium",
};

/** Small machine-voice tag. Kept for settings; the main experience no longer shows tags. */
export function Chip({ children, tone = "dim", onRemove }: { children: ReactNode; tone?: keyof typeof TONES; onRemove?: () => void }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 font-mono text-[11px] font-medium transition-colors ${TONES[tone]}`}>
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label="Remove" className="opacity-60 transition-opacity hover:opacity-100 hover:text-slate-900">
          <X size={11} />
        </button>
      )}
    </span>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">{children}</div>;
}

const STATUS_DOT = {
  active: "bg-emerald-500",
  reconsidering: "bg-amber-500",
  archived: "bg-slate-300",
  purchased: "bg-slate-900",
  waiting: "bg-amber-500",
  ready: "bg-emerald-600",
  bought: "bg-slate-900",
  let_go: "bg-slate-300",
} as const;

/** A dot and a word. Status is the only state the list needs to show. */
export function StatusMark({ status, children }: { status: keyof typeof STATUS_DOT; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-dim">
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {children}
    </span>
  );
}

const BTN = {
  primary: "bg-fg text-white hover:bg-slate-800 active:bg-black disabled:opacity-30 disabled:hover:bg-fg",
  ghost: "border border-line bg-white text-slate-700 hover:border-slate-300 hover:text-fg active:bg-slate-50",
  quiet: "text-dim hover:text-fg hover:bg-slate-100/70",
  on: "border border-emerald-300 bg-emerald-50 text-emerald-800",
};

export function Btn({ variant = "ghost", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BTN }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${BTN[variant]} ${className}`}
    />
  );
}

/** The user's text with evidence quotes marked. */
export function Highlighted({ text, quotes }: { text: string; quotes: string[] }) {
  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];
  for (const q of quotes) {
    const start = lower.indexOf(q.toLowerCase());
    if (start >= 0) ranges.push([start, start + q.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const [s, e] of ranges) {
    if (s < cursor) continue;
    parts.push(text.slice(cursor, s), <mark key={s}>{text.slice(s, e)}</mark>);
    cursor = e;
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}
