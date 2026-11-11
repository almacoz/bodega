import { describe, expect, it } from "vitest";
import { findRelated, pairKey, recall, reflectionPrompt } from "../lib/link";
import { addIntention, emptyMemory } from "../lib/memory";
import type { Interpretation } from "../lib/types";
import { headphones, laptop, tablet } from "./fixtures";

const withLaptop = () => addIntention(emptyMemory(), "I want a laptop for development", laptop);

const make = (subject: string, category: string, needs: string[]): Interpretation => ({
  language: "en",
  subject,
  category,
  purpose: null,
  needs,
  utility: [],
  context: null,
  timing: null,
  budget: null,
  signals: [],
});

describe("findRelated & recall", () => {
  it("links a tablet to an earlier laptop through shared specific needs", () => {
    const { memory } = withLaptop();
    const [r] = findRelated(tablet, memory);
    expect(r.intention.interpretation.subject).toBe("laptop");
    expect(r.sharedNeeds).toEqual(["portability", "software-development"]);
    expect(r.sameCategory).toBe(true);
  });

  it("never links coffee, vitamin D, and a car just because they share generic or routine tags", () => {
    const coffee = make("coffee", "beverage", ["convenience", "daily-use", "morning-routine", "commuting", "energy"]);
    const vitaminD = make("vitamin D", "supplement", ["health", "convenience", "daily-use", "morning-routine"]);
    const car = make("car", "vehicle", ["financing", "convenience", "commuting", "morning-routine"]);

    let { memory } = addIntention(emptyMemory(), "coffee pod subscription", coffee);
    memory = addIntention(memory, "vitamin D capsules", vitaminD).memory;

    expect(findRelated(car, memory)).toEqual([]);
    expect(recall(car, memory)).toBeNull();
  });

  it("links joggers to earlier sweatpants when both serve exercise/athletic wear", () => {
    const sweatpants = make("pantalones deportivos", "sportswear", ["exercise", "athletic-wear"]);
    const joggers = make("joggers", "sportswear", ["walking", "exercise"]);
    const { memory, id } = addIntention(emptyMemory(), "Quiero comprar unos pantalones deportivos para hacer ejercicio", sweatpants);
    const match = recall(joggers, memory);
    expect(match).not.toBeNull();
    expect(match?.intention.id).toBe(id);
    expect(match?.sharedNeeds).toEqual(["exercise"]);
  });

  it("does not link two unrelated items in the same category when needs don't overlap", () => {
    const blender = make("blender", "kitchen-appliance", ["smoothies"]);
    const toaster = make("toaster", "kitchen-appliance", ["toasting-bread"]);
    const { memory } = addIntention(emptyMemory(), "a blender", blender);
    expect(findRelated(toaster, memory)).toEqual([]);
  });

  it("ignores unrelated intentions and itself", () => {
    const { memory, id } = withLaptop();
    expect(findRelated(headphones, memory)).toEqual([]);
    expect(findRelated(laptop, memory, id)).toEqual([]);
  });

  it("respects answered pairs so recall never asks twice", () => {
    const { memory, id } = withLaptop();
    const two = addIntention(memory, "a tablet", tablet);
    expect(recall(tablet, two.memory, two.id)?.intention.id).toBe(id);

    for (const answer of ["confirmed", "dismissed", "unsure"] as const) {
      const answered = { ...two.memory, links: { [pairKey(id, two.id)]: answer } };
      expect(recall(tablet, answered, two.id)).toBeNull();
    }
  });
});

describe("reflectionPrompt", () => {
  it("asks a direct question in the user's language", () => {
    const [r] = findRelated(tablet, withLaptop().memory);
    expect(reflectionPrompt(tablet, r, "en")).toContain("What would “tablet” give you that “laptop” doesn’t?");
    expect(reflectionPrompt(tablet, r, "es")).toContain("¿Qué te daría “tablet”");
  });
});
