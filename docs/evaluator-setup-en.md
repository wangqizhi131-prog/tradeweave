# Evaluator setup and limitations

This document describes the frozen TradeWeave v0.6.22 public source and the separate hosted buyer preview. The public GitHub repository is <https://github.com/wangqizhi131-prog/tradeweave>. Render is linked to its `main` branch and the service settings show automatic deploys; verify the deployed commit before treating source as live. The latest retained hosted assistant probe (v601) returned HTTP 502. The entrant later reported a manual AI check passed on Nov 11, but the exact time, prompt and answer were not retained. A prior request (v589) returned HTTP 200, also without a retained answer body; an earlier probe (v521) returned HTTP 502. These limited observations do not establish answer quality, grounding or sustained availability. One local `openrouter/free` probe passed in v578 with `max_price=0`; none of these checks guarantees future free-route capacity.

## Hosted buyer preview

Open <https://tradeweave-demo.onrender.com/shop#catalog> for the hosted buyer storefront. In v553, health, shop configuration, catalog and buyer product-page GETs returned HTTP 200 after an initial parallel-request timeout; the catalog contained three fictional products. In v589, shop configuration returned HTTP 200 with `aiReady=true`, and one fictional-product POST to `/api/assistant` returned HTTP 200, but the answer body was not retained. The latest retained hosted AI probe (v601) returned HTTP 502; the entrant later reported a manual check passed on Nov 11, without recording its time, prompt or answer. This does not establish current answer quality or sustained availability. Before this source update, hosted buyer assets were JS/CSS/locales 6.29/6.29/8; this release uses 6.69/6.32/17. No checkout, order or payment route was called in v589. The entrant reports a Nov 6 Sandbox order/read-back and Nov 9 phone Sandbox payment; those are not independent repetitions. On Nov 11 the entrant also reported normal phone access outside the computer's Wi-Fi; the exact URL/build, device, browser and scenarios were not captured, so this is not independent verification. Browser emulation is not physical-device evidence.

The hosted maker workspace is disabled because the project has no hosted maker account or role system. Use the local build for product editing, maker inbox and fulfillment demonstrations. Do not expose the local editor to the public host: it has no authentication for remote merchants.

The v554 local AI change requires a separate answer for each requested fact and a specific unknown notice for each missing fact. At the Nov 11 freeze, core/storage checks and 35/35 simulated AI probes passed; v578 added one no-retry local `openrouter/free` delivery-unknown probe with `max_price=0`. The latest retained hosted probe (v601) returned HTTP 502; the entrant later reported one manual check passed on Nov 11, but did not retain its time, prompt or answer. Hosted answer grounding and ongoing availability remain unverified. Nov 11 Turso screenshots show Starter Free and usage below the displayed allowances, but no Overages status. Do not infer the setting is off from the free plan or usage totals. These are point-in-time observations. Do not add a payment method, upgrade, top up, or enable paid overages.

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
- AI uses a configured OpenAI-compatible chat-completions endpoint. The model and provider can be changed by environment settings; no model API key is bundled.

A development setup has used the OpenRouter OpenAI-compatible endpoint with the `openrouter/free` route. The route may select different models and can be unavailable or rate-limited. The latest retained hosted request (v601) returned HTTP 502; the entrant later reported a manual check passed on Nov 11, but its time, prompt and answer were not recorded. A prior bounded request (v589) returned HTTP 200 without a retained answer body. No provider key or model credits are included. This is not a guaranteed free evaluator-access path; do not ask evaluators to add a payment method or purchase credits.
Do not use production PayPal credentials. Do not send keys, cookies, or buyer account passwords to the project maintainer. If the provider is not configured or unavailable, the application should show the integration as unavailable.


## What automated checks mean

Run `npm run check`. Provider interactions in this suite are simulated and test data is temporary. Passing checks establish source-level and local isolated behavior only. A live answer, approved Sandbox order, physical-device check, or evaluator access is not implied.

**Current evaluator gate (Nov 11):** The frozen v0.6.22 source contains the AI answer-completeness fix, product-fact evidence UI, two-step PayPal Sandbox flow and fixed-height mobile chat scroll. Local `npm run check`, 35/35 simulated AI probes, 320×700/390×844 checkout regressions and the 577-hash release check passed. The 40-file public candidate starts without secrets and reports AI/PayPal unavailable without credentials. The entrant reports normal phone access outside the computer's Wi-Fi; the exact URL/build, device, browser and scenarios are unknown, so this is not independent verification. The Nov 6 Sandbox payment/order read-back remains entrant-reported. Actual screen-reader speech remains untested. Turso Overages remains unverified. Hosted AI had a retained HTTP 502 (v601) and an earlier HTTP 200 with no retained answer body (v589); the entrant later reported a manual pass on Nov 11, with no exact time or answer retained. Answer grounding and sustained availability remain unverified. Consider these limits when comparing the frozen build with the submitted demo.

Official competition requirements, checked Nov 11: the deadline is Nov 12, 2026 at 12:00 p.m. Pacific (Nov 13 at 04:00 Beijing); the video must be under three minutes, publicly hosted on YouTube and show the project functioning on its target device; judges must have free, unrestricted access through Dec 15, 2026. A public repository must include its license and necessary code/assets/instructions. See the [official rules](https://paypalaihackathon.devpost.com/rules). Provider references: [Turso pricing](https://turso.tech/pricing), [OpenRouter free model limits](https://openrouter.ai/collections/free-models), [OpenRouter pricing](https://openrouter.ai/pricing/), and [Render free service limits](https://render.com/docs/free).
