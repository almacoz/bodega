import { describe, expect, it } from "vitest";
import {
  addIntention,
  addProductReference,
  applyAction,
  decideLink,
  emptyMemory,
  removeIntention,
  removeProductReference,
  selectProductForIntention,
} from "../lib/memory";
import { laptop, tablet } from "./fixtures";

describe("memory updates", () => {
  it("captures an intention with its first event", () => {
    const { memory, id } = addIntention(emptyMemory(), "a laptop", laptop);
    const i = memory.intentions.find((x) => x.id === id)!;
    expect(i.status).toBe("waiting");
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
    expect(reconsidered.intentions[0].status).toBe("waiting");
    const archived = applyAction(reconsidered, id, "archive", "fulfilled");
    expect(archived.intentions[0].status).toBe("let_go");
    const reopened = applyAction(archived, id, "continue");
    expect(reopened.intentions[0].status).toBe("waiting");
    expect(reopened.intentions[0].events.map((e) => e.type)).toEqual(["captured", "reconsidered", "archived", "continued"]);
    expect(memory.intentions[0].events).toHaveLength(1); // immutable updates
  });

  it("supports adding, selecting, and removing product references", () => {
    const { memory, id } = addIntention(emptyMemory(), "a laptop", laptop);

    // 1. Add first product
    const { memory: mWithProd1, product: prod1 } = addProductReference(memory, id, {
      name: "MacBook Air M3",
      price: 1099,
      currency: "USD",
      merchant: "Apple Store",
      source: "manual",
    });
    const i1 = mWithProd1.intentions.find((x) => x.id === id)!;
    expect(i1.products).toHaveLength(1);
    expect(i1.products![0].name).toBe("MacBook Air M3");
    expect(i1.selectedProductId).toBeUndefined(); // Selection is always explicit
    expect(i1.events.at(-1)).toMatchObject({
      type: "product_added",
      productId: prod1.id,
      productName: "MacBook Air M3",
    });

    // 2. Add second product
    const { memory: mWithProd2, product: prod2 } = addProductReference(mWithProd1, id, {
      name: "Dell XPS 13",
      price: 999,
      currency: "USD",
      merchant: "Dell Direct",
      source: "channel3",
    });
    const i2 = mWithProd2.intentions.find((x) => x.id === id)!;
    expect(i2.products).toHaveLength(2);
    expect(i2.selectedProductId).toBeUndefined();

    // 3. Select second product
    const mSelected = selectProductForIntention(mWithProd2, id, prod2.id);
    const iSelected = mSelected.intentions.find((x) => x.id === id)!;
    expect(iSelected.selectedProductId).toBe(prod2.id);
    expect(iSelected.events.at(-1)).toMatchObject({
      type: "product_selected",
      productId: prod2.id,
      productName: "Dell XPS 13",
    });

    // 4. Remove second product -> leaves selection unset until user chooses again
    const mRemoved = removeProductReference(mSelected, id, prod2.id);
    const iRemoved = mRemoved.intentions.find((x) => x.id === id)!;
    expect(iRemoved.products).toHaveLength(1);
    expect(iRemoved.products![0].id).toBe(prod1.id);
    expect(iRemoved.selectedProductId).toBeUndefined();
    expect(iRemoved.events.at(-1)).toMatchObject({
      type: "product_removed",
      productId: prod2.id,
    });
  });

  it("records purchase events with productId and productName", () => {
    const { memory, id } = addIntention(emptyMemory(), "a laptop", laptop);
    const { memory: mWithProd, product } = addProductReference(memory, id, {
      name: "MacBook Air M3",
      price: 1099,
      currency: "USD",
      merchant: "Apple",
      source: "url",
    });

    const purchased = applyAction(
      mWithProd,
      id,
      "purchase",
      "Purchased MacBook Air M3 via PayPal Sandbox for USD 1099",
      "ORDER-PAYPAL-999",
      product.id,
      product.name,
    );

    const i = purchased.intentions.find((x) => x.id === id)!;
    expect(i.status).toBe("bought");
    const purchaseEvent = i.events.find((e) => e.type === "purchased");
    expect(purchaseEvent).toBeDefined();
    expect(purchaseEvent?.paypalOrderId).toBe("ORDER-PAYPAL-999");
    expect(purchaseEvent?.productId).toBe(product.id);
    expect(purchaseEvent?.productName).toBe("MacBook Air M3");
  });

  it("records unsure silently without adding history and undoes intentions cleanly", () => {
    const a = addIntention(emptyMemory(), "a laptop", laptop);
    const b = addIntention(a.memory, "a tablet", tablet);
    const unsure = decideLink(b.memory, a.id, b.id, "unsure");
    expect(Object.values(unsure.links)).toEqual(["unsure"]);
    expect(unsure.intentions[0].events).toHaveLength(1);
    expect(unsure.intentions[1].events).toHaveLength(1);

    const undone = removeIntention(unsure, b.id);
    expect(undone.intentions).toHaveLength(1);
    expect(undone.links).toEqual({});
  });
});
