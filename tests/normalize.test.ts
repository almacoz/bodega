import { describe, expect, it } from "vitest";
import { normalizeInterpretation, toTag } from "../lib/normalize";

describe("toTag", () => {
  it("lowercases, strips accents and kebab-cases", () => {
    expect(toTag("Portabilidad móvil!")).toBe("portabilidad-movil");
    expect(toTag("  Software Development ")).toBe("software-development");
    expect(toTag(42)).toBe("");
  });
});

describe("normalizeInterpretation", () => {
  const text = "Quiero una laptop para programar en el metro. Me urge, tengo un presupuesto de $1500";

  it("cleans messy LLM output (Spanish input, English tags)", () => {
    const i = normalizeInterpretation(
      {
        language: "es", subject: " laptop ", category: "Computing Device",
        needs: ["Software Development", "software-development", "Portability", "", 7],
        budget: { amount: "1500", currency: "usd" },
        signals: [{ kind: "urgency", quote: "me urge" }],
      },
      text,
    );
    expect(i.subject).toBe("laptop");
    expect(i.category).toBe("computing-device");
    expect(i.needs).toEqual(["software-development", "portability"]);
    expect(i.budget).toEqual({ amount: 1500, currency: "USD" });
    expect(i.language).toBe("es");
  });

  it("keeps a signal only when its quote is in the text, using the user's exact wording", () => {
    const i = normalizeInterpretation(
      { subject: "laptop", signals: [{ kind: "urgency", quote: "me urge" }, { kind: "doubt", quote: "no sé si" }] },
      text,
    );
    expect(i.signals).toEqual([{ kind: "urgency", quote: "Me urge" }]);
  });

  it("drops bad budgets and rejects output without a subject", () => {
    expect(normalizeInterpretation({ subject: "x", budget: { amount: -5, currency: "USD" } }, "x").budget).toBeNull();
    expect(() => normalizeInterpretation({ purpose: "hello" }, "hello")).toThrow("no-subject");
  });
});
