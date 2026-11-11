import { pairKey } from "./link";
import { applyAction, decideLink } from "./memory";
import type {
  AppNotification,
  DecisionReminder,
  LinkState,
  Memory,
  NotificationPreferences,
  Related,
} from "./types";
import { now as businessNow } from "./clock";

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  memoryRecall: true,
  decisionReminders: true,
  browserNotifications: false,
};

export function getNotificationPrefs(m: Memory): NotificationPreferences {
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(m.notificationPrefs ?? {}) };
}

export function updateNotificationPrefs(m: Memory, patch: Partial<NotificationPreferences>): Memory {
  return {
    ...m,
    notificationPrefs: { ...getNotificationPrefs(m), ...patch },
  };
}

function samePair(n: AppNotification, aId: string, bId: string): boolean {
  if (n.type !== "memory_recall" || !n.relatedIntentionId) return false;
  return pairKey(n.intentionId, n.relatedIntentionId) === pairKey(aId, bId);
}

/**
 * Adds a Memory Recall notification for a newly captured intention when a
 * genuinely relevant earlier intention is found. Deduplicates by pair and
 * skips pairs the user already confirmed or dismissed.
 */
export function createRecallNotification(
  m: Memory,
  intentionId: string,
  related: Related,
  lang: "en" | "es",
): Memory {
  if (!getNotificationPrefs(m).memoryRecall) return m;
  const relatedId = related.intention.id;
  if (intentionId === relatedId) return m;

  const existingDecision = m.links[pairKey(intentionId, relatedId)];
  if (existingDecision === "confirmed" || existingDecision === "dismissed") return m;

  const notifications = m.notifications ?? [];
  if (notifications.some((n) => samePair(n, intentionId, relatedId))) return m;

  const prev = related.intention;
  const prevSubject = prev.interpretation.subject;
  const detail = prev.interpretation.purpose || prev.rawText;

  const title =
    lang === "es"
      ? "Ya habías considerado algo parecido."
      : "You considered something similar before.";
  const message =
    lang === "es"
      ? `Antes estabas considerando «${prevSubject}» (${detail}). ¿Resuelven la misma necesidad?`
      : `Previously, you were considering “${prevSubject}” (${detail}). Are these solving the same need?`;

  const note: AppNotification = {
    id: uid(),
    type: "memory_recall",
    intentionId,
    relatedIntentionId: relatedId,
    title,
    message,
    createdAt: businessNow().toISOString(),
    status: "unread",
  };

  return { ...m, notifications: [...notifications, note] };
}

/**
 * Syncs any existing Memory Recall notification when the user answers the
 * question directly inside the Composer or IntentionDetail sheet.
 */
export function syncRecallNotificationForPair(m: Memory, aId: string, bId: string, answer: LinkState): Memory {
  const notifications = m.notifications ?? [];
  let changed = false;
  const next = notifications.map((n) => {
    if (!samePair(n, aId, bId)) return n;
    changed = true;
    return {
      ...n,
      status: answer === "dismissed" ? ("dismissed" as const) : ("read" as const),
      response: answer,
    };
  });
  return changed ? { ...m, notifications: next } : m;
}

/** Answers a Memory Recall notification from the Notification Center. */
export function resolveRecallNotification(m: Memory, notificationId: string, answer: LinkState): Memory {
  const notifications = m.notifications ?? [];
  const target = notifications.find((n) => n.id === notificationId);
  if (!target || target.type !== "memory_recall" || !target.relatedIntentionId) return m;

  const withLink = decideLink(m, target.intentionId, target.relatedIntentionId, answer);
  return syncRecallNotificationForPair(withLink, target.intentionId, target.relatedIntentionId, answer);
}

/** Schedules or updates a personal "Remind me later" reminder for an open intention. */
export function setDecisionReminder(m: Memory, intentionId: string, dueAtIso: string): Memory {
  const intention = m.intentions.find((i) => i.id === intentionId);
  if (!intention || intention.status === "archived" || intention.status === "purchased" || intention.status === "let_go" || intention.status === "bought") return m;
  const parsed = new Date(dueAtIso);
  if (Number.isNaN(parsed.getTime())) return m;

  const reminder: DecisionReminder = {
    id: uid(),
    intentionId,
    dueAt: parsed.toISOString(),
    createdAt: businessNow().toISOString(),
  };

  const remaining = (m.reminders ?? []).filter((r) => r.intentionId !== intentionId);
  return { ...m, reminders: [...remaining, reminder] };
}

export function cancelDecisionReminder(m: Memory, intentionId: string): Memory {
  const existing = m.reminders ?? [];
  if (!existing.some((r) => r.intentionId === intentionId)) return m;
  return { ...m, reminders: existing.filter((r) => r.intentionId !== intentionId) };
}

/**
 * Checks due reminders against `now`, cleaning up any belonging to archived or
 * purchased intentions and turning each due reminder into at most one unread
 * notification. Pure and safe to run on mount, focus, and visibility changes.
 */
export function evaluateDueReminders(
  m: Memory,
  now = businessNow(),
  lang: "en" | "es" = "es",
): { memory: Memory; triggered: AppNotification[] } {
  const prefs = getNotificationPrefs(m);
  const byId = new Map(m.intentions.map((i) => [i.id, i]));
  const notifications = [...(m.notifications ?? [])];
  const keptReminders: DecisionReminder[] = [];
  const triggered: AppNotification[] = [];
  let changed = false;

  // Dismiss unread reminder notifications for intentions no longer open.
  for (let idx = 0; idx < notifications.length; idx++) {
    const n = notifications[idx];
    if (n.type === "decision_reminder" && n.status === "unread") {
      const target = byId.get(n.intentionId);
      if (!target || target.status === "archived" || target.status === "purchased" || target.status === "let_go" || target.status === "bought") {
        notifications[idx] = { ...n, status: "dismissed" };
        changed = true;
      }
    }
  }

  for (const r of m.reminders ?? []) {
    const target = byId.get(r.intentionId);
    if (!target || target.status === "archived" || target.status === "purchased" || target.status === "let_go" || target.status === "bought") {
      changed = true; // drop invalid/closed reminder
      continue;
    }

    if (new Date(r.dueAt).getTime() <= now.getTime()) {
      changed = true;
      const alreadyFired = notifications.some((n) => n.reminderId === r.id);
      if (prefs.decisionReminders && !alreadyFired) {
        const subject = target.interpretation.subject;
        const nLang = target.interpretation.language ?? lang;
        const note: AppNotification = {
          id: uid(),
          type: "decision_reminder",
          intentionId: r.intentionId,
          reminderId: r.id,
          title: nLang === "es" ? "¿Todavía estás pensando en esto?" : "Still thinking about this?",
          message:
            nLang === "es"
              ? `Estabas considerando «${subject}». ¿Quieres revisar tu decisión?`
              : `You were considering “${subject}”. Would you like to revisit your decision?`,
          createdAt: now.toISOString(),
          dueAt: r.dueAt,
          status: "unread",
        };
        notifications.push(note);
        triggered.push(note);
      }
    } else {
      keptReminders.push(r);
    }
  }

  if (!changed) return { memory: m, triggered: [] };
  return {
    memory: { ...m, reminders: keptReminders, notifications },
    triggered,
  };
}

export function markNotificationRead(m: Memory, notificationId: string): Memory {
  const notifications = m.notifications ?? [];
  let changed = false;
  const next = notifications.map((n) => {
    if (n.id !== notificationId || n.status !== "unread") return n;
    changed = true;
    return { ...n, status: "read" as const };
  });
  return changed ? { ...m, notifications: next } : m;
}

export function dismissNotification(m: Memory, notificationId: string): Memory {
  const notifications = m.notifications ?? [];
  let changed = false;
  const next = notifications.map((n) => {
    if (n.id !== notificationId || n.status === "dismissed") return n;
    changed = true;
    return { ...n, status: "dismissed" as const };
  });
  return changed ? { ...m, notifications: next } : m;
}

export function resolveReminderNotification(
  m: Memory,
  notificationId: string,
  action: "still_interested" | "reconsider" | "dismiss",
): Memory {
  const notifications = m.notifications ?? [];
  const target = notifications.find((n) => n.id === notificationId);
  if (!target || target.type !== "decision_reminder") return m;

  let next = m;
  if (action === "reconsider") {
    const intention = m.intentions.find((i) => i.id === target.intentionId);
    if (intention && intention.status !== "archived" && intention.status !== "purchased" && intention.status !== "let_go" && intention.status !== "bought") {
      next = applyAction(next, target.intentionId, "reconsider");
    }
  }

  const nextStatus = action === "dismiss" ? ("dismissed" as const) : ("read" as const);
  return {
    ...next,
    notifications: (next.notifications ?? []).map((n) =>
      n.id === notificationId ? { ...n, status: nextStatus, response: action } : n,
    ),
  };
}

/** Cleanup helper when an intention closes or is undone. */
export function cleanupNotificationsForIntention(m: Memory, intentionId: string, mode: "closed" | "removed"): Memory {
  const reminders = (m.reminders ?? []).filter((r) => r.intentionId !== intentionId);
  const notifications = (m.notifications ?? [])
    .filter((n) => mode !== "removed" || (n.intentionId !== intentionId && n.relatedIntentionId !== intentionId))
    .map((n) =>
      mode === "closed" && n.type === "decision_reminder" && n.intentionId === intentionId && n.status === "unread"
        ? { ...n, status: "dismissed" as const }
        : n,
    );
  return { ...m, reminders, notifications };
}

