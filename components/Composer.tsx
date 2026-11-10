"use client";

import { useMemo, useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { findRelated } from "@/lib/link";
import { toTag } from "@/lib/normalize";
import type { Interpretation, LinkState, Memory } from "@/lib/types";
import { Recall } from "./Recall";
import { Btn, Chip, Highlighted, Label, label } from "./ui";

interface Draft {
  text: string;
  interp: Interpretation;
  decisions: Record<string, LinkState>; // otherId -> decision, applied on save
}

export function Composer({
  memory,
  onSave,
}: {
  memory: Memory;
  onSave: (text: string, interp: Interpretation, decisions: Record<string, LinkState>) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newNeed, setNewNeed] = useState("");

  // Recall runs on the draft, so editing needs updates what BODEGA remembers.
  const related = useMemo(
    () => (draft ? findRelated(draft.interp, memory).map((r) => ({ ...r, decision: draft.decisions[r.intention.id] ?? null })) : []),
    [draft, memory],
  );

  async function interpret() {
    if (busy || text.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const known = memory.intentions.map((i) => i.interpretation);
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          knownNeeds: [...new Set(known.flatMap((k) => k.needs))],
          knownCategories: [...new Set(known.map((k) => k.category))],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setDraft({ text: text.trim(), interp: data.interpretation, decisions: {} });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const patch = (p: Partial<Interpretation>) => setDraft((d) => d && { ...d, interp: { ...d.interp, ...p } });

  function save() {
    if (!draft) return;
    onSave(draft.text, draft.interp, draft.decisions);
    setDraft(null);
    setText("");
  }

  const i = draft?.interp;
  const details = i
    ? [
        i.utility.length ? ["Expected benefits", i.utility.join(", ")] : null,
        i.context ? ["Context", i.context] : null,
        i.timing ? ["Timing", i.timing] : null,
        i.budget ? ["Budget", `${i.budget.amount.toLocaleString()} ${i.budget.currency}`] : null,
      ].filter((d): d is string[] => !!d)
    : [];

  return (
    <section>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && interpret()}
        disabled={busy || !!draft}
        rows={3}
        aria-label="What do you want, and why?"
        placeholder="I want a laptop for development, mostly while commuting. Around $1500."
        className="w-full resize-none bg-transparent font-serif text-3xl italic leading-snug text-fg placeholder:text-dim/40 disabled:opacity-60 sm:text-4xl"
      />
      <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
        <span className="text-xs text-dim">English or español. Ctrl+Enter to remember.</span>
        {!draft && (
          <Btn variant="primary" onClick={interpret} disabled={busy || text.trim().length < 3}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={14} />}
            {busy ? "Reading" : "Remember"}
          </Btn>
        )}
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-amber">{error}</p>}

      {draft && i && (
        <div className="rise mt-12 space-y-9">
          <div>
            <Label>Here’s what I understood</Label>
            <p className="font-serif text-lg italic leading-relaxed text-dim">
              <Highlighted text={draft.text} quotes={i.signals.map((s) => s.quote)} />
            </p>
            <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <span className="font-serif text-4xl italic">{i.subject}</span>
              <Chip>{label(i.category)}</Chip>
            </div>
          </div>

          <div>
            <Label>Purpose</Label>
            <input
              value={i.purpose ?? ""}
              onChange={(e) => patch({ purpose: e.target.value || null })}
              placeholder="I couldn’t tell. What is it for?"
              className="w-full border-b border-line bg-transparent py-1.5 text-fg transition-colors placeholder:text-dim/60 focus:border-mint/50"
            />
          </div>

          <div>
            <Label>Underlying needs. These connect intentions.</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {i.needs.map((n) => (
                <Chip key={n} tone="mint" onRemove={() => patch({ needs: i.needs.filter((x) => x !== n) })}>{label(n)}</Chip>
              ))}
              <input
                value={newNeed}
                onChange={(e) => setNewNeed(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const t = toTag(newNeed);
                  if (t && !i.needs.includes(t) && i.needs.length < 6) patch({ needs: [...i.needs, t] });
                  setNewNeed("");
                }}
                placeholder="add a need"
                aria-label="Add a need"
                className="w-28 bg-transparent px-1 font-mono text-[11px] text-fg placeholder:text-dim/60"
              />
            </div>
          </div>

          {details.length > 0 && (
            <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
              {details.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-dim">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}

          {i.signals.length > 0 && (
            <div>
              <Label>Wording cues, taken from your own words. Not a measurement of how you feel.</Label>
              <ul className="space-y-2">
                {i.signals.map((s) => (
                  <li key={s.kind} className="flex flex-wrap items-baseline gap-3">
                    <Chip onRemove={() => patch({ signals: i.signals.filter((x) => x.kind !== s.kind) })}>{label(s.kind)}</Chip>
                    <span className="font-serif text-lg italic text-dim">“{s.quote}”</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Recall
            current={i}
            related={related}
            onDecide={(otherId, state) => setDraft((d) => d && { ...d, decisions: { ...d.decisions, [otherId]: state } })}
          />

          <div className="flex gap-2 border-t border-line pt-6">
            <Btn variant="primary" onClick={save}>Save to memory</Btn>
            <Btn onClick={() => setDraft(null)}>Edit my note</Btn>
          </div>
        </div>
      )}
    </section>
  );
}
