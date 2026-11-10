import { pairKey } from "./link";
import type { Action, EventType, IntentEvent, Intention, Interpretation, LinkState, Memory } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const emptyMemory = (): Memory => ({ intentions: [], links: {} });

function makeEvent(type: EventType, note?: string, paypalOrderId?: string): IntentEvent {
  return {
    id: uid(),
    at: new Date().toISOString(),
    type,
    ...(note ? { note } : {}),
    ...(paypalOrderId ? { paypalOrderId } : {}),
  };
}

function mapIntention(m: Memory, id: string, fn: (i: Intention) => Intention): Memory {
  return { ...m, intentions: m.intentions.map((i) => (i.id === id ? fn(i) : i)) };
}

/** Records a link decision on both intentions' histories. Re-deciding the same state is a no-op. */
export function decideLink(m: Memory, aId: string, bId: string, state: LinkState): Memory {
  const a = m.intentions.find((i) => i.id === aId);
  const b = m.intentions.find((i) => i.id === bId);
  const key = pairKey(aId, bId);
  if (!a || !b || m.links[key] === state) return m;
  const type: EventType = state === "confirmed" ? "link_confirmed" : "link_dismissed";
  let next: Memory = { ...m, links: { ...m.links, [key]: state } };
  next = mapIntention(next, aId, (i) => ({ ...i, events: [...i.events, makeEvent(type, b.interpretation.subject)] }));
  return mapIntention(next, bId, (i) => ({ ...i, events: [...i.events, makeEvent(type, a.interpretation.subject)] }));
}

/** `decisions` maps otherId -> the user's call on a suggested link, made during review. */
export function addIntention(
  m: Memory,
  rawText: string,
  interpretation: Interpretation,
  decisions: Record<string, LinkState> = {},
): { memory: Memory; id: string } {
  const captured = makeEvent("captured");
  const intention: Intention = {
    id: uid(),
    rawText,
    interpretation,
    status: "active",
    createdAt: captured.at,
    events: [captured],
  };
  let next: Memory = { ...m, intentions: [...m.intentions, intention] };
  for (const [otherId, state] of Object.entries(decisions)) next = decideLink(next, intention.id, otherId, state);
  return { memory: next, id: intention.id };
}

const ACTIONS: Record<Action, { status: Intention["status"]; type: EventType }> = {
  continue: { status: "active", type: "continued" },
  reconsider: { status: "reconsidering", type: "reconsidered" },
  archive: { status: "archived", type: "archived" },
  purchase: { status: "purchased", type: "purchased" },
};

export function applyAction(m: Memory, id: string, action: Action, note?: string, paypalOrderId?: string): Memory {
  const { status, type } = ACTIONS[action];
  return mapIntention(m, id, (i) => ({
    ...i,
    status,
    events: [...i.events, makeEvent(type, note?.trim() || undefined, paypalOrderId)],
  }));
}
