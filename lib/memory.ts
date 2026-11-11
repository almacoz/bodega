import { pairKey } from "./link";
import type { Action, EventType, IntentEvent, Intention, Interpretation, LinkState, Memory, ProductReference } from "./types";
import { now } from "./clock";

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const emptyMemory = (): Memory => ({ intentions: [], links: {} });

function makeEvent(
  type: EventType,
  note?: string,
  paypalOrderId?: string,
  productId?: string,
  productName?: string,
): IntentEvent {
  return {
    id: uid(),
    at: now().toISOString(),
    type,
    ...(note ? { note } : {}),
    ...(paypalOrderId ? { paypalOrderId } : {}),
    ...(productId ? { productId } : {}),
    ...(productName ? { productName } : {}),
  };
}

function mapIntention(m: Memory, id: string, fn: (i: Intention) => Intention): Memory {
  return { ...m, intentions: m.intentions.map((i) => (i.id === id ? fn(i) : i)) };
}

/**
 * Records the person's answer about a suggested link. "unsure" is remembered
 * (so WhyBuy doesn't ask again) but is not a decision, so it adds no history.
 * Re-deciding the same state is a no-op.
 */
export function decideLink(m: Memory, aId: string, bId: string, state: LinkState): Memory {
  const a = m.intentions.find((i) => i.id === aId);
  const b = m.intentions.find((i) => i.id === bId);
  const key = pairKey(aId, bId);
  if (!a || !b || m.links[key] === state) return m;
  const next: Memory = { ...m, links: { ...m.links, [key]: state } };
  if (state === "unsure") return next;
  const type: EventType = state === "confirmed" ? "link_confirmed" : "link_dismissed";
  const withA = mapIntention(next, aId, (i) => ({ ...i, events: [...i.events, makeEvent(type, b.interpretation.subject)] }));
  return mapIntention(withA, bId, (i) => ({ ...i, events: [...i.events, makeEvent(type, a.interpretation.subject)] }));
}

/** Undo for a just-remembered intention: removes it and any answers, reminders, or notifications about it. */
export function removeIntention(m: Memory, id: string): Memory {
  const links = Object.fromEntries(Object.entries(m.links).filter(([k]) => !k.split("~").includes(id)));
  return {
    ...m,
    intentions: m.intentions.filter((i) => i.id !== id),
    links,
    ...(m.reminders ? { reminders: m.reminders.filter((r) => r.intentionId !== id) } : {}),
    ...(m.notifications
      ? { notifications: m.notifications.filter((n) => n.intentionId !== id && n.relatedIntentionId !== id) }
      : {}),
  };
}

/** `decisions` maps otherId -> the user's call on a suggested link, made during review. */
export function addIntention(
  m: Memory,
  rawText: string,
  interpretation: Interpretation,
  decisions: Record<string, LinkState> = {},
  options: { waitDays?: 0 | 1 | 3 | 7; source?: "human" | "agent" } = {},
): { memory: Memory; id: string } {
  const captured = makeEvent("captured");
  const waitDays = options.waitDays ?? 3;
  const id = uid();
  const intention: Intention = {
    id,
    rawText,
    interpretation,
    status: waitDays === 0 ? "ready" : "waiting",
    source: options.source ?? "human",
    waitDays,
    waitUntil: new Date(Date.parse(captured.at) + waitDays * 86_400_000).toISOString(),
    checkins: [],
    createdAt: captured.at,
    events: [captured],
    products: [],
  };
  let next: Memory = { ...m, intentions: [...m.intentions, intention] };
  for (const [otherId, state] of Object.entries(decisions)) next = decideLink(next, intention.id, otherId, state);
  return { memory: next, id: intention.id };
}

export function updateIntentionInterpretation(m: Memory, id: string, interpretation: Interpretation): Memory {
  return mapIntention(m, id, (i) => ({ ...i, interpretation, reasonType: interpretation.reasonType, reflection: interpretation.reflection }));
}

export function addReflectionNote(m: Memory, id: string, note: string): Memory {
  const clean = note.trim();
  return clean ? mapIntention(m, id, (i) => ({ ...i, events: [...i.events, makeEvent("continued", `Reflection: ${clean}`)] })) : m;
}

const ACTIONS: Record<Action, { status: Intention["status"]; type: EventType }> = {
  continue: { status: "waiting", type: "continued" },
  reconsider: { status: "waiting", type: "reconsidered" },
  archive: { status: "let_go", type: "archived" },
  purchase: { status: "bought", type: "purchased" },
};

export function applyAction(
  m: Memory,
  id: string,
  action: Action,
  note?: string,
  paypalOrderId?: string,
  productId?: string,
  productName?: string,
  payment?: { amount: number; currency: string },
): Memory {
  const { status, type } = ACTIONS[action];
  const event = makeEvent(type, note?.trim() || undefined, paypalOrderId, productId, productName);
  if (payment) Object.assign(event, { amount: payment.amount, currency: payment.currency });
  let next = mapIntention(m, id, (i) => ({ ...i, status, events: [...i.events, event] }));
  if (action === "archive" || action === "purchase") {
    if (next.reminders) {
      next = { ...next, reminders: next.reminders.filter((r) => r.intentionId !== id) };
    }
    if (next.notifications) {
      next = {
        ...next,
        notifications: next.notifications.map((n) =>
          n.type === "decision_reminder" && n.intentionId === id && n.status === "unread"
            ? { ...n, status: "dismissed" }
            : n,
        ),
      };
    }
  }
  return next;
}

export function recordPayPalPurchase(
  m: Memory,
  intentionId: string,
  data: { orderId: string; captureId: string; capturedAt: string; amount: number; currency: string },
): Memory {
  const bought = applyAction(m, intentionId, "purchase", "Paid with PayPal", data.orderId, undefined, undefined, { amount: data.amount, currency: data.currency });
  return mapIntention(bought, intentionId, (i) => ({
    ...i,
    status: "bought",
    paypalOrderId: data.orderId,
    paypal: { captureId: data.captureId, capturedAt: data.capturedAt },
    price: { value: String(data.amount), currency: data.currency },
  }));
}

/** Associates a new product reference with an intention. Choosing one to go ahead with is always explicit. */
export function addProductReference(
  m: Memory,
  intentionId: string,
  product: Omit<ProductReference, "id" | "addedAt">,
): { memory: Memory; product: ProductReference } {
  const newProduct: ProductReference = {
    ...product,
    id: uid(),
    addedAt: now().toISOString(),
  };
  const event = makeEvent("product_added", newProduct.name, undefined, newProduct.id, newProduct.name);
  const memory = mapIntention(m, intentionId, (i) => ({
    ...i,
    products: [...(i.products ?? []), newProduct],
    events: [...i.events, event],
  }));
  return { memory, product: newProduct };
}

/** Removes a product reference from an intention. */
export function removeProductReference(m: Memory, intentionId: string, productId: string): Memory {
  const intention = m.intentions.find((i) => i.id === intentionId);
  const prod = intention?.products?.find((p) => p.id === productId);
  const event = makeEvent("product_removed", prod?.name ?? productId, undefined, productId, prod?.name);
  return mapIntention(m, intentionId, (i) => {
    const remaining = (i.products ?? []).filter((p) => p.id !== productId);
    return {
      ...i,
      products: remaining,
      selectedProductId: i.selectedProductId === productId ? undefined : i.selectedProductId,
      events: [...i.events, event],
    };
  });
}

/** Selects or deselects a product as the candidate to purchase. */
export function selectProductForIntention(m: Memory, intentionId: string, productId: string | null): Memory {
  const intention = m.intentions.find((i) => i.id === intentionId);
  const prod = productId ? intention?.products?.find((p) => p.id === productId) : null;
  const event = productId
    ? makeEvent("product_selected", prod?.name ?? productId, undefined, productId, prod?.name)
    : null;
  return mapIntention(m, intentionId, (i) => ({
    ...i,
    selectedProductId: productId ?? undefined,
    events: event ? [...i.events, event] : i.events,
  }));
}
