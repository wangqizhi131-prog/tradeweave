# Evaluator setup and limitations

This document describes the TradeWeave v0.6.22 public source and the separate hosted buyer preview. The public GitHub repository is <https://github.com/wangqizhi131-prog/tradeweave>. Render is linked to its `main` branch and the service settings show automatic deploys; verify the deployed commit before treating source as live. After the previous release, four public GET routes returned HTTP 200 and one custom seller-fact question returned HTTP 200 with a matching answer. Earlier v604 probes had two HTTP 502 responses among three custom questions. These limited observations do not establish answer quality, grounding or sustained availability. This source adds a model fallback chain of three explicitly named `:free` OpenRouter models and keeps the prompt/completion price caps at zero. OpenRouter can try another model after provider downtime or rate limiting, but the chain and gateway may still be unavailable. The fallback chain has only simulated regression coverage; it has not been live-probed.

## Hosted buyer preview

Open <https://tradeweave-demo.onrender.com/shop#catalog> for the hosted buyer storefront. The latest read-only GET smoke returned HTTP 200 for health, configuration, catalog and product page. One custom material question returned HTTP 200 with an answer matching the seller facts; this is one point-in-time success, not a stability claim. Earlier v604 checks had two HTTP 502 responses among three custom questions. This source adds three explicit `:free` model fallbacks with a zero-price cap. Simulated regression checks verify that chain is sent and that the application does not replay the entire chain after OpenRouter returns an error. The change applies to the hosted preview only after deployment; no live probe of the new chain has been performed. No checkout, order or payment route was called in the AI probes. The entrant reports a Nov 6 Sandbox order/read-back and Nov 9 phone Sandbox payment; those are not independent repetitions. Browser emulation is not physical-device evidence.

The hosted maker workspace is disabled because the project has no hosted maker account or role system. Use the local build for product editing, maker inbox and fulfillment demonstrations. Do not expose the local editor to the public host: it has no authentication for remote merchants.

The v554 local AI change requires a separate answer for each requested fact and a specific unknown notice for each missing fact. Core/storage checks and 35/35 simulated AI probes passed. One post-deploy custom material question returned a matching HTTP 200 answer; v604 also showed two 502s among three custom questions. The source adds three free model fallbacks, but this new fallback chain has only simulated coverage. Neither the hosted samples nor the code change establish continuous service. Nov 11 Turso screenshots show Starter Free and usage below the displayed allowances, but no Overages status. Do not infer the setting is off from the free plan or usage totals. These are point-in-time observations. Do not add a payment method, upgrade, top up, or enable paid overages.

The five private Render variables used by the Blueprint are `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `AI_API_KEY`, `PAYPAL_CLIENT_ID`, and `PAYPAL_CLIENT_SECRET`. Do not send their values to the maintainer or include them in Git history. Readiness flags do not expose credentials or prove every storage behavior.

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
- AI uses a configured OpenAI-compatible chat-completions endpoint. The model and provider can be changed by environment settings; no model API key is bundled. The three suggested chat prompts are shortcuts only; a buyer's custom question is passed to the configured model with the selected product's seller facts. For OpenRouter, the source restricts requests to free model IDs, supplies three model-level fallbacks and sets both prompt and completion price caps to zero. OpenRouter may switch models after provider errors or rate limits; if all choices or the gateway fail, the route can still be unavailable. The local application does not replay an exhausted OpenRouter chain.

A development setup has used the OpenRouter OpenAI-compatible endpoint with the `openrouter/free` route. The route may select different models and can be unavailable or rate-limited. A post-deploy material question returned HTTP 200 with an answer matching the seller record, while v604 previously recorded intermittent 502s. No provider key or model credits are included. This is not a guaranteed free evaluator-access path; do not ask evaluators to add a payment method or purchase credits.
Do not use production PayPal credentials. Do not send keys, cookies, or buyer account passwords to the project maintainer. If the provider is not configured or unavailable, the application should show the integration as unavailable.


## What automated checks mean

Run `npm run check`. Provider interactions in this suite are simulated and test data is temporary. Passing checks establish source-level and local isolated behavior only. A live answer, approved Sandbox order, physical-device check, or evaluator access is not implied.

**Current evaluator gate (Nov 11):** The v0.6.22 source contains the AI answer-completeness fix, product-fact evidence UI, two-step PayPal Sandbox flow and fixed-height mobile chat scroll. Local `npm run check`, release checks and no-secret public-package startup passed with simulated providers. This source adds a three-model OpenRouter `:free` fallback chain with `max_price=0`; the request shape is regression-tested, but the new chain has not been tested against live models. One previous-deploy hosted custom material answer matched its seller fact; earlier v604 custom questions included two 502s. These results do not establish ongoing availability. The entrant reports phone access and Sandbox payment results; these remain entrant-reported. Actual screen-reader speech remains untested. Turso Overages was not visible in the supplied screenshots and remains unconfirmed. Consider these limits when comparing the build with the submitted demo.

Official competition requirements, checked Nov 11: the deadline is Nov 12, 2026 at 12:00 p.m. Pacific (Nov 13 at 04:00 Beijing); the video must be under three minutes, publicly hosted on YouTube and show the project functioning on its target device; judges must have free, unrestricted access through Dec 15, 2026. A public repository must include its license and necessary code/assets/instructions. See the [official rules](https://paypalaihackathon.devpost.com/rules). Provider references: [Turso pricing](https://turso.tech/pricing), [OpenRouter free model limits](https://openrouter.ai/collections/free-models), [OpenRouter pricing](https://openrouter.ai/pricing/), and [Render free service limits](https://render.com/docs/free).
