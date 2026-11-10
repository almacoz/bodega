import { emptyMemory } from "./memory";
import type { Memory } from "./types";

const KEY = "bodega:v1";

export function loadMemory(): Memory {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (parsed && Array.isArray(parsed.intentions)) return { intentions: parsed.intentions, links: parsed.links ?? {} };
  } catch {}
  return emptyMemory();
}

export function saveMemory(m: Memory) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {} // quota or private mode: the app keeps working in memory
}
