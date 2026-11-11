"use client";

import { useState } from "react";
import { Check, ExternalLink, Plus, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { ProductReference } from "@/lib/types";
import { Btn, Label, money } from "./ui";

type Draft = Omit<ProductReference, "id" | "addedAt">;
type Tab = "channel3" | "url" | "manual";

const field =
  "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px] text-fg placeholder:text-slate-400 transition-colors focus:border-slate-400";

function safeHttpUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function Thumb({ src, alt }: { src?: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  const safeSrc = safeHttpUrl(src);
  return safeSrc && !broken ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={safeSrc} alt="" onError={() => setBroken(true)} loading="lazy" className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100 object-cover" />
  ) : (
    <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-stone-100 font-display text-lg text-stone-400">
      {alt.charAt(0).toUpperCase()}
    </span>
  );
}

/** Alternatives the person is weighing. References, never a cart. */
export function ProductSection({
  products = [],
  selectedProductId,
  onAddProduct,
  onRemoveProduct,
  onSelectProduct,
  defaultSearchQuery,
  isPurchased,
  startAdding = false,
  title,
}: {
  products: ProductReference[];
  selectedProductId?: string;
  onAddProduct: (product: Draft) => void;
  onRemoveProduct: (productId: string) => void;
  onSelectProduct: (productId: string | null) => void;
  defaultSearchQuery?: string;
  isPurchased?: boolean;
  startAdding?: boolean;
  title?: string;
}) {
  const { lang, t } = useI18n();
  const localizedMerchant = (name?: string) => name === "Channel3 Reference" && lang === "es" ? "Referencia de Channel3" : name;
  const [adding, setAdding] = useState(startAdding);
  const [tab, setTab] = useState<Tab>("channel3");
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState(defaultSearchQuery || "");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Draft[]>([]);
  const [searched, setSearched] = useState(false);

  const [url, setUrl] = useState("");
  const [reading, setReading] = useState(false);
  const [fromUrl, setFromUrl] = useState<Draft | null>(null);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [merchant, setMerchant] = useState("");

  const visible = isPurchased ? products.filter((p) => p.id === selectedProductId) : products;
  const pricedResults = results.filter((product) => typeof product.price === "number" && product.price > 0);

  async function post(body: object) {
    const res = await fetch("/api/products/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      setResults((await post({ query: query.trim() })).products || []);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function readUrl() {
    if (!url.trim()) return;
    setReading(true);
    setError(null);
    try {
      const { product } = await post({ url: url.trim() });
      setFromUrl(product);
      setName(product?.name ?? "");
      setMerchant(product?.merchant ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that link");
    } finally {
      setReading(false);
    }
  }

  function reset() {
    setAdding(false);
    setResults([]);
    setFromUrl(null);
    setUrl("");
    setName("");
    setPrice("");
    setMerchant("");
    setError(null);
  }

  function add(p: Draft) {
    onAddProduct(p);
    reset();
  }

  function addTyped(source: "url" | "manual") {
    if (!name.trim()) return;
    const n = parseFloat(price);
    add({
      ...(source === "url" && fromUrl ? fromUrl : {}),
      name: name.trim(),
      merchant: merchant.trim() || undefined,
      price: Number.isFinite(n) && n > 0 ? n : undefined,
      currency: /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : "USD",
      source,
    });
  }

  const tabs: [Tab, string][] = [
    ["channel3", t.detail.tabSearch],
    ["url", t.detail.tabLink],
    ["manual", t.detail.tabManual],
  ];

  const priceFields = (
    <div className="grid grid-cols-[1fr_6rem] gap-2">
      <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={t.detail.price} aria-label={t.detail.price} className={field} />
      <input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} aria-label={t.detail.currency} className={`${field} uppercase`} />
    </div>
  );

  return (
    <section aria-labelledby="options">
      <div className="flex items-baseline justify-between gap-4">
        <h3 id="options">
          {title !== "" && <Label>{title ?? t.detail.optionsTitle}</Label>}
        </h3>
        {!isPurchased && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="-mt-3 inline-flex items-center gap-1 text-sm font-medium text-fg hover:text-emerald-800">
            <Plus size={14} /> {t.detail.addOption}
          </button>
        )}
      </div>

      {visible.length === 0 && !adding && <p className="text-[15px] leading-relaxed text-slate-500">{t.detail.optionsEmpty}</p>}

      {visible.length > 0 && (
        <ul className="divide-y divide-line">
          {visible.map((p) => {
            const chosen = p.id === selectedProductId;
            return (
              <li key={p.id} className="group flex items-center gap-4 py-3.5">
                <Thumb src={p.imageUrl} alt={p.name} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[15px] font-medium text-fg">
                    <span className="truncate">{p.name}</span>
                    {safeHttpUrl(p.url) && (
                      <a href={safeHttpUrl(p.url)} target="_blank" rel="noreferrer noopener" aria-label={p.url} className="shrink-0 text-slate-400 hover:text-fg">
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </p>
                  <p className="truncate text-sm text-dim">
                    {[localizedMerchant(p.merchant), p.price !== undefined ? money(p.price, p.currency || "USD", lang) : t.detail.noPrice].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {!isPurchased && (
                  <>
                    <button
                      type="button"
                      onClick={() => onSelectProduct(chosen ? null : p.id)}
                      aria-pressed={chosen}
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                        chosen ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "text-slate-600 ring-1 ring-line hover:text-fg hover:ring-slate-300"
                      }`}
                    >
                      {chosen && <Check size={13} />}
                      {chosen ? t.detail.chosen : t.detail.goWithThis}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveProduct(p.id)}
                      aria-label={`${t.detail.remove}: ${p.name}`}
                      className="shrink-0 rounded-full p-1.5 text-slate-300 opacity-100 transition hover:bg-slate-100 hover:text-fg sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                    >
                      <X size={14} />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding && (
        <div className="rise mt-4 rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200/70 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div role="tablist" className="inline-flex rounded-full bg-white p-1 ring-1 ring-line">
              {tabs.map(([id, text]) => (
                <button
                  key={id}
                  role="tab"
                  type="button"
                  aria-selected={tab === id}
                  onClick={() => {
                    setTab(id);
                    setError(null);
                  }}
                  className={`rounded-full px-3 py-1 text-sm transition-colors ${tab === id ? "bg-fg text-white" : "text-slate-600 hover:text-fg"}`}
                >
                  {text}
                </button>
              ))}
            </div>
            <button type="button" onClick={reset} aria-label={t.detail.close} className="rounded-full p-1.5 text-slate-400 hover:bg-white hover:text-fg">
              <X size={15} />
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {tab === "channel3" && (
              <>
                <div className="flex gap-2">
                  <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder={t.detail.searchPlaceholder} aria-label={t.detail.tabSearch} className={field} />
                  <Btn variant="primary" onClick={search} disabled={searching}>
                    {searching ? t.detail.searching : t.detail.searchBtn}
                  </Btn>
                </div>
                {searched && !searching && pricedResults.length === 0 && <p className="text-sm text-dim">{t.story.noPriced}</p>}
                {pricedResults.length > 0 && (
                  <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-xl bg-white ring-1 ring-line">
                    {pricedResults.map((r, idx) => (
                      <li key={`${r.name}-${idx}`} className="flex items-center gap-3 px-3 py-2.5">
                        <Thumb src={r.imageUrl} alt={r.name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-fg">{r.name}</p>
                          <p className="truncate text-xs text-dim">
                            {[localizedMerchant(r.merchant), r.price !== undefined ? money(r.price, r.currency || "USD", lang) : null].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <Btn onClick={() => add(r)} className="px-3 py-1.5">
                          <Plus size={13} /> {t.detail.add}
                        </Btn>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-slate-400">{t.detail.viaChannel3}</p>
              </>
            )}

            {tab === "url" && (
              <>
                <div className="flex gap-2">
                  <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && readUrl()} placeholder={t.detail.urlPlaceholder} aria-label={t.detail.tabLink} className={field} />
                  <Btn variant="primary" onClick={readUrl} disabled={reading}>
                    {reading ? t.detail.extracting : t.detail.extractBtn}
                  </Btn>
                </div>
                {fromUrl && (
                  <div className="rise space-y-2">
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.detail.productName} aria-label={t.detail.productName} className={field} />
                    <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder={t.detail.merchant} aria-label={t.detail.merchant} className={field} />
                    {priceFields}
                    <Btn variant="primary" onClick={() => addTyped("url")} disabled={!name.trim()} className="w-full">
                      {t.detail.saveProduct}
                    </Btn>
                  </div>
                )}
              </>
            )}

            {tab === "manual" && (
              <div className="space-y-2">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.detail.productName} aria-label={t.detail.productName} className={field} />
                <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder={t.detail.merchant} aria-label={t.detail.merchant} className={field} />
                {priceFields}
                <Btn variant="primary" onClick={() => addTyped("manual")} disabled={!name.trim()} className="w-full">
                  {t.detail.saveProduct}
                </Btn>
              </div>
            )}

            {error && (
              <p role="alert" className="text-sm text-amber-800">
                {error}
              </p>
            )}
          </div>
        </div>
      )}

      {(visible.length > 0 || adding) && !isPurchased && <p className="mt-3 text-xs text-slate-400">{t.detail.optionsNote}</p>}
    </section>
  );
}
