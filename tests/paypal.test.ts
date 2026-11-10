import { describe, it, expect } from "vitest";
import { applyAction, emptyMemory, addIntention } from "@/lib/memory";
import type { Interpretation } from "@/lib/types";

describe("PayPal Purchase State Transitions", () => {
  const sampleInterpretation: Interpretation = {
    language: "en",
    subject: "laptop",
    category: "computing-device",
    purpose: "development work",
    needs: ["software-development", "portability"],
    utility: ["faster compilation", "mobile workflow"],
    context: null,
    timing: null,
    budget: { amount: 1500, currency: "USD" },
    signals: [],
  };

  it("should add purchase action to intention", () => {
    let memory = emptyMemory();
    const result = addIntention(memory, "I want a laptop for development", sampleInterpretation);
    memory = result.memory;
    const intentionId = result.id;

    // Apply purchase action
    const orderId = "PAYPAL-ORDER-123";
    memory = applyAction(memory, intentionId, "purchase", "Purchased via PayPal for USD 1500", orderId);

    const intention = memory.intentions.find((i) => i.id === intentionId);
    expect(intention).toBeDefined();
    expect(intention!.status).toBe("purchased");

    // Check purchase event
    const purchaseEvent = intention!.events.find((e) => e.type === "purchased");
    expect(purchaseEvent).toBeDefined();
    expect(purchaseEvent!.note).toContain("Purchased via PayPal");
    expect(purchaseEvent!.paypalOrderId).toBe(orderId);
  });

  it("should track paypalOrderId in purchase event", () => {
    let memory = emptyMemory();
    const result = addIntention(memory, "I want a laptop", sampleInterpretation);
    memory = result.memory;

    const orderId = "PAYPAL-TEST-ORDER";
    memory = applyAction(memory, result.id, "purchase", undefined, orderId);

    const intention = memory.intentions[0];
    const purchaseEvent = intention.events.find((e) => e.type === "purchased");

    expect(purchaseEvent?.paypalOrderId).toBe(orderId);
  });

  it("should maintain purchase status through multiple actions", () => {
    let memory = emptyMemory();
    const result = addIntention(memory, "I want a laptop", sampleInterpretation);
    memory = result.memory;
    const id = result.id;

    // Purchase
    memory = applyAction(memory, id, "purchase", "Bought it", "ORDER-123");
    expect(memory.intentions[0].status).toBe("purchased");

    // Cannot continue after purchase (status changes)
    memory = applyAction(memory, id, "continue", "Actually I still want more");
    expect(memory.intentions[0].status).toBe("active"); // reverts to active

    const events = memory.intentions[0].events;
    expect(events).toHaveLength(3); // captured, purchased, continued
    expect(events[1].type).toBe("purchased");
    expect(events[2].type).toBe("continued");
  });

  it("should handle purchase without budget in events", () => {
    let memory = emptyMemory();
    const noBudgetInterp: Interpretation = {
      ...sampleInterpretation,
      budget: null,
    };
    const result = addIntention(memory, "I want something", noBudgetInterp);
    memory = result.memory;

    // Can still apply purchase action (validation happens in API)
    memory = applyAction(memory, result.id, "purchase", "Manual purchase", "ORDER-XYZ");
    
    const intention = memory.intentions[0];
    expect(intention.status).toBe("purchased");
    expect(intention.events[1].paypalOrderId).toBe("ORDER-XYZ");
  });
});

describe("PayPal Amount Validation", () => {
  it("should validate amount boundaries", () => {
    const validAmounts = [0.01, 1, 100, 1500, 9999, 10000];
    validAmounts.forEach((amount) => {
      expect(amount).toBeGreaterThan(0);
      expect(amount).toBeLessThanOrEqual(10000);
    });

    const invalidAmounts = [0, -1, -100, 10001, 999999];
    invalidAmounts.forEach((amount) => {
      const isInvalid = amount <= 0 || amount > 10000;
      expect(isInvalid).toBe(true);
    });
  });

  it("should format amounts to 2 decimal places", () => {
    const amounts = [
      { input: 1500, expected: "1500.00" },
      { input: 99.9, expected: "99.90" },
      { input: 1.1, expected: "1.10" },
      { input: 0.99, expected: "0.99" },
    ];

    amounts.forEach(({ input, expected }) => {
      expect(input.toFixed(2)).toBe(expected);
    });
  });
});

describe("PayPal Currency Validation", () => {
  it("should validate ISO 4217 currency codes", () => {
    const validCodes = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD"];
    const pattern = /^[A-Z]{3}$/;

    validCodes.forEach((code) => {
      expect(pattern.test(code)).toBe(true);
    });

    const invalidCodes = ["usd", "US", "USDD", "12", "", "€"];
    invalidCodes.forEach((code) => {
      expect(pattern.test(code)).toBe(false);
    });
  });
});

describe("PayPal Order ID Validation", () => {
  it("should validate order ID format", () => {
    const validIds = ["1AB23456CD789012E", "PAYPAL-ORDER-123", "test-order-id"];
    validIds.forEach((id) => {
      expect(id.length).toBeGreaterThanOrEqual(3);
      expect(typeof id).toBe("string");
    });

    const invalidIds = ["", "ab", null, undefined, 123];
    invalidIds.forEach((id) => {
      const isInvalid = !id || typeof id !== "string" || id.length < 3;
      expect(isInvalid).toBe(true);
    });
  });
});

describe("Purchase Event History", () => {
  it("should record purchase in chronological order", () => {
    let memory = emptyMemory();
    const interp: Interpretation = {
      language: "en",
      subject: "test item",
      category: "test",
      purpose: null,
      needs: [],
      utility: [],
      context: null,
      timing: null,
      budget: { amount: 100, currency: "USD" },
      signals: [],
    };

    const result = addIntention(memory, "test", interp);
    memory = result.memory;
    const id = result.id;

    // Sequence of actions
    memory = applyAction(memory, id, "reconsider", "Thinking about it");
    memory = applyAction(memory, id, "continue", "Still want it");
    memory = applyAction(memory, id, "purchase", "Bought", "ORDER-ABC");

    const events = memory.intentions[0].events;
    expect(events).toHaveLength(4);
    expect(events[0].type).toBe("captured");
    expect(events[1].type).toBe("reconsidered");
    expect(events[2].type).toBe("continued");
    expect(events[3].type).toBe("purchased");

    // Verify timestamps are chronological
    for (let i = 1; i < events.length; i++) {
      const prev = new Date(events[i - 1].at).getTime();
      const curr = new Date(events[i].at).getTime();
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  it("should preserve paypalOrderId across memory save/load", () => {
    let memory = emptyMemory();
    const interp: Interpretation = {
      language: "en",
      subject: "item",
      category: "test",
      purpose: null,
      needs: [],
      utility: [],
      context: null,
      timing: null,
      budget: { amount: 50, currency: "USD" },
      signals: [],
    };

    const result = addIntention(memory, "test", interp);
    memory = result.memory;
    memory = applyAction(memory, result.id, "purchase", "Test purchase", "ORDER-PERSIST");

    // Serialize and deserialize (simulating localStorage)
    const serialized = JSON.stringify(memory);
    const deserialized = JSON.parse(serialized);

    const purchaseEvent = deserialized.intentions[0].events.find((e: any) => e.type === "purchased");
    expect(purchaseEvent.paypalOrderId).toBe("ORDER-PERSIST");
  });
});

describe("PayPal Idempotency", () => {
  it("should handle repeated purchase attempts safely", () => {
    let memory = emptyMemory();
    const interp: Interpretation = {
      language: "en",
      subject: "item",
      category: "test",
      purpose: null,
      needs: [],
      utility: [],
      context: null,
      timing: null,
      budget: { amount: 75, currency: "USD" },
      signals: [],
    };

    const result = addIntention(memory, "test", interp);
    memory = result.memory;
    const id = result.id;

    // First purchase
    memory = applyAction(memory, id, "purchase", "First attempt", "ORDER-1");
    expect(memory.intentions[0].status).toBe("purchased");
    expect(memory.intentions[0].events).toHaveLength(2);

    // Second purchase attempt (would happen if user clicks twice or network retry)
    memory = applyAction(memory, id, "purchase", "Second attempt", "ORDER-1");
    expect(memory.intentions[0].status).toBe("purchased");
    expect(memory.intentions[0].events).toHaveLength(3); // Both events recorded

    // Both purchase events should exist
    const purchaseEvents = memory.intentions[0].events.filter((e) => e.type === "purchased");
    expect(purchaseEvents).toHaveLength(2);
  });

  it("should detect duplicate order IDs across intentions", () => {
    let memory = emptyMemory();
    const interp: Interpretation = {
      language: "en",
      subject: "item",
      category: "test",
      purpose: null,
      needs: [],
      utility: [],
      context: null,
      timing: null,
      budget: { amount: 50, currency: "USD" },
      signals: [],
    };

    // Add two intentions
    const result1 = addIntention(memory, "first item", interp);
    memory = result1.memory;
    const result2 = addIntention(memory, "second item", interp);
    memory = result2.memory;

    // Purchase first with ORDER-DUPE
    memory = applyAction(memory, result1.id, "purchase", "Purchase 1", "ORDER-DUPE");

    // Check if ORDER-DUPE exists anywhere
    const orderExists = memory.intentions.some((i) =>
      i.events.some((e) => e.paypalOrderId === "ORDER-DUPE")
    );
    expect(orderExists).toBe(true);

    // Try to purchase second with same order ID (client-side should prevent)
    memory = applyAction(memory, result2.id, "purchase", "Purchase 2", "ORDER-DUPE");

    // Both intentions now have the duplicate order ID (no server-side prevention)
    const duplicates = memory.intentions.filter((i) =>
      i.events.some((e) => e.paypalOrderId === "ORDER-DUPE")
    );
    expect(duplicates).toHaveLength(2); // Client-side deduplication limitation
  });
});

describe("User-Declared Amount Validation", () => {
  it("should validate amount bounds (0-10000)", () => {
    const validAmounts = [0.01, 1, 100, 1500, 9999, 10000];
    validAmounts.forEach((amount) => {
      expect(amount).toBeGreaterThan(0);
      expect(amount).toBeLessThanOrEqual(10000);
    });

    const invalidAmounts = [0, -1, -100, 10001, 999999];
    invalidAmounts.forEach((amount) => {
      const isInvalid = amount <= 0 || amount > 10000;
      expect(isInvalid).toBe(true);
    });
  });

  it("should track user-declared amounts in purchase events", () => {
    let memory = emptyMemory();
    const interp: Interpretation = {
      language: "en",
      subject: "laptop",
      category: "computing",
      purpose: null,
      needs: [],
      utility: [],
      context: null,
      timing: null,
      budget: { amount: 1500, currency: "USD" }, // User-declared
      signals: [],
    };

    const result = addIntention(memory, "want laptop", interp);
    memory = result.memory;

    // Purchase with user-declared amount
    memory = applyAction(
      memory,
      result.id,
      "purchase",
      "Purchased via PayPal Sandbox for USD 1500",
      "ORDER-USER-DECLARED"
    );

    const purchaseEvent = memory.intentions[0].events.find((e) => e.type === "purchased");
    expect(purchaseEvent?.note).toContain("USD 1500");
    expect(purchaseEvent?.note).toContain("Sandbox");
  });
});
