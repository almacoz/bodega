/** Build-time feature flags. Recall (similar-intention memory) is the product's core, so it is on unless explicitly disabled. */
export const RECALL_ENABLED = process.env.NEXT_PUBLIC_RECALL_ENABLED !== "false";
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
