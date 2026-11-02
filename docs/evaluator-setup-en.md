# Evaluator setup and limitations

This document describes the local candidate build. It is not a claim that the current project has a verified free-through-judging provider arrangement.

## Optional hosted preview

The repository includes a Render Blueprint (`render.yaml`). Import the public repository as a Blueprint and select the Free web service. Keep the service on the free plan and do not add a payment method. Render documents that a Free service without a payment method is suspended when included bandwidth or build usage is exceeded instead of being billed for overages. The service sleeps after 15 minutes without traffic and can take about a minute to wake. Its filesystem is ephemeral.

For records that survive a host restart, create a Turso database on its Free plan and set both `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` as private Render environment variables. The app then stores the catalog, orders, inventory reservations, buyer questions, replies and newly uploaded image blobs in that database. If either value is missing, it uses local SQLite and records will be lost when the host clears its filesystem. Fictional sample images are restored from the public source on startup. Turso currently lists a $0 Free plan with no credit card required, 5 GB storage, 500 million row reads and 10 million row writes per month. Stay on the Free plan, do not enable paid overages, and verify billing remains $0. Turso or Render must still be checked from the owner’s account before calling the route available to judges. The hosted configuration disables the maker workspace; use the local build for product editing and merchant fulfillment tasks.

The Blueprint requests `AI_API_KEY`, `PAYPAL_CLIENT_ID`, and `PAYPAL_CLIENT_SECRET`. Enter them only in Render's private environment-variable fields. Use a free-only OpenRouter key/model and PayPal Sandbox credentials. OpenRouter currently documents 20 requests per minute and 50 per day for `:free` model variants; failed requests count toward the daily limit. The `openrouter/free` router can select different models, and neither availability nor continuous access through judging is guaranteed. Never add credits or a payment method to increase the quota. A deployment counts as verified only after a live AI response and complete PayPal Sandbox browser flow have been observed.

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

An optional development configuration tested by the entrant uses `AI_API_URL=https://openrouter.ai/api/v1/chat/completions`, `AI_MODEL=openrouter/free`, and `AI_TOKEN_PARAMETER=max_completion_tokens`, together with a privately configured `AI_API_KEY`. For the official OpenRouter endpoint, the server only accepts the free router or a `:free` model and requests zero prompt/completion pricing. Four isolated requests reported zero cost; this does not verify the evaluator's account, billing, availability or free access throughout judging. OpenRouter currently documents 50 requests per day and 20 per minute for `:free` variants; both limits and available models may change. This example is not an established evaluator access route and does not require an evaluator to purchase credits.

Do not use production PayPal credentials. Do not send keys, cookies, or buyer account passwords to the project maintainer. If the provider is not configured or unavailable, the application should show the integration as unavailable.

## What automated checks mean

Run `npm run check`. Provider interactions in this suite are simulated and test data is temporary. Passing checks establish source-level and local isolated behavior only. A live answer, approved Sandbox order, physical-device check, or evaluator access is not implied.

The final submission must provide a tested, free evaluator access route for the whole judging period. The current free-model cap means continuous AI availability cannot be promised; a live hosted route must be checked from a clean browser, including its behavior when the model is rate-limited. If that cannot be established, this candidate is not ready for evaluation as a working PayPal-plus-AI demo. The official rules allow complete repository setup instructions instead of a hosted URL, but judges still need a working build and free access to the integrations; a no-credential local start alone does not demonstrate live AI or PayPal.

References checked 2026-11-02: [Turso pricing](https://turso.tech/pricing), [OpenRouter free model limits](https://openrouter.ai/collections/free-models), [Render free service limits](https://render.com/docs/free), [PayPal AI Hackathon rules](https://paypalaihackathon.devpost.com/rules).
