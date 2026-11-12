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
  reasonType?: ReasonType;
  reflection?: string;
  hasReason?: boolean;
}

export type IntentStatus = "waiting" | "ready" | "bought" | "let_go";
export type Status = "active" | "reconsidering" | "archived" | "purchased";
export type Action = "continue" | "reconsider" | "archive" | "purchase";

/** The person's answer to "Are you trying to solve the same problem?" */
export type LinkState = "confirmed" | "dismissed" | "unsure";

export type EventType =
  | "captured"
  | "continued"
  | "reconsidered"
  | "archived"
  | "purchased"
  | "link_confirmed"
  | "link_dismissed"
  | "product_added"
  | "product_selected"
  | "product_removed";

export interface ProductReference {
  id: string;
  name: string;
  price?: number;
  currency?: string;
  merchant?: string;
  url?: string;
  imageUrl?: string;
  source: "channel3" | "url" | "manual";
  addedAt: string;
}

export interface IntentEvent {
  id: string;
  at: string; // ISO
  type: EventType;
  note?: string;
  paypalOrderId?: string; // for purchase events
  productId?: string;
  productName?: string;
  /** Verified by PayPal on capture. Sandbox only: a test payment, never a merchant order. */
  amount?: number;
  currency?: string;
}

export interface Intention {
  id: string;
  rawText: string;
  interpretation: Interpretation;
  status: Status | IntentStatus;
  source: "human" | "agent";
  waitDays: 0 | 1 | 3 | 7;
  waitUntil: string;
  checkins: Checkin[];
  reasonType?: ReasonType;
  reflection?: string;
  price?: { value: string; currency: string };
  paypalOrderId?: string;
  paypal?: { captureId?: string; capturedAt?: string };
  createdAt: string;
  events: IntentEvent[]; // the history lives with the intention
  products?: ProductReference[];
  selectedProductId?: string;
  /** Real store prices for this kind of item (Channel3), taken when the intention was saved. */
  priceScan?: PriceScan;
}

export interface PriceScan {
  low: number;
  typical: number;
  high: number;
  currency: string;
  count: number;
  at: string;
}

export type ReasonType = "emotional" | "functional" | "mixed";
export interface Checkin {
  at: string;
  stillWant: boolean;
}

export type NotificationType = "memory_recall" | "decision_reminder";
export type NotificationStatus = "unread" | "read" | "dismissed";

export interface AppNotification {
  id: string;
  type: NotificationType;
  intentionId: string;
  relatedIntentionId?: string;
  reminderId?: string;
  title: string;
  message: string;
  createdAt: string; // ISO 8601
  dueAt?: string; // ISO 8601
  status: NotificationStatus;
  response?: string;
}

export interface DecisionReminder {
  id: string;
  intentionId: string;
  dueAt: string; // ISO 8601
  createdAt: string; // ISO 8601
}

export interface NotificationPreferences {
  memoryRecall: boolean;
  decisionReminders: boolean;
  browserNotifications: boolean;
}

/** Everything WhyBuy knows. One JSON blob in localStorage. */
export interface Memory {
  intentions: Intention[]; // chronological, oldest first
  links: Record<string, LinkState>; // key = pairKey(a, b)
  reminders?: DecisionReminder[];
  notifications?: AppNotification[];
  notificationPrefs?: NotificationPreferences;
}

/** An earlier intention that may solve the same problem, with the evidence for it. */
export interface Related {
  intention: Intention;
  sharedNeeds: string[]; // specific needs only; generic qualities never count
  sameCategory: boolean;
  sameSubject: boolean;
  decision: LinkState | null;
}
