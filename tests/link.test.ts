import { describe, expect, it } from "vitest";
import { findRelated, pairKey, reflectionPrompt } from "../lib/link";
import { addIntention, emptyMemory } from "../lib/memory";
import { headphones, laptop, tablet } from "./fixtures";

const withLaptop = () => addIntention(emptyMemory(), "I want a laptop for development", laptop);

describe("findRelated", () => {
  it("links a tablet to an earlier laptop through shared needs", () => {
    const { memory } = withLaptop();
    const [r] = findRelated(tablet, memory);
    expect(r.intention.interpretation.subject).toBe("laptop");
    expect(r.sharedNeeds).toEqual(["portability", "software-development"]);
    expect(r.sameCategory).toBe(true);
    expect(r.strength).toBe("strong");
  });

  it("ignores unrelated intentions and itself", () => {
    const { memory, id } = withLaptop();
    expect(findRelated(headphones, memory)).toEqual([]);
    expect(findRelated(laptop, memory, id)).toEqual([]);
  });

  it("reports the stored decision for a pair", () => {
    const { memory, id } = withLaptop();
    const two = addIntention(memory, "a tablet", tablet);
    const withDismissal = { ...two.memory, links: { [pairKey(id, two.id)]: "dismissed" as const } };
    expect(findRelated(tablet, withDismissal, two.id)[0].decision).toBe("dismissed");
  });
});

describe("reflectionPrompt", () => {
  it("is a question in the user's language", () => {
    const [r] = findRelated(tablet, withLaptop().memory);
    expect(reflectionPrompt(tablet, r)).toContain("What would “tablet” give you that “laptop” doesn’t?");
    expect(reflectionPrompt({ ...tablet, language: "es" }, r)).toContain("¿Qué te daría “tablet”");
  });
});
