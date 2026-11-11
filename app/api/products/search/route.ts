import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SAMPLE_CATALOG = [
  {
    name: "MacBook Air 13-inch M3",
    price: 1099,
    currency: "USD",
    merchant: "Apple Store",
    url: "https://www.apple.com/shop/buy-mac/macbook-air",
    imageUrl: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=400&q=80",
    source: "channel3" as const,
  },
  {
    name: "Dell XPS 13 (2024)",
    price: 999,
    currency: "USD",
    merchant: "Dell Official",
    url: "https://www.dell.com/en-us/shop/dell-laptops/xps-13",
    imageUrl: "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=400&q=80",
    source: "channel3" as const,
  },
  {
    name: "Lenovo ThinkPad T14s Gen 4",
    price: 1149,
    currency: "USD",
    merchant: "Lenovo",
    url: "https://www.lenovo.com/thinkpad-t14s",
    imageUrl: "https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&w=400&q=80",
    source: "channel3" as const,
  },
  {
    name: "Sony WH-1000XM5 Wireless Headphones",
    price: 399,
    currency: "USD",
    merchant: "Sony Store",
    url: "https://electronics.sony.com/audio/headphones/headband/p/wh1000xm5-b",
    imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=400&q=80",
    source: "channel3" as const,
  },
  {
    name: "Kindle Paperwhite (16 GB)",
    price: 149,
    currency: "USD",
    merchant: "Amazon",
    url: "https://www.amazon.com/dp/B09TMN58KL",
    imageUrl: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80",
    source: "channel3" as const,
  },
  {
    name: "LG UltraFine 27-inch 4K Monitor",
    price: 449,
    currency: "USD",
    merchant: "Best Buy",
    url: "https://www.bestbuy.com/site/lg-27-ultrafine",
    imageUrl: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=400&q=80",
    source: "channel3" as const,
  },
  {
    name: "Adidas Adicolor Relaxed Joggers",
    price: 75,
    currency: "USD",
    merchant: "Adidas",
    url: "https://www.adidas.com/us/adicolor-joggers",
    imageUrl: "https://images.unsplash.com/photo-1552902865-b72c031ac5ea?auto=format&fit=crop&w=400&q=80",
    source: "channel3" as const,
  },
  {
    name: "Nike Dri-FIT Running Pants",
    price: 85,
    currency: "USD",
    merchant: "Nike",
    url: "https://www.nike.com/t/dri-fit-running-pants",
    imageUrl: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=400&q=80",
    source: "channel3" as const,
  },
  {
    name: "Brooks Ghost 16 Running Shoes",
    price: 140,
    currency: "USD",
    merchant: "REI",
    url: "https://www.rei.com/product/brooks-ghost-16",
    imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=80",
    source: "channel3" as const,
  },
  {
    name: "iPad Air 11-inch (M2)",
    price: 599,
    currency: "USD",
    merchant: "Apple Store",
    url: "https://www.apple.com/shop/buy-ipad/ipad-air",
    imageUrl: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=400&q=80",
    source: "channel3" as const,
  },
];

function isSafeHttpUrl(raw?: string): string | undefined {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 2048) return undefined;
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function extractFromUrl(rawUrl: string) {
  try {
    const safeUrl = isSafeHttpUrl(rawUrl);
    if (!safeUrl) return null;
    const parsed = new URL(safeUrl);
    const domain = parsed.hostname.replace(/^www\./, "");
    if (!domain) return null;
    
    // Attempt to extract title from path
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    let title = "";
    
    // Find readable slug in path
    for (const part of pathParts) {
      if (part.length > 3 && !/^[0-9a-f-]{10,}$/i.test(part) && !/^(dp|p|product|item)$/i.test(part)) {
        title = decodeURIComponent(part)
          .replace(/[-_+]/g, " ")
          .replace(/\.(html?|php)$/i, "")
          .trim();
        break;
      }
    }
    
    if (!title && pathParts.length > 0) {
      title = decodeURIComponent(pathParts[pathParts.length - 1]).replace(/[-_+]/g, " ");
    }
    
    // Capitalize domain for merchant name
    const merchant = domain.split(".")[0];
    const merchantFormatted = merchant.charAt(0).toUpperCase() + merchant.slice(1);
    
    return {
      name: (title || `${merchantFormatted} Product`).slice(0, 160),
      merchant: merchantFormatted.slice(0, 80),
      url: safeUrl,
      source: "url" as const,
    };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { query, url } = body;

    // Handle URL extraction
    if (typeof url === "string" && url.trim().length > 3) {
      const extracted = extractFromUrl(url.trim());
      if (!extracted) {
        return NextResponse.json({ error: "Invalid product URL" }, { status: 400 });
      }
      return NextResponse.json({ product: extracted });
    }

    // Handle Query search
    const q = typeof query === "string" ? query.trim().slice(0, 200).toLowerCase() : "";
    if (!q) {
      return NextResponse.json({ products: [] });
    }

    const { CHANNEL3_API_KEY } = process.env;

    // If live Channel3 API Key is configured, attempt real search
    if (CHANNEL3_API_KEY) {
      try {
        const c3Res = await fetch("https://api.trychannel3.com/v1/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": CHANNEL3_API_KEY,
          },
          body: JSON.stringify({ query: q, limit: 8 }),
          signal: AbortSignal.timeout(6000),
        });

        if (c3Res.ok) {
          const c3Data = await c3Res.json();
          const items = Array.isArray(c3Data?.products) ? c3Data.products : Array.isArray(c3Data) ? c3Data : [];
          if (items.length > 0) {
            // v1: price and buy link live on the product's offers (one per merchant), not on the product.
            const amountOf = (raw: any): number | undefined =>
              typeof raw === "number" ? raw : typeof raw?.price === "number" ? raw.price : typeof raw?.amount === "number" ? raw.amount : typeof raw?.value === "number" ? raw.value : undefined;
            const mapped = items
              .map((p: any) => {
                const offers = (Array.isArray(p.offers) ? p.offers : [])
                  .map((o: any) => ({
                    amount: amountOf(o.price),
                    currency: (typeof o.price === "object" && o.price?.currency) || o.currency || "USD",
                    url: typeof o.url === "string" ? o.url : "",
                    domain: o.domain || o.merchant_domain || o.merchant,
                  }))
                  .filter((o: any) => typeof o.amount === "number" && o.amount > 0)
                  .sort((a: any, b: any) => a.amount - b.amount);
                const best = offers[0];
                const image = Array.isArray(p.images) ? p.images[0] : undefined;
                return {
                  name: p.title || p.name || "Product",
                  price: best?.amount ?? amountOf(p.price),
                  currency: best?.currency || p.price?.currency || p.currency || "USD",
                  merchant: (best?.domain || p.brand?.name || p.brands?.[0]?.name || p.merchant || "Online retailer").replace(/^www\./, ""),
                  url: best?.url || p.url || "",
                  imageUrl: (typeof image === "string" ? image : image?.url) || p.image_url || p.imageUrl || undefined,
                  source: "channel3" as const,
                };
              })
              .filter((product: any) => typeof product.price === "number" && product.price > 0);
            return NextResponse.json({ products: mapped, source: "channel3-live" });
          }
        }
      } catch (err) {
        console.warn("Channel3 live search fell back:", err);
      }
    }

    // Curated catalog fallback for search query
    const words = q.split(/\s+/).filter((w: string) => w.length > 2);
    const matches = SAMPLE_CATALOG.filter((item) => {
      const target = `${item.name} ${item.merchant}`.toLowerCase();
      return words.length === 0 || words.some((w: string) => target.includes(w));
    });

    const results = matches.length > 0 ? matches : [
      {
        name: query.trim().charAt(0).toUpperCase() + query.trim().slice(1),
        price: undefined,
        currency: "USD",
        merchant: "Channel3 Reference",
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        source: "channel3" as const,
      },
    ];

    return NextResponse.json({ products: results, source: "channel3" });
  } catch (err) {
    console.error("Product search error:", err);
    return NextResponse.json({ error: "Failed to search products" }, { status: 500 });
  }
}

