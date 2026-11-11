import { describe, expect, it } from "vitest";
import { findRelated } from "../lib/link";
import { addIntention, applyAction, emptyMemory } from "../lib/memory";
import {
  cancelDecisionReminder,
  createRecallNotification,
  dismissNotification,
  evaluateDueReminders,
  markNotificationRead,
  resolveRecallNotification,
  resolveReminderNotification,
  setDecisionReminder,
  updateNotificationPrefs,
} from "../lib/notifications";
import { headphones, laptop, tablet } from "./fixtures";

describe("Memory Recall notifications", () => {
  it("creates one recall notification per pair and avoids duplicates", () => {
    const first = addIntention(emptyMemory(), "I want a laptop for development while commuting", laptop);
    const second = addIntention(first.memory, "I'm thinking about a tablet for coding on the go", tablet);
    const [related] = findRelated(tablet, second.memory, second.id);

    const once = createRecallNotification(second.memory, second.id, related, "en");
    expect(once.notifications).toHaveLength(1);
    expect(once.notifications![0]).toMatchObject({
      type: "memory_recall",
      intentionId: second.id,
      relatedIntentionId: first.id,
      status: "unread",
    });

    // Calling again for the same pair must not duplicate
    const twice = createRecallNotification(once, second.id, related, "en");
    expect(twice.notifications).toHaveLength(1);
  });

  it("respects user answers and prevents repeating confirmed or dismissed pairs", () => {
    const first = addIntention(emptyMemory(), "I want a laptop", laptop);
    const second = addIntention(first.memory, "I want a tablet", tablet);
    const [related] = findRelated(tablet, second.memory, second.id);

    const withNote = createRecallNotification(second.memory, second.id, related, "en");
    const noteId = withNote.notifications![0].id;

    // Answer "Different need"
    const dismissed = resolveRecallNotification(withNote, noteId, "dismissed");
    expect(dismissed.notifications![0].status).toBe("dismissed");
    expect(dismissed.notifications![0].response).toBe("dismissed");

    // Attempting to create again for a dismissed pair is a no-op
    const retry = createRecallNotification(dismissed, second.id, related, "en");
    expect(retry.notifications).toHaveLength(1);
  });

  it("respects memoryRecall preference when disabled", () => {
    const first = addIntention(emptyMemory(), "I want a laptop", laptop);
    const disabled = updateNotificationPrefs(first.memory, { memoryRecall: false });
    const second = addIntention(disabled, "I want a tablet", tablet);
    const [related] = findRelated(tablet, second.memory, second.id);

    const after = createRecallNotification(second.memory, second.id, related, "en");
    expect(after.notifications ?? []).toHaveLength(0);
  });
});

describe("Decision Reminders lifecycle", () => {
  it("schedules, modifies, and cancels a reminder on an open intention", () => {
    const { memory, id } = addIntention(emptyMemory(), "Running shoes", headphones);
    const t1 = "2026-11-12T10:00:00.000Z";
    const t2 = "2026-11-15T10:00:00.000Z";

    const m1 = setDecisionReminder(memory, id, t1);
    expect(m1.reminders).toHaveLength(1);
    expect(m1.reminders![0].dueAt).toBe(t1);

    // Modifying replaces instead of duplicating
    const m2 = setDecisionReminder(m1, id, t2);
    expect(m2.reminders).toHaveLength(1);
    expect(m2.reminders![0].dueAt).toBe(t2);

    const m3 = cancelDecisionReminder(m2, id);
    expect(m3.reminders).toHaveLength(0);
  });

  it("triggers a due reminder exactly once and respects future dates", () => {
    const { memory, id } = addIntention(emptyMemory(), "Noise-cancelling headphones", headphones);
    const dueAt = "2026-11-10T12:00:00.000Z";
    const scheduled = setDecisionReminder(memory, id, dueAt);

    // Before dueAt -> nothing triggers
    const before = evaluateDueReminders(scheduled, new Date("2026-11-10T11:00:00.000Z"), "en");
    expect(before.triggered).toHaveLength(0);
    expect(before.memory.reminders).toHaveLength(1);

    // At or after dueAt -> triggers once and clears pending reminder
    const atDue = evaluateDueReminders(before.memory, new Date("2026-11-10T12:05:00.000Z"), "en");
    expect(atDue.triggered).toHaveLength(1);
    expect(atDue.triggered[0]).toMatchObject({
      type: "decision_reminder",
      intentionId: id,
      status: "unread",
      title: "Still thinking about this?",
    });
    expect(atDue.memory.reminders).toHaveLength(0);

    // Subsequent checks do not duplicate
    const again = evaluateDueReminders(atDue.memory, new Date("2026-11-10T13:00:00.000Z"), "en");
    expect(again.triggered).toHaveLength(0);
    expect(again.memory.notifications).toHaveLength(1);
  });

  it("cancels reminders and suppresses notifications for archived or purchased intentions", () => {
    const { memory, id } = addIntention(emptyMemory(), "I want a laptop", laptop);
    const withReminder = setDecisionReminder(memory, id, "2026-11-10T10:00:00.000Z");

    // Trigger reminder first
    const triggered = evaluateDueReminders(withReminder, new Date("2026-11-10T11:00:00.000Z"), "en").memory;
    expect(triggered.notifications![0].status).toBe("unread");

    // Archive intention -> unread reminder notification is dismissed automatically, history preserved
    const archived = applyAction(triggered, id, "archive", "No longer needed");
    expect(archived.intentions[0].events.map((e) => e.type)).toEqual(["captured", "archived"]);
    expect(archived.notifications![0].status).toBe("dismissed");

    // Cannot schedule reminder on archived intention
    const attempt = setDecisionReminder(archived, id, "2026-11-20T10:00:00.000Z");
    expect(attempt.reminders ?? []).toHaveLength(0);
  });

  it("supports mark read, dismiss, and reconsider actions without erasing intention history", () => {
    const { memory, id } = addIntention(emptyMemory(), "I want a laptop", laptop);
    const scheduled = setDecisionReminder(memory, id, "2026-11-10T09:00:00.000Z");
    const { memory: fired, triggered } = evaluateDueReminders(scheduled, new Date("2026-11-10T10:00:00.000Z"), "en");
    const noteId = triggered[0].id;

    const read = markNotificationRead(fired, noteId);
    expect(read.notifications![0].status).toBe("read");

    const reconsidered = resolveReminderNotification(read, noteId, "reconsider");
    expect(reconsidered.intentions[0].status).toBe("waiting");
    expect(reconsidered.intentions[0].events.map((e) => e.type)).toEqual(["captured", "reconsidered"]);

    const dismissed = dismissNotification(reconsidered, noteId);
    expect(dismissed.notifications![0].status).toBe("dismissed");
  });
});

