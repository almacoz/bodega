import { describe, expect, it } from "vitest";
import { addIntention, applyAction, decideLink, emptyMemory } from "../lib/memory";
import { laptop, tablet } from "./fixtures";

describe("memory updates", () => {
  it("captures an intention with its first event", () => {
    const { memory, id } = addIntention(emptyMemory(), "a laptop", laptop);
    const i = memory.intentions.find((x) => x.id === id)!;
    expect(i.status).toBe("active");
    expect(i.events.map((e) => e.type)).toEqual(["captured"]);
  });

  it("applies review-time link decisions to both intentions", () => {
    const first = addIntention(emptyMemory(), "a laptop", laptop);
    const second = addIntention(first.memory, "a tablet", tablet, { [first.id]: "confirmed" });
    const [a, b] = second.memory.intentions;
    expect(a.events.at(-1)).toMatchObject({ type: "link_confirmed", note: "tablet" });
    expect(b.events.at(-1)).toMatchObject({ type: "link_confirmed", note: "laptop" });
    expect(Object.values(second.memory.links)).toEqual(["confirmed"]);
  });

  it("re-deciding the same link state changes nothing", () => {
    const a = addIntention(emptyMemory(), "a laptop", laptop);
    const b = addIntention(a.memory, "a tablet", tablet);
    const once = decideLink(b.memory, a.id, b.id, "dismissed");
    expect(decideLink(once, a.id, b.id, "dismissed")).toBe(once);
  });

  it("moves status and appends history for reconsider, archive and continue", () => {
    const { memory, id } = addIntention(emptyMemory(), "a laptop", laptop);
    const reconsidered = applyAction(memory, id, "reconsider", "Do I need it if I get a tablet?");
    expect(reconsidered.intentions[0].status).toBe("reconsidering");
    const archived = applyAction(reconsidered, id, "archive", "fulfilled");
    expect(archived.intentions[0].status).toBe("archived");
    const reopened = applyAction(archived, id, "continue");
    expect(reopened.intentions[0].status).toBe("active");
    expect(reopened.intentions[0].events.map((e) => e.type)).toEqual(["captured", "reconsidered", "archived", "continued"]);
    expect(memory.intentions[0].events).toHaveLength(1); // immutable updates
  });
});
