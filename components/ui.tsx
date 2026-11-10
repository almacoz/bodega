import type { ButtonHTMLAttributes, ReactNode } from "react";
import { X } from "lucide-react";

export const label = (tag: string) => tag.replace(/-/g, " ");

export function fmtDate(iso: string) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const TONES = {
  dim: "border-line text-dim",
  mint: "border-mint/30 bg-mint/5 text-mint",
  amber: "border-amber/30 bg-amber/5 text-amber",
};

/** Machine-voice tag: needs, categories, signal kinds. */
export function Chip({ children, tone = "dim", onRemove }: { children: ReactNode; tone?: keyof typeof TONES; onRemove?: () => void }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${TONES[tone]}`}>
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label="Remove" className="opacity-60 transition-opacity hover:opacity-100">
          <X size={11} />
        </button>
      )}
    </span>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-xs text-dim">{children}</div>;
}

const BTN = {
  primary: "bg-mint text-void hover:bg-mint/85 disabled:opacity-40",
  ghost: "border border-line text-dim hover:border-white/20 hover:text-fg",
  on: "border border-mint/40 bg-mint/10 text-mint",
};

export function Btn({ variant = "ghost", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BTN }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${BTN[variant]} ${className}`}
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
