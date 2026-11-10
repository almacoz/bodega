export type SignalKind = "urgency" | "doubt" | "enthusiasm" | "frustration" | "budget-pressure" | "curiosity";

/** A wording cue. Only exists if its quote appears in the original text. */
export interface Signal {
  kind: SignalKind;
  quote: string;
}

export interface Interpretation {
  language: "en" | "es";
  subject: string; // the thing wanted, in the user's language
  category: string; // kebab-case English tag: the kind of thing
  purpose: string | null; // in the user's language
  needs: string[]; // kebab-case English tags: the underlying needs (what links intentions)
  utility: string[];
  context: string | null;
  timing: string | null;
  budget: { amount: number; currency: string } | null;
  signals: Signal[];
}

export type Status = "active" | "reconsidering" | "archived" | "purchased";
export type Action = "continue" | "reconsider" | "archive" | "purchase";
export type LinkState = "confirmed" | "dismissed";
export type EventType = "captured" | "continued" | "reconsidered" | "archived" | "purchased" | "link_confirmed" | "link_dismissed";

export interface IntentEvent {
  id: string;
  at: string; // ISO
  type: EventType;
  note?: string;
  paypalOrderId?: string; // for purchase events
}

export interface Intention {
  id: string;
  rawText: string;
  interpretation: Interpretation;
  status: Status;
  createdAt: string;
  events: IntentEvent[]; // the history lives with the intention
}

/** Everything BODEGA knows. One JSON blob in localStorage. */
export interface Memory {
  intentions: Intention[]; // chronological, oldest first
  links: Record<string, LinkState>; // key = pairKey(a, b)
}

export interface Related {
  intention: Intention;
  sharedNeeds: string[];
  sameCategory: boolean;
  strength: "strong" | "possible";
  decision: LinkState | null;
}
