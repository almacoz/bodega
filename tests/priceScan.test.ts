import { describe, expect, it } from "vitest";
import { summarizePrices } from "@/lib/priceScan";

const at = "2026-11-11T12:00:00.000Z";

describe("summarizePrices", () => {
  it("ignores listings that only share a brand-like prefix (MAC cosmetics vs Mac mini)", () => {
    const scan = summarizePrices("Mac mini M4", [
      { name: "Apple Mac mini M4 16GB 256GB", price: 599, currency: "USD" },
      { name: "Apple Mac mini M4 10-Core CPU", price: 1159.99, currency: "USD" },
      { name: "Mac mini (2024) M4", price: 1338.99, currency: "USD" },
      { name: "MACStack Mascara", price: 13.6, currency: "USD" },
      { name: "Studio Radiance Concealer / Mini", price: 16, currency: "USD" },
    ], at);
    expect(scan).not.toBeNull();
    expect(scan!.low).toBe(599);
    expect(scan!.count).toBe(3);
  });

  it("requires model tokens like M4 to match", () => {
    expect(summarizePrices("Mac mini M4", [
      { name: "Apple Mac mini M4 16GB 256GB", price: 599 },
      { name: "Lipglass - Mini MAC, Clear", price: 19.5 },
      { name: "Mini MAC Nudes Lip Combo", price: 25 },
      { name: "Mac mini M2 refurbished", price: 399 },
    ], at)).toBeNull();
  });

  it("trims the extremes when there are enough offers", () => {
    const scan = summarizePrices("TV OLED", [
      { name: "LG OLED AI TV", price: 299.99 },
      { name: "OLED 4K UHD Smart Tizen TV", price: 1197.99 },
      { name: "Lg Oled Evo C3 Smart Oled Tv", price: 2554.85 },
      { name: "Sony Bravia OLED TV", price: 1799 },
      { name: "Loewe Stellar 4K OLED Smart TV", price: 6495 },
    ], at);
    expect(scan).toEqual({ low: 1197.99, typical: 1799, high: 2554.85, currency: "USD", count: 5, at });
  });

  it("returns nothing when fewer than three listings match", () => {
    expect(summarizePrices("Mountain bike", [
      { name: "Trek Marlin 5 mountain bike", price: 699 },
      { name: "Bike helmet", price: 49 },
      { name: "Water bottle", price: 9 },
    ], at)).toBeNull();
  });

  it("skips unpriced listings and other currencies", () => {
    expect(summarizePrices("Kindle Paperwhite", [
      { name: "Kindle Paperwhite 16GB", price: 149, currency: "USD" },
      { name: "Kindle Paperwhite Signature", price: 189, currency: "USD" },
      { name: "Kindle Paperwhite Kids", price: undefined, currency: "USD" },
      { name: "Kindle Paperwhite", price: 160, currency: "EUR" },
    ], at)).toBeNull();
  });
});
