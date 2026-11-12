<p align="center"><img src="public/whybuy-logo.png" alt="WhyBuy" width="220"></p>

# WhyBuy — the pause between wanting and buying

A memory for purchase decisions. You write what you want and why; WhyBuy holds it for a few days, asks once a day whether you still want it, remembers earlier intentions that served the same need, and only then lets you approve a **PayPal Sandbox** test payment or open the store. AI shopping assistants can *propose* purchases into the same waiting room; they can never pay.

Built for the **PayPal + AI Hackathon** (Devpost). MIT licensed.

> **Scope:** WhyBuy is a memory and decision-support tool. It is not a store, a marketplace, a price comparator or a payment platform. The PayPal integration is a Sandbox demonstration of the "human approves, agent proposes" flow — no real purchase is made from any merchant.

## The problem and the idea

People buy on impulse and reconstruct their reasons afterwards; memory bends towards what we want right now. Agentic checkout removes the last natural pause (finding the card, filling the form). WhyBuy puts the pause back where it belongs:

1. **Want it** — one sentence: what and why. If the "why" is missing, one tap answers it.
2. **Sleep on it** — 1, 3 or 7 days (suggested from the kind of reason). Each day: *Still want it?*
3. **Decide** — pick the real product (Channel3 search, a pasted link, or typed), see how much of this month's budget it takes, then **open the store** or run a **PayPal Sandbox test payment**. The reason travels with the order.

When an intention is saved, WhyBuy runs one Channel3 search in the background and shows a **real price range** from store listings ("In stores today: $999 – $1,453 · typical $1,275 · Channel3 · 8 real offers · not a quote"). If the person's own estimate is far below it, WhyBuy says so neutrally, and every option shows whether it fits this month's budget. Over budget? One tap moves the decision to the 1st of next month. Prices come from listings, never from the language model.

If a new intention looks like an earlier one ("tablet for coding on the go" vs "laptop for coding while commuting"), WhyBuy shows both in the person's own words and asks whether it's the same need — a question, never a recommendation.

## Architecture

| Layer | What | Where |
| --- | --- | --- |
| UI | Next.js 16 (App Router), React 19, Tailwind 4; EN/ES | `app/`, `components/` |
| Memory | Browser `localStorage` (`whybuy:v1`), versioned migration, JSON export/import | `lib/storage.ts`, `lib/memory.ts` |
| Waiting room | Status derivation (`waiting → ready → bought | let_go`), daily check-ins, demo clock | `lib/waiting.ts`, `lib/clock.ts` |
| Recall | Strict similarity (shared specific needs or same subject) + model hint, never generic tags | `lib/link.ts` |
| AI | Any OpenAI-compatible chat-completions endpoint; interprets the note (subject, purpose, needs, reason type) | `app/api/extract/route.ts` |
| Shopping assistant | Tool-calling agent that can only *create* unapproved PayPal orders (`proposePurchase`, `getOrder`) | `app/api/agent/route.ts` |
| Products | Channel3 `/v1/search` (lowest priced offer per product), URL paste, manual entry | `app/api/products/search/route.ts` |
| PayPal | Server-side REST v2 Orders: create on approve, capture on return, verified amounts | `lib/paypal.ts`, `app/api/paypal/*`, `app/paypal/return` |
| Security headers | CSP, HSTS, frame denial, referrer and permissions policy | `proxy.ts` |

There is no database and no user accounts by design: the memory belongs to the browser.

## Run it

Requires Node 20+. Both `pnpm-lock.yaml` and `package-lock.json` are committed, so **either `npm` or `pnpm` works out of the box**.

> **Note for AI agents & evaluators:** If `pnpm` is not in `PATH` (`command not found: pnpm`), use the `npm` commands below directly — no global install or `sudo` needed — or enable `pnpm` first with `corepack enable pnpm` (or prefix with `npx pnpm`).

```bash
# Option A — npm (works anywhere Node is installed)
npm install
cp .env.example .env.local
# fill LLM_*, PAYPAL_*, optionally CHANNEL3_API_KEY (see below)
npm run dev             # http://localhost:3000
npm test                # 51 unit tests (vitest)
npm run typecheck       # tsc --noEmit
npm run build           # production build

# Option B — pnpm (after `corepack enable pnpm`)
pnpm install
pnpm dev                # http://localhost:3000
pnpm test               # 51 unit tests (vitest)
pnpm typecheck          # tsc --noEmit
pnpm build              # production build
```

### Environment variables

All are documented in [`.env.example`](.env.example).

| Variable | Required | Notes |
| --- | --- | --- |
| `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | Yes for AI features | Any OpenAI-compatible endpoint. Use a hosted model for demos (e.g. Gemini 2.5 Flash via `https://generativelanguage.googleapis.com/v1beta/openai`). Small local models (e.g. `llama3.2`) produce weak need tags and recall may not fire. The app still saves intentions when the model is down. |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Yes for the payment demo | Sandbox REST app credentials from developer.paypal.com. The code always targets `api-m.sandbox.paypal.com`; there is no live mode. |
| `APP_BASE_URL` | Yes | Where PayPal redirects back (`http://localhost:3000` locally). |
| `CHANNEL3_API_KEY` | Optional | Real product search. Without it, search shows clearly labeled sample results. |
| `NEXT_PUBLIC_DEMO_MODE` | Optional | Shows "Demo: skip a day" and "Reset demo data" (browser-local clock only). |
| `NEXT_PUBLIC_RECALL_ENABLED` | Optional | Recall is **on** by default; set `false` to disable. |

## Testing the PayPal Sandbox flow

1. In the PayPal Developer Dashboard create a **Sandbox** REST app (Client ID + Secret) and a Sandbox **personal** (buyer) account.
2. Set the credentials in `.env.local` and start the app.
3. Save an intention, choose **Decide now** (or let the wait end), pick a priced product (search, link or typed), press **Approve with PayPal**, read the Sandbox notice, press **Test payment with PayPal Sandbox**.
4. Log in with the Sandbox buyer and complete the purchase. PayPal returns to `/paypal/return`, the server captures and verifies the order, and the item becomes **Bought · paid with PayPal** with the original reason and the order ID.

What this proves: a human-approved, server-verified PayPal order whose description carries the person's reason. What it does **not** do: buy anything from the listed merchant. The receipt says so.

## Agent safety boundary

The shopping assistant receives only two tools: `proposePurchase` (creates an **unapproved** Sandbox order; requires the person's own reason and a price they stated) and `getOrder` (read-only). Capture lives in a separate route that runs only after the person approves on PayPal. The agent cannot reach it.

## Security notes

- Secrets are server-side only; `.env*` is git-ignored; nothing is prefixed `NEXT_PUBLIC_` except the two demo flags.
- Order creation validates amount (0 < x ≤ 10 000, two decimals), currency and lengths; capture requires PayPal status `COMPLETED`, returns PayPal's own amount, is idempotent and checks the order's `custom_id` matches the intention.
- Per-IP and per-route rate limiting plus hourly global LLM/PayPal budgets and scanner/probe blocking in `lib/shield.ts` (enforced by `proxy.ts` across `/api/extract`, `/api/agent`, `/api/products`, and `/api/paypal`). In-memory per server instance; no authentication.
- Prices come from the user, a pasted link or a Channel3 offer at search time — the checkout card states which. WhyBuy has no catalog and does not verify prices.

## Known limitations

- Memory is per browser (`localStorage`); clearing it loses the history. No sync, no accounts.
- Recall quality depends on the model's need tags. With a small local model it rarely triggers.
- Budget tracking does not convert currencies.
- No background notifications; reminders appear when the app is reopened.
- Sandbox only. For a real merchant flow you would need a server-side catalog, a payee per merchant, webhooks and a production account.

## Reproducing the demo

1. `NEXT_PUBLIC_DEMO_MODE=true`, a hosted model, PayPal Sandbox credentials, Channel3 key. Reset demo data from Settings.
2. Set a monthly budget on the home screen.
3. Write: *"I need a computer for work and to experiment with AI models locally, around $1800"* → sleep on it 1 day.
4. Write: *"Thinking about a Mac mini M4 as a desktop for work and running AI models locally"* → the recall card shows the earlier note; answer **Same need** and the reflection question.
5. Skip a day → answer **Still want it?** → **Decide** → search "Apple MacBook Pro M4" → add and choose → **Approve with PayPal** → Sandbox buyer → back to WhyBuy as **Bought**.
6. Ask the assistant: *"Buy me noise-cancelling headphones for my flight, about $299"* → it proposes; the item waits; only you can approve.

## Tests

`pnpm test` runs 51 unit tests covering normalization, memory and linking, notifications, the PayPal helpers, the price-range filter, and the API shield.

## License

MIT — see [LICENSE](LICENSE).
