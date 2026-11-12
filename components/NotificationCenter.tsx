"use client";

import { RECALL_ENABLED } from "@/lib/flags";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bell, Check, Clock, Link2, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { AppNotification, LinkState, Memory } from "@/lib/types";
import { cap, relDate } from "./ui";

/**
 * Minimalist Notification Center in a native top-layer <dialog> sheet.
 * Visually separates Memory Recall from personal Decision Reminders without
 * becoming a noisy dashboard or pressuring the user to buy.
 */
export function NotificationCenter({
  isOpen,
  memory,
  onClose,
  onOpenIntention,
  onMarkRead,
  onDismiss,
  onAnswerRecall,
  onAnswerReminder,
}: {
  isOpen: boolean;
  memory: Memory;
  onClose: () => void;
  onOpenIntention: (intentionId: string, notificationId: string) => void;
  onMarkRead: (notificationId: string) => void;
  onDismiss: (notificationId: string) => void;
  onAnswerRecall: (notificationId: string, answer: LinkState) => void;
  onAnswerReminder: (notificationId: string, action: "still_interested" | "reconsider" | "dismiss") => void;
}) {
  const { lang, t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [showDismissed, setShowDismissed] = useState(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (isOpen && !d.open) d.showModal();
    if (!isOpen && d.open) d.close();
  }, [isOpen]);

  // Fallback for browsers (e.g. Safari) without native `closedby="any"` light dismiss.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d || "closedBy" in HTMLDialogElement.prototype) return;
    const outside = (e: PointerEvent) => {
      const r = d.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    let armed = false;
    const down = (e: PointerEvent) => {
      armed = outside(e);
    };
    const up = (e: PointerEvent) => {
      if (armed && outside(e)) d.close();
    };
    d.addEventListener("pointerdown", down);
    d.addEventListener("pointerup", up);
    return () => {
      d.removeEventListener("pointerdown", down);
      d.removeEventListener("pointerup", up);
    };
  }, []);

  if (!isOpen) return null;

  const all = [...(memory.notifications ?? [])].filter((n) => RECALL_ENABLED || n.type !== "memory_recall").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const dismissedCount = all.filter((n) => n.status === "dismissed").length;
  const visible = showDismissed ? all : all.filter((n) => n.status !== "dismissed");

  const recalls = visible.filter((n) => n.type === "memory_recall");
  const reminders = visible.filter((n) => n.type === "decision_reminder");

  const byId = new Map(memory.intentions.map((i) => [i.id, i]));

  function renderItem(n: AppNotification) {
    const target = byId.get(n.intentionId);
    const subject = target ? cap(target.interpretation.subject) : null;
    const isUnread = n.status === "unread";
    const isDismissed = n.status === "dismissed";

    return (
      <li
        key={n.id}
        className={`rounded-2xl border p-4 transition-colors ${
          isUnread
            ? "border-emerald-200/80 bg-emerald-50/30"
            : isDismissed
              ? "border-line bg-slate-50/50 opacity-70"
              : "border-line bg-white"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-dim">
            <span className="inline-flex items-center gap-1 uppercase tracking-[0.12em]">
              {n.type === "memory_recall" ? <Link2 size={11} /> : <Clock size={11} />}
              {n.type === "memory_recall" ? t.notifications.typeRecall : t.notifications.typeReminder}
            </span>
            <span>·</span>
            <span>{relDate(n.createdAt, lang)}</span>
            <span>·</span>
            <span className={`inline-flex items-center gap-1 ${isUnread ? "text-emerald-800" : "text-slate-400"}`}>
              {isUnread && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-600" />}
              {t.notifications.status[n.status]}
            </span>
          </div>
          {!isDismissed && (
            <div className="flex shrink-0 items-center gap-1">
              {isUnread && (
                <button
                  type="button"
                  onClick={() => onMarkRead(n.id)}
                  title={t.notifications.markRead}
                  aria-label={t.notifications.markRead}
                  className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-fg"
                >
                  <Check size={13} />
                </button>
              )}
              <button
                type="button"
                onClick={() => onDismiss(n.id)}
                title={t.notifications.dismiss}
                aria-label={t.notifications.dismiss}
                className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-fg"
              >
                <X size={13} />
              </button>
            </div>
          )}
        </div>

        <p className="mt-2 font-display text-xl leading-snug text-fg">{n.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{n.message}</p>

        {subject && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => onOpenIntention(n.intentionId, n.id)}
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline"
            >
              {subject} · {t.notifications.openIntention} <ArrowUpRight size={12} />
            </button>
          </div>
        )}

        {/* Contextual actions */}
        {!isDismissed && n.type === "memory_recall" && (!n.response || n.response === "unsure") && (
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onAnswerRecall(n.id, "confirmed")}
              className="rounded-full bg-fg px-3 py-1 text-xs font-medium text-white hover:bg-slate-800"
            >
              {t.notifications.recallActions.same}
            </button>
            <button
              type="button"
              onClick={() => onAnswerRecall(n.id, "dismissed")}
              className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:text-fg"
            >
              {t.notifications.recallActions.different}
            </button>
            {n.response !== "unsure" && (
              <button
                type="button"
                onClick={() => onAnswerRecall(n.id, "unsure")}
                className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-dim hover:border-slate-300 hover:text-fg"
              >
                {t.notifications.recallActions.unsure}
              </button>
            )}
          </div>
        )}

        {!isDismissed && n.type === "decision_reminder" && !n.response && (
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onAnswerReminder(n.id, "still_interested")}
              className="rounded-full bg-fg px-3 py-1 text-xs font-medium text-white hover:bg-slate-800"
            >
              {t.notifications.reminderActions.stillInterested}
            </button>
            <button
              type="button"
              onClick={() => onAnswerReminder(n.id, "reconsider")}
              className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:text-fg"
            >
              {t.notifications.reminderActions.reconsider}
            </button>
            <button
              type="button"
              onClick={() => onAnswerReminder(n.id, "dismiss")}
              className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-dim hover:border-slate-300 hover:text-fg"
            >
              {t.notifications.reminderActions.dismiss}
            </button>
          </div>
        )}
      </li>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: "any" } as Record<string, string>)}
      onClose={() => {
        if (dialogRef.current) dialogRef.current.returnValue = "";
        onClose();
      }}
      aria-labelledby="notifications-title"
      className="sheet m-0 ml-auto h-dvh max-h-dvh w-full max-w-md bg-white p-0 text-fg shadow-2xl"
    >
      <div className="flex min-h-full flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-white/95 px-6 py-5 backdrop-blur-xs">
          <div className="flex items-center gap-2.5">
            <Bell size={16} className="text-dim" />
            <h2 id="notifications-title" className="font-display text-2xl tracking-tight text-fg">
              {t.notifications.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label={t.detail.close}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-fg"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 space-y-8 px-6 py-6">
          {visible.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-display text-2xl text-slate-500">{t.notifications.empty}</p>
            </div>
          ) : (
            <>
              {recalls.length > 0 && (
                <section aria-labelledby="sec-recall" className="space-y-3">
                  <h3 id="sec-recall" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">
                    {t.notifications.sectionRecall}
                  </h3>
                  <ul className="space-y-3">{recalls.map(renderItem)}</ul>
                </section>
              )}

              {reminders.length > 0 && (
                <section aria-labelledby="sec-reminders" className="space-y-3">
                  <h3 id="sec-reminders" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">
                    {t.notifications.sectionReminders}
                  </h3>
                  <ul className="space-y-3">{reminders.map(renderItem)}</ul>
                </section>
              )}
            </>
          )}

          {dismissedCount > 0 && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setShowDismissed((v) => !v)}
                className="text-xs text-dim underline decoration-slate-300 underline-offset-4 hover:text-fg"
              >
                {showDismissed ? t.notifications.hideDismissed : `${t.notifications.showDismissed} (${dismissedCount})`}
              </button>
            </div>
          )}
        </div>

        <footer className="border-t border-line px-6 py-4">
          <p className="text-xs leading-relaxed text-slate-400">{t.notifications.reopenNote}</p>
        </footer>
      </div>
    </dialog>
  );
}

