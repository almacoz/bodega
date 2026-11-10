# BODEGA (hackathon MVP)

A memory of what you intend. Capture a want in English or Spanish, review how it was understood,
and see earlier intentions that serve the same underlying need. Optional PayPal Sandbox demo integration for hackathon presentations.

    npm install
    cp .env.example .env.local   # add credentials (see below)
    npm run dev                  # http://localhost:3000
    npm test

Memory lives in your browser's localStorage under `bodega:v1`. Clear it to start over.

## Features

- **Intention Capture**: Describe what you want in English or Spanish
- **AI Understanding**: Extracts subject, purpose, needs, budget, and sentiment
- **Memory Linking**: Finds similar past intentions that serve the same needs
- **PayPal Sandbox Demo**: Optional demonstration of purchase flow (Sandbox only, not production)
- **Timeline**: Track status changes (active, reconsidering, archived, purchased)

## Environment Setup

### Required: Google AI (Gemini)

1. Get a free API key at [aistudio.google.com](https://aistudio.google.com)
   - Click "Get API key" and create one
   - Free tier has usage limits (check AI Studio for details)
   - No credit card required for free tier

2. Copy the environment template:
   ```bash
   cp .env.example .env.local
   ```

3. Edit `.env.local` and add your credentials:
   ```bash
   LLM_API_KEY=your_gemini_api_key_here
   LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
   LLM_MODEL=gemini-3.8-flash
   ```

4. Restart the dev server (Next.js only reads environment variables on startup):
   ```bash
   npm run dev
   ```

**Important**: 
- Never use `NEXT_PUBLIC_` prefix (would expose key to browser)
- Never commit `.env.local` (already in .gitignore)
- If you accidentally expose your key, revoke it in AI Studio and create a new one

**Model Notes**:
- `gemini-3.8-flash` is recommended for new projects
- `gemini-2.5-flash` is deprecated for new API keys (may return "model not found")
- For alternatives, use `gemini-3.5-flash-lite` or check [Google's documentation](https://ai.google.dev/gemini-api/docs/models)

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
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com
APP_BASE_URL=http://localhost:3000
```

For production deployment, set `APP_BASE_URL` to your deployed domain (e.g., `https://yourdomain.com`).

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
