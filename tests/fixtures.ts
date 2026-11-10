import type { Interpretation } from "../lib/types";

const base: Interpretation = {
  language: "en", subject: "", category: "other", purpose: null, needs: [], utility: [],
  context: null, timing: null, budget: null, signals: [],
};

export const laptop: Interpretation = {
  ...base, subject: "laptop", category: "computing-device", purpose: "write code while commuting",
  needs: ["software-development", "portability"], budget: { amount: 1500, currency: "USD" },
};

export const tablet: Interpretation = {
  ...base, subject: "tablet", category: "computing-device", purpose: "code on the go and take notes",
  needs: ["portability", "software-development", "note-taking"],
};

export const headphones: Interpretation = {
  ...base, subject: "headphones", category: "audio-gear", needs: ["focus", "music"],
};
