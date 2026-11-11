import { now } from "./clock";
import type { Checkin, Intention, IntentStatus } from "./types";

export function deriveStatus(i: Intention, at: Date): IntentStatus {
  if (i.status === "bought" || i.status === "purchased") return "bought";
  if (i.status === "let_go" || i.status === "archived") return "let_go";
  if (i.status === "ready") return "ready";
  const last = i.checkins?.at(-1);
  return at.getTime() >= Date.parse(i.waitUntil) && last?.stillWant === true ? "ready" : "waiting";
}

export function isCheckedInToday(i: Intention, at = now()): boolean {
  const key = at.toISOString().slice(0, 10);
  return (i.checkins ?? []).some((checkin) => new Date(checkin.at).toISOString().slice(0, 10) === key);
}

export function isCheckinDay(i: Intention, at = now()): boolean {
  return at.toISOString().slice(0, 10) > new Date(i.createdAt).toISOString().slice(0, 10);
}

export function addCheckin(i: Intention, stillWant: boolean, at = now()): Intention {
  if (isCheckedInToday(i, at) || i.status === "bought" || i.status === "purchased" || i.status === "let_go" || i.status === "archived") return i;
  const checkins: Checkin[] = [...(i.checkins ?? []), { at: at.toISOString(), stillWant }];
  const updated = { ...i, checkins };
  return { ...updated, status: !stillWant ? "let_go" : deriveStatus(updated, at) };
}

export function decideNow(i: Intention, at = now()): Intention {
  if (i.status === "bought" || i.status === "purchased" || i.status === "let_go" || i.status === "archived") return i;
  return { ...i, status: "ready", events: [...i.events, { id: `early-${at.getTime()}`, at: at.toISOString(), type: "continued" }] };
}

export function waitAgain(i: Intention, days: 1 | 3 | 7, at = now()): Intention {
  return { ...i, status: "waiting", waitDays: days, waitUntil: new Date(at.getTime() + days * 86_400_000).toISOString() };
}

export function chooseWait(i: Intention, days: 0 | 1 | 3 | 7): Intention {
  return { ...i, status: days === 0 ? "ready" : "waiting", waitDays: days, waitUntil: new Date(Date.parse(i.createdAt) + days * 86_400_000).toISOString() };
}

export function undoLetGo(i: Intention): Intention {
  if (i.status !== "let_go" && i.status !== "archived") return i;
  return { ...i, status: "waiting" };
}

export function letGo(i: Intention, at = now()): Intention {
  if (i.status === "let_go" || i.status === "archived" || i.status === "bought" || i.status === "purchased") return i;
  return { ...i, status: "let_go", events: [...i.events, { id: `let-go-${at.getTime()}`, at: at.toISOString(), type: "archived" }] };
}
