"use client";

import { FormEvent, useState } from "react";
import { Bot, X } from "lucide-react";
import type { Intention } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { cap } from "@/components/ui";

type ChatLine = { role: "user" | "assistant"; content: string };

export function Assistant({ onProposal, onOpen, embedded = false }: { onProposal: (intention: Intention) => void; onOpen: (id: string) => void; embedded?: boolean }) {
  const { t, lang } = useI18n();
  const [messages, setMessages] = useState<ChatLine[]>([]);
  const [proposals, setProposals] = useState<Intention[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(embedded);

  async function send(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next, language: lang }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t.assistant.error);
      setMessages([...next, { role: "assistant", content: data.text }]);
      for (const proposal of data.proposals ?? []) {
        onProposal(proposal);
        setProposals((current) => [...current, proposal]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The assistant could not respond.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mb-10 mt-4 flex w-full items-center gap-3 rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-left transition-colors hover:border-slate-400 hover:bg-slate-50">
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-violet-700"><Bot size={18} aria-hidden /></span>
    <span className="flex flex-col"><span className="text-sm font-semibold text-fg">{t.assistant.cta}</span><span className="text-xs text-slate-500">{t.assistant.hint}</span></span>
  </button>;

  return <section className={`${embedded ? "" : "mb-10 mt-4"} rounded-3xl border border-violet-200 bg-violet-50/30 p-4 sm:p-5`} aria-label={t.assistant.title}>
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-violet-700"><Bot size={15} aria-hidden /></span>{t.assistant.title}<span className="font-normal text-slate-500">· {t.assistant.hint}</span></h2>
      {!embedded && <button type="button" onClick={() => setOpen(false)} aria-label={t.assistant.close} className="rounded-full p-1.5 text-dim hover:bg-slate-100"><X size={15} /></button>}
    </div>
    <div className="mt-4 space-y-3">
      {messages.map((line, index) => <p key={index} className={`rounded-2xl px-4 py-3 text-sm ${line.role === "user" ? "ml-8 bg-stone-100 text-fg" : "mr-8 bg-emerald-50 text-fg"}`}>{line.content}</p>)}
      {proposals.map((i) => <article key={i.id} className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm">
        <p className="font-semibold">{t.assistant.propose}</p>
        <p className="mt-1 font-display text-xl tracking-tight">{cap(i.interpretation.subject)} · {i.price?.currency} {i.price?.value}</p>
        <p className="mt-1 text-dim">{t.assistant.said} “{i.rawText}”</p>
        <div className="mt-2 flex items-center gap-3"><span className="text-xs text-dim">{t.assistant.waiting(i.waitDays)}</span><button type="button" className="text-xs font-medium underline" onClick={() => onOpen(i.id)}>{t.assistant.open}</button></div>
      </article>)}
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-amber-800">{error}</p>}
    <form onSubmit={send} className="mt-4 flex gap-2"><input value={input} onChange={(e) => setInput(e.target.value)} aria-label={t.assistant.message} className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2 text-sm" placeholder={t.assistant.placeholder}/><button disabled={busy || !input.trim()} className="rounded-full bg-fg px-4 py-2 text-sm text-white disabled:opacity-40">{busy ? t.assistant.thinking : t.assistant.send}</button></form>
  </section>;
}
