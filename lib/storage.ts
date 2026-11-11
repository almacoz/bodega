import { emptyMemory } from "./memory";
import { DEFAULT_NOTIFICATION_PREFS } from "./notifications";
import type { Intention, Memory } from "./types";
import { now } from "./clock";

const KEY = "whybuy:v1";

export function migrateMemory(parsed: Record<string, any>): Memory {
  const intentions: Intention[] = parsed.intentions.map((raw: Record<string, any>) => {
    const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : now().toISOString();
    const waitDays: 0 | 1 | 3 | 7 = raw.waitDays === 0 || raw.waitDays === 1 || raw.waitDays === 7 ? raw.waitDays : 3;
    const legacyMap: Record<string, string> = { active: "waiting", reconsidering: "waiting", archived: "let_go", purchased: "bought" };
    const interpretation = { ...(raw.interpretation ?? {}) };
    for (const field of ["purpose", "context", "timing", "reflection"] as const) {
      if (typeof interpretation[field] === "string" && interpretation[field].trim().toLowerCase() === "null") interpretation[field] = field === "reflection" ? undefined : null;
    }
    return {
      ...raw,
      interpretation,
      createdAt,
      status: typeof raw.status === "string" ? legacyMap[raw.status] ?? raw.status : "waiting",
      source: raw.source === "agent" ? "agent" : "human",
      waitDays,
      waitUntil: typeof raw.waitUntil === "string" ? raw.waitUntil : new Date(Date.parse(createdAt) + waitDays * 86_400_000).toISOString(),
      checkins: Array.isArray(raw.checkins) ? raw.checkins : [],
    } as Intention;
  });
  return {
    intentions,
    links: parsed.links ?? {},
    reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
    notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
    notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, ...(parsed.notificationPrefs ?? {}) },
  };
}

export function loadMemory(): Memory {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (parsed && Array.isArray(parsed.intentions)) {
      return migrateMemory(parsed);
    }
  } catch {}
  return emptyMemory();
}

export function saveMemory(m: Memory) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {} // quota or private mode: the app keeps working in memory
}
