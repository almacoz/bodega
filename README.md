# WhyBuy

**Remember why before you buy.**

An AI-powered memory that helps people understand the evolution of their purchasing intentions before turning them into transactions.

    npm install
    cp .env.example .env.local   # add credentials (see below)
    npm run dev                  # http://localhost:3000
    npm test

Memory lives in your browser's localStorage under `whybuy:v1`. Clear it to start over.

## Features

- **Intention Capture**: Save a purchase idea immediately, then interpret its reason asynchronously
- **Waiting Cart**: Choose a 1, 3, or 7 day wait, check in daily, and decide when ready
- **Shopping Assistant**: Proposes sandbox orders and stores them in the browser-local waiting cart
- **AI Understanding**: Extracts subject, purpose, needs, budget, reason type, and reflection
- **Memory Linking**: Finds similar past intentions that serve the same needs
- **PayPal Sandbox Demo**: Optional demonstration of purchase flow (Sandbox only, not production)
- **Timeline**: Track status changes (active, reconsidering, archived, purchased)

## Environment Setup

### Local AI: Ollama

1. Start Ollama locally and pull a model that supports tool calling for the shopping assistant.
2. Copy the environment template:
   ```bash
   cp .env.example .env.local
   ```

3. Set the Ollama OpenAI-compatible endpoint and model in `.env.local`:
   ```bash
   LLM_API_KEY=ollama
   LLM_BASE_URL=http://localhost:11434/v1
   LLM_MODEL=qwen3:8b
   ```

4. Restart the dev server after changing environment variables:
   ```bash
   npm run dev
   ```

The assistant needs an Ollama model with OpenAI-compatible tool-calling support. Ollama's API key value is not used for local authentication; keep `.env.local` uncommitted.

**Privacy Notice**: Google may use free-tier requests to improve their products. Review [Google's terms](https://ai.google.dev/terms) for details.

### Common Setup Issues

**"API key not valid"**
- Key copied incorrectly or has extra spaces
- Revoke and create a new key in AI Studio

**"model not found"**
- Using deprecated model (e.g., `gemini-2.5-flash` with new API key)
- Change `LLM_MODEL` to `gemini-3.8-flash` or `gemini-3.5-flash-lite`

**"429 Too Many Requests"**
- Free tier quota exhausted
- Wait or try alternative model

**"AI model isn't configured"**
- File isn't named exactly `.env.local`
- Dev server not restarted after editing .env.local
- Missing required variables

### Optional: PayPal Sandbox (Demo Only)

**⚠️ For hackathon demos only** - Get Sandbox credentials at [developer.paypal.com](https://developer.paypal.com):

```bash
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
APP_BASE_URL=http://localhost:3000
```

For production deployment, set `APP_BASE_URL` to your deployed domain (e.g., `https://yourdomain.com`).

## PayPal Sandbox Demo

## Agent safety boundary

The assistant can propose a purchase and read an order status; it cannot capture a payment. Its PayPal Agent Toolkit configuration enables only `orders.create` and `orders.get` in sandbox mode, and the model receives only the `proposePurchase` and read-only `getOrder` tools. The proposal wrapper requires the reason to appear in the user's own message and puts the reason in the PayPal order description. See [app/api/agent/route.ts](app/api/agent/route.ts).

Only a person can approve on PayPal. The approval link is shown after the user chooses **Approve with PayPal** for a ready intention. PayPal returns to [app/paypal/return/page.tsx](app/paypal/return/page.tsx), which calls [app/api/paypal/capture-order/route.ts](app/api/paypal/capture-order/route.ts) after approval. There is no capture tool or capture call in the agent route.

Set `NEXT_PUBLIC_DEMO_MODE=true` to show the local “Demo: skip a day” control and demo reset. It changes the browser-local business clock only; intentions remain in localStorage. Similar-intention recall is disabled by default; set `NEXT_PUBLIC_RECALL_ENABLED=true` to enable it.

## PayPal Sandbox Demo

**⚠️ IMPORTANT - Demo/Hackathon Only**: The PayPal integration is designed for Sandbox demonstrations and hackathon presentations. It is **NOT suitable for production commerce** or real merchant transactions.

**How it works:**
1. User declares an amount in their browser (stored in localStorage)
2. Server validates the amount is numeric and within bounds (0-10000)
3. User sees confirmation screen with clear Sandbox demo disclosure
4. PayPal Sandbox processes the user-declared amount
5. No real money is charged (Sandbox only)

**Limitations (by design):**
- Amount is user-declared from client-side storage
- Server cannot verify amount matches any "true" price (no server-side database)
- Suitable for: demos, hackathons, learning, personal projects
- NOT suitable for: production stores, real transactions, verified merchant checkout

**For production commerce**, you would need:
- Server-side product/pricing database
- Database-backed idempotency
- Webhook verification
- Production merchant account
- PCI DSS compliance

## Security

- HTTP security headers (HSTS, CSP, X-Content-Type-Options, etc.)
- Rate limiting: 30 requests/minute per IP (best-effort, in-memory)
- Server-side only: LLM API keys and PayPal secrets never exposed to client
- Input validation on all endpoints
- User disclosure: Clear warning about Sandbox demo limitations
- See `SECURITY_AUDIT.md` for complete details and honest limitations

## Tests

Run `npm test` to verify:
- AI extraction and normalization
- Memory management and linking
- PayPal Sandbox demo integration (26 tests total)
