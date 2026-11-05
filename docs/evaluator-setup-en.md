# Evaluator setup and limitations

This document describes the local build and the currently deployed hosted buyer preview. Read-only status was checked on 2026-11-05; the application code revision was `468cbe28b8ec69376aba5590f81f93774f9914eb`; it is not a guarantee of service availability, zero cost, or unrestricted access throughout judging.

## Hosted buyer preview

Open <https://tradeweave-demo.onrender.com/shop#catalog> for the hosted buyer storefront. On 2026-11-05 the live host returned HTTP 200 for `/healthz`, `/shop`, `/api/shop/config`, `/api/store`, and `styles.css?v=6.28`; the catalog returned three fictional products and the CSS contains the current narrow-navigation rule. The hosted page displays `$68.00 USD` with visually aligned digits. Its public config response reported `aiReady=true`, `paypalReady=true`, `persistenceMode=remote`, and `workspaceReady=false`. A `remote` value is useful configuration evidence but still does not prove a write/read roundtrip or persistence across restart. These responses do not verify a hosted AI response now, PayPal approval/capture, current billing/overage controls, or availability through the judging period.

The hosted maker workspace is disabled because the project has no hosted maker account or role system. Use the local build for product editing, maker inbox and fulfillment demonstrations. Do not expose the local editor to the public host: it has no authentication for remote merchants.

Bounded hosted AI probes on 2026-11-04 included fact-matching responses and one empty-model failure (HTTP 502); retry and maker handoff should be used when the model fails. The server restricts OpenRouter to its free router or a `:free` model and requests zero-price prompt/completion routing. This cannot guarantee free capacity or continuous access. Hosted PayPal approval/capture has not been verified; a separate local Sandbox checkout was completed, with no real money moved. The Blueprint keeps PayPal and AI values in private Render variables; do not attempt to retrieve or publish them. Account billing and overage settings were not re-read during this check. Stop if any provider requests a payment method, paid upgrade, top-up, or paid overage.

The five private Render variables used by the Blueprint are `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `AI_API_KEY`, `PAYPAL_CLIENT_ID`, and `PAYPAL_CLIENT_SECRET`. Do not send their values to the maintainer or include them in Git history. Turso connectivity and restart persistence remain unverified; the readiness endpoint does not report them.

## Requirements

- Node.js 24.x; run `npm ci` to install the locked dependency used by the optional remote storage path and its check.
- A desktop browser on the same computer as the local server. The maker workspace is loopback-only.
- For live AI or checkout, provider credentials and network access are needed. No credentials or test account passwords are included.

## Start and inspect

From the project directory:

```sh
npm start
```

Open `http://127.0.0.1:4173/shop#catalog` for the buyer storefront or `http://127.0.0.1:4173/workspace#products` for the maker workspace. The source catalog is fictional. Order records persist in the local SQLite database. Keep the same browser profile and hostname to recover a buyer's guest orders.

## Live integrations

Copy `.env.example` to `.env` only if `.env` does not already exist. Enter credentials locally and restart the process.

- PayPal uses the Sandbox Orders API and JavaScript SDK. Approval requires a separate Sandbox Personal buyer account. No real-money payment is intended. Amounts are USD item totals; shipping and tax are not calculated.
- AI uses a configured OpenAI-compatible chat-completions endpoint. The model and provider can be changed by environment settings; no model API key is bundled.

An optional development configuration tested by the entrant uses `AI_API_URL=https://openrouter.ai/api/v1/chat/completions`, `AI_MODEL=openrouter/free`, and `AI_TOKEN_PARAMETER=max_completion_tokens`, together with a privately configured `AI_API_KEY`. For the official OpenRouter endpoint, the server only accepts the free router or a `:free` model and requests zero prompt/completion pricing. Recorded live probes across all five interface languages include a check for an unprovided shipping cost and delivery guarantee. The local OpenRouter key status read on 2026-11-04 reported the free tier, USD 0.00 usage and USD 100.00 remaining.  These bounded checks do not verify payment-method status, future capacity or evaluator access throughout judging. OpenRouter currently documents 50 requests per day and 20 per minute for `:free` variants; both limits and available models may change. This example is not an established evaluator access route and does not require an evaluator to purchase credits.

Do not use production PayPal credentials. Do not send keys, cookies, or buyer account passwords to the project maintainer. If the provider is not configured or unavailable, the application should show the integration as unavailable.

## What automated checks mean

Run `npm run check`. Provider interactions in this suite are simulated and test data is temporary. Passing checks establish source-level and local isolated behavior only. A live answer, approved Sandbox order, physical-device check, or evaluator access is not implied.

The final submission must provide a tested, free evaluator access route for the whole judging period. The current public route has not passed hosted checkout, durable persistence, billing-control, or judging-period availability checks. The official rules allow complete repository setup instructions instead of a hosted URL, but evaluators still need a working build and free access to the required integrations; a no-credential local start alone does not demonstrate live AI or PayPal.

References checked 2026-11-04: [Turso pricing](https://turso.tech/pricing), [OpenRouter free model limits](https://openrouter.ai/collections/free-models), [OpenRouter pricing](https://openrouter.ai/pricing/), [Render free service limits](https://render.com/docs/free), [PayPal AI Hackathon rules](https://paypalaihackathon.devpost.com/rules).
