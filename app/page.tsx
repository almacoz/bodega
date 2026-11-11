"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Settings } from "lucide-react";
import { Composer } from "@/components/Composer";
import { ConfigModal } from "@/components/ConfigModal";
import { IntentionDetail } from "@/components/IntentionDetail";
import { NotificationCenter } from "@/components/NotificationCenter";
import { Timeline } from "@/components/Timeline";
import { Assistant } from "@/components/Assistant";
import { Flow } from "@/components/Flow";
import { BudgetCard } from "@/components/Budget";
import { getBudget, saveBudget, spentThisMonth, type Budget } from "@/lib/budget";
import { useI18n } from "@/lib/i18n";
import {
  addIntention,
  addReflectionNote,
  addProductReference,
  applyAction,
  decideLink,
  removeIntention,
  removeProductReference,
  selectProductForIntention,
} from "@/lib/memory";
import {
  cancelDecisionReminder,
  createRecallNotification,
  dismissNotification,
  evaluateDueReminders,
  getNotificationPrefs,
  markNotificationRead,
  resolveRecallNotification,
  resolveReminderNotification,
  setDecisionReminder,
  syncRecallNotificationForPair,
} from "@/lib/notifications";
import { loadMemory, saveMemory } from "@/lib/storage";
import type { Action, AppNotification, Interpretation, LinkState, Memory, ProductReference, Related } from "@/lib/types";
import { now, demoDayOffset, skipDemoDay } from "@/lib/clock";
import { addCheckin, chooseWait, decideNow, deriveStatus, isCheckedInToday, isCheckinDay, letGo, undoLetGo, waitAgain } from "@/lib/waiting";
import { updateIntentionInterpretation } from "@/lib/memory";
import { cap } from "@/components/ui";

function UndoNotice({ title, onUndo }: { title: string; onUndo: () => void }) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(true);
  useEffect(() => { const timer = setTimeout(() => setVisible(false), 8000); return () => clearTimeout(timer); }, []);
  return visible ? <p className="my-3 rounded-xl bg-stone-50 px-4 py-3 text-sm text-dim">{t.wait.undo(title)} <button type="button" onClick={() => { onUndo(); setVisible(false); }} className="font-medium text-fg underline">{t.wait.undoLabel}</button></p> : null;
}

function fireBrowserAlerts(triggered: AppNotification[], m: Memory, onSelect: (id: string) => void) {
  if (!triggered.length || typeof window === "undefined" || !("Notification" in window)) return;
  if (!getNotificationPrefs(m).browserNotifications || Notification.permission !== "granted") return;

  for (const n of triggered) {
    try {
      const alert = new Notification(n.title, { body: n.message, tag: n.id });
      alert.onclick = () => {
        window.focus();
        onSelect(n.intentionId);
        alert.close();
      };
    } catch {}
  }
}

export default function Home() {
  const { lang, t, toggleLang } = useI18n();
  const [memory, setMemory] = useState<Memory | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newestId, setNewestId] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [selectedCheckinId, setSelectedCheckinId] = useState<string | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  // Undo is offered only for what the person let go in this visit, never for old history.
  const [justLetGo, setJustLetGo] = useState<string[]>([]);
  useEffect(() => setBudget(getBudget()), []);
  const updateBudget = (b: Budget | null) => { saveBudget(b); setBudget(b); };

  const checkDueReminders = useCallback(
    (source?: Memory | null) => {
      const run = (current: Memory) => {
        const at = now();
        const refreshed = { ...current, intentions: current.intentions.map((i) => ({ ...i, status: deriveStatus(i, at) })) };
        const { memory: updated, triggered } = evaluateDueReminders(refreshed, at, lang);
        if (triggered.length) fireBrowserAlerts(triggered, updated, setSelectedId);
        return updated;
      };
      if (source) return run(source);
      setMemory((m) => (m ? run(m) : m));
      return null;
    },
    [lang],
  );

  // Load localStorage and immediately check due reminders
  useEffect(() => {
    const loaded = loadMemory();
    const checked = checkDueReminders(loaded) ?? loaded;
    setMemory(checked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (memory) saveMemory(memory);
  }, [memory]);

  useEffect(() => {
    if (!memory) return;
    const params = new URLSearchParams(window.location.search);
    const boughtId = params.get("bought");
    if (boughtId && memory.intentions.some((i) => i.id === boughtId)) {
      setSelectedId(boughtId);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [memory]);

  // Re-check due reminders when returning to the tab or focusing the window
  useEffect(() => {
    const onFocus = () => checkDueReminders();
    const onVisible = () => {
      if (document.visibilityState === "visible") checkDueReminders();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [checkDueReminders]);

  function save(text: string, interp: Interpretation, waitDays: 0 | 1 | 3 | 7): string {
    if (!memory) return "";
    const r = addIntention(memory, text, interp, {}, { waitDays });
    setMemory(r.memory);
    setNewestId(r.id);
    return r.id;
  }
  function finishInterpretation(id: string, interp: Interpretation, related: Related | null) {
    setMemory((m) => {
      if (!m) return m;
      const updated = updateIntentionInterpretation(m, id, interp);
      return process.env.NEXT_PUBLIC_RECALL_ENABLED === "true" && related ? createRecallNotification(updated, id, related, lang) : updated;
    });
  }
  const setWait = (id: string, days: 0 | 1 | 3 | 7) => setMemory((m) => m && ({ ...m, intentions: m.intentions.map((i) => i.id === id ? chooseWait(i, days) : i) }));

  const undo = (id: string) => setMemory((m) => m && removeIntention(m, id));
  const act = (id: string, action: Action, note?: string) => setMemory((m) => m && applyAction(m, id, action, note));
  const decide = (a: string, b: string, state: LinkState) =>
    setMemory((m) => m && syncRecallNotificationForPair(decideLink(m, a, b, state), a, b, state));
  const addProduct = (intentionId: string, product: Omit<ProductReference, "id" | "addedAt">) =>
    setMemory((m) => m && addProductReference(m, intentionId, product).memory);
  const removeProduct = (intentionId: string, productId: string) =>
    setMemory((m) => m && removeProductReference(m, intentionId, productId));
  const selectProduct = (intentionId: string, productId: string | null) =>
    setMemory((m) => m && selectProductForIntention(m, intentionId, productId));
  const setReminder = (intentionId: string, dueAtIso: string) =>
    setMemory((m) => m && setDecisionReminder(m, intentionId, dueAtIso));
  const cancelReminder = (intentionId: string) =>
    setMemory((m) => m && cancelDecisionReminder(m, intentionId));
  const checkin = (id: string, yes: boolean) => { if (!yes) setJustLetGo((ids) => [...ids, id]); checkinRaw(id, yes); };
  const checkinRaw = (id: string, yes: boolean) => setMemory((m) => m && ({ ...m, intentions: m.intentions.map((i) => i.id === id ? addCheckin(i, yes) : i) }));
  const undoLetGoAction = (id: string) => setMemory((m) => m && ({ ...m, intentions: m.intentions.map((i) => i.id === id ? undoLetGo(i) : i) }));
  const letGoAction = (id: string) => { setJustLetGo((ids) => [...ids, id]); letGoRaw(id); };
  const letGoRaw = (id: string) => setMemory((m) => m && ({ ...m, intentions: m.intentions.map((i) => i.id === id ? letGo(i) : i) }));
  const decideNowAction = (id: string) => setMemory((m) => m && ({ ...m, intentions: m.intentions.map((i) => i.id === id ? decideNow(i) : i) }));
  const waitAgainAction = (id: string, days: 1 | 3 | 7) => setMemory((m) => m && ({ ...m, intentions: m.intentions.map((i) => i.id === id ? waitAgain(i, days) : i) }));
  const addAgentProposal = (intention: import("@/lib/types").Intention) => {
    setMemory((m) => m && (m.intentions.some((i) => i.id === intention.id) ? m : { ...m, intentions: [...m.intentions, intention] }));
    setNewestId(intention.id);
  };
  const setPrice = (id: string, amount: number) => setMemory((m) => m && ({ ...m, intentions: m.intentions.map((i) => i.id === id ? { ...i, price: { value: amount.toFixed(2), currency: budget?.currency ?? "USD" } } : i) }));
  const saveReflection = (id: string, text: string) => setMemory((m) => m && addReflectionNote(m, id, text));

  const selected = memory?.intentions.find((i) => i.id === selectedId) ?? null;
  const pendingCheckins = (memory?.intentions ?? []).filter((i) => i.status === "waiting" && isCheckinDay(i, now()) && !isCheckedInToday(i, now()));
  const displayedCheckin = pendingCheckins.find((i) => i.id === selectedCheckinId) ?? pendingCheckins[0];
  const nextCheckin = pendingCheckins.find((i) => i.id !== displayedCheckin?.id);
  const selectedReminder = selected ? memory?.reminders?.find((r) => r.intentionId === selected.id) : undefined;
  const unreadCount = (memory?.notifications ?? []).filter((n) => n.status === "unread" && (process.env.NEXT_PUBLIC_RECALL_ENABLED === "true" || n.type !== "memory_recall")).length;

  function openNotifications() {
    checkDueReminders();
    setNotificationsOpen(true);
  }

  return (
    <main className="mx-auto max-w-2xl px-6 pb-32 pt-10 sm:pt-14">
      <header className="mb-16 flex items-center justify-between gap-4 sm:mb-20">
        <div className="flex items-baseline gap-3">
          <span className="font-sans text-lg font-semibold tracking-tight text-fg">WhyBuy</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={toggleLang} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-dim" aria-label={t.switchLanguage}>{lang === "en" ? "ES" : "EN"}</button>
          <button
            type="button"
            onClick={openNotifications}
            aria-label={t.notifications.openLabel}
            title={t.notifications.title}
            className="relative rounded-full p-2 text-dim transition-colors hover:bg-slate-100 hover:text-fg"
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span
                aria-label={`${unreadCount}`}
                className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-600 ring-2 ring-white"
              />
            )}
          </button>
          <button
            type="button"
            onClick={() => setConfigOpen(true)}
            className="rounded-full p-2 text-dim transition-colors hover:bg-slate-100 hover:text-fg"
            aria-label={t.settingsTitle}
            title={t.settingsTitle}
          >
            <Settings size={16} />
          </button>
        </div>
      </header>

      {memory ? (
        <>
          {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && <button type="button" onClick={() => { skipDemoDay(); const at = now(); setMemory((m) => m && ({ ...m, intentions: m.intentions.map((i) => ({ ...i, status: deriveStatus(i, at) })) })); }} className="mb-5 rounded-full border border-line bg-white px-3 py-1.5 text-xs text-dim">{t.wait.skipDay}{demoDayOffset()}</button>}
          {(displayedCheckin ? [displayedCheckin] : []).map((i) => {
            const elapsed = Math.max(0, Math.floor((now().getTime() - Date.parse(i.createdAt)) / 86_400_000));
            const progress = i.checkins ?? [];
            return <section key={i.id} className="rise mb-12 rounded-3xl border border-amber-200 bg-amber-50/60 p-6" aria-label={t.wait.checkin}>
              <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold uppercase tracking-wide text-fg">⏳ {t.story.today}</p>
              <p className="text-xs font-medium uppercase tracking-wide text-amber-800">{t.wait.waiting(Math.min(elapsed + 1, i.waitDays), i.waitDays)}</p>
              <p className="mt-1 font-display text-3xl tracking-tight text-fg">{cap(i.interpretation.subject)}</p>
              <p className="mt-2 text-sm text-dim">{t.wait.youSaid} “{i.rawText}”</p>{i.reflection && <p className="mt-1 text-sm text-dim">{i.reflection}</p>}
              <p className="mt-4 text-lg font-semibold text-fg">{t.wait.checkin}</p>
              <div className="mt-3 grid grid-cols-2 gap-3"><button type="button" onClick={() => checkin(i.id, true)} className="rounded-2xl bg-fg py-4 text-base font-semibold text-white hover:bg-slate-800">👍 {t.wait.yes}</button><button type="button" onClick={() => checkin(i.id, false)} className="rounded-2xl border border-line bg-white py-4 text-base font-semibold text-fg hover:bg-slate-50">👋 {t.wait.no}</button></div>
              <div className="mt-3 flex gap-2" aria-label="Check-in progress">{Array.from({ length: i.waitDays }, (_, n) => { const answer = progress[n]; const label = answer ? answer.stillWant ? "yes" : "no" : "not answered"; return <span key={n} aria-label={t.wait.dayDot(n + 1, label)} className={`text-base font-bold ${answer ? answer.stillWant ? "text-emerald-800" : "text-rose-700" : "text-slate-500"}`}>{answer ? answer.stillWant ? "●" : "×" : "○"}</span>; })}</div>
            </section>;
          })}
          {nextCheckin && <button type="button" onClick={() => setSelectedCheckinId(nextCheckin.id)} className="-mt-9 mb-12 text-sm text-dim underline">{t.wait.more(pendingCheckins.length - 1)}</button>}
          {memory.intentions.filter((i) => i.status === "let_go" && justLetGo.includes(i.id)).map((i) => <UndoNotice key={i.id} title={cap(i.interpretation.subject)} onUndo={() => undoLetGoAction(i.id)} />)}
          <Composer memory={memory} onSave={save} onInterpret={finishInterpretation} onWaitDays={setWait} onDecide={decide} onUndo={undo} onOpen={setSelectedId} onSaveReflection={saveReflection} agentSlot={<Assistant embedded onProposal={addAgentProposal} onOpen={setSelectedId} />} />
          <div className="mt-10">
            <BudgetCard budget={budget} spent={spentThisMonth(memory, now())} onSave={updateBudget} />
          </div>
          <div className="mt-16">
            <Flow resting={memory.intentions.filter((i) => i.status === "waiting").length} ready={memory.intentions.filter((i) => i.status === "ready").length} />
          </div>
          <Timeline memory={memory} newestId={newestId} onSelect={setSelectedId} />
        </>
      ) : (
        <div aria-hidden className="h-44 animate-pulse rounded-3xl bg-slate-100" />
      )}

      {selected && memory && (
        <IntentionDetail
          intention={selected}
          memory={memory}
          reminder={selectedReminder}
          onClose={() => setSelectedId(null)}
          onAction={act}
          onDecide={decide}
          onAddProduct={addProduct}
          onRemoveProduct={removeProduct}
          onSelectProduct={selectProduct}
          onSetReminder={setReminder}
          onCancelReminder={cancelReminder}
          onDecideNow={decideNowAction}
          onWaitAgain={waitAgainAction}
          onUndoLetGo={undoLetGoAction}
          onLetGo={letGoAction}
          onSaveReflection={saveReflection}
          budget={budget}
          spent={spentThisMonth(memory, now())}
          onSetPrice={setPrice}
        />
      )}

      {notificationsOpen && memory && (
        <NotificationCenter
          isOpen={notificationsOpen}
          memory={memory}
          onClose={() => setNotificationsOpen(false)}
          onOpenIntention={(intentionId, notificationId) => {
            setMemory((m) => m && markNotificationRead(m, notificationId));
            setNotificationsOpen(false);
            setSelectedId(intentionId);
          }}
          onMarkRead={(nId) => setMemory((m) => m && markNotificationRead(m, nId))}
          onDismiss={(nId) => setMemory((m) => m && dismissNotification(m, nId))}
          onAnswerRecall={(nId, answer) => setMemory((m) => m && resolveRecallNotification(m, nId, answer))}
          onAnswerReminder={(nId, action) => setMemory((m) => m && resolveReminderNotification(m, nId, action))}
        />
      )}

      {configOpen && memory && (
        <ConfigModal
          isOpen={configOpen}
          onClose={() => setConfigOpen(false)}
          memory={memory}
          onUpdateMemory={(newMemory) => {
            setMemory(newMemory);
            saveMemory(newMemory);
          }}
        />
      )}
    </main>
  );
}
