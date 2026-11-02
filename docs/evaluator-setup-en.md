# Evaluator setup and limitations

This document describes the local candidate build. It is not a claim that the current project has a verified free-through-judging provider arrangement.

## Hosted free preview

The public repository includes a Render Blueprint (`render.yaml`). To create a hosted preview, import the public repository as a Blueprint and select the Free web service. Keep the account on the free tier and do not add a payment method. Render documents that Free web services stop instead of incurring overage charges when the account has no payment method and reaches its included bandwidth or build usage. A Free instance sleeps after 15 minutes without traffic and may take about one minute to wake. Its filesystem is ephemeral: sample edits, uploaded images, and order history reset after sleep, restart, or redeploy. The hosted configuration disables the maker workspace; use the local build to inspect product editing and fulfillment workflows.

The Blueprint asks for `AI_API_KEY`, `PAYPAL_CLIENT_ID`, and `PAYPAL_CLIENT_SECRET`. Add them only through Render's private environment-variable fields. Use a free-only OpenRouter key/model and PayPal Sandbox credentials. The free OpenRouter router can be rate-limited or unavailable; no provider guarantees free capacity for the entire judging period. Do not represent the preview as available until the deployment is live and its AI and Sandbox flows have been checked.

## Requirements

- Node.js 24 or later; no npm package installation is required.
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

An optional development configuration tested by the entrant uses `AI_API_URL=https://openrouter.ai/api/v1/chat/completions`, `AI_MODEL=openrouter/free`, and `AI_TOKEN_PARAMETER=max_completion_tokens`, together with a privately configured `AI_API_KEY`. For the official OpenRouter endpoint, the server only accepts the free router or a `:free` model and requests zero prompt/completion pricing. The router may select different models and free capacity may be rate-limited or unavailable. Four isolated requests reported zero cost; this does not verify the evaluator's account, billing, availability or free access throughout judging. This example is not an established evaluator access route and does not require an evaluator to purchase credits.

Do not use production PayPal credentials. Do not send keys, cookies, or buyer account passwords to the project maintainer. If the provider is not configured or unavailable, the application should show the integration as unavailable.

## What automated checks mean

Run `npm run check`. Provider interactions in this suite are simulated and test data is temporary. Passing checks establish source-level and local isolated behavior only. A live answer, approved Sandbox order, physical-device check, or evaluator access is not implied.

The final submission must provide a tested, free evaluator access route for the whole judging period. If that cannot be established, this candidate is not ready for evaluation as a working PayPal-plus-AI demo.
