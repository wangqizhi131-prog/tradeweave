# Evaluator setup and limitations

This document describes the TradeWeave v0.6.22 public source, buyer storefront and separate hosted maker workspace. The public GitHub repository is <https://github.com/wangqizhi131-prog/tradeweave>. Render is linked to its `main` branch with automatic deploys; verify the deployed revision before treating source as live. Buyer and maker assistants use the same route, selected product facts and five reply languages. Provider failures use localized seller-fact answers or ask the maker to confirm missing information; this deterministic fallback is not a substitute for general-knowledge AI. Buyer and maker account panels are interface demos: enter any text to continue or use the Google-style button. Account values remain in page memory and are not sent to an authentication provider or stored.

## Hosted buyer preview

Open <https://tradeweave-demo.onrender.com/shop#catalog> for the buyer storefront. The latest read-only smoke returned successful responses for health, configuration, the three-product catalog, buyer page and public maker workspace. The catalog contains three products and six image references. Hosted AI spot checks returned one known-material answer matching seller facts and one localized response that identified missing information and asked the buyer to confirm with the maker. The entrant also reports trying custom questions on both interfaces. These point-in-time checks do not establish continuous availability; provider capacity can still vary. No PayPal or order route was called in this update.

The maker workspace at <https://tradeweave-demo.onrender.com/workspace#products> uses a separate shared demo database and temporary service storage. Its changes do not affect the main buyer catalog, questions or orders; demo data may reset after a service restart. Do not enter personal information. Use the buyer storefront link for the main shop.

The AI route includes three explicitly free OpenRouter model fallbacks with a zero prompt/completion price cap. If the provider chain is unavailable or returns no usable answer, the server responds from matching seller facts or asks the maker to confirm missing details. This route does not become a general-knowledge model while providers are offline. Local core and storage checks passed, as did 35/35 simulated AI probes; simulated responses do not establish live model quality or continuous uptime.

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
- AI uses an optional configured OpenAI-compatible chat-completions endpoint. The model and provider can be changed by environment settings; no model API key is bundled. The buyer and maker interfaces offer English, Simplified Chinese, Japanese, Spanish and French. The three suggested chat prompts are shortcuts only; a custom question is passed to the model with the selected product's seller facts and requested reply language. If no model is configured or a request fails, the server returns a deterministic localized answer for recognized listing facts; missing and unrecognized facts tell the user to ask the maker. This fallback does not make open-domain answers. For OpenRouter, the source restricts requests to free model IDs, supplies three model-level fallbacks and sets both prompt and completion price caps to zero. OpenRouter may switch models after provider errors or rate limits; if all choices or the gateway fail, the deterministic seller-fact fallback responds instead. The local application does not replay an exhausted OpenRouter chain.

A development setup has used the OpenRouter OpenAI-compatible endpoint with the `openrouter/free` route. The route may select different models and can be unavailable or rate-limited. A post-deploy material question returned HTTP 200 with an answer matching the seller record, while v604 previously recorded intermittent 502s. No provider key or model credits are included. This is not a guaranteed free evaluator-access path; do not ask evaluators to add a payment method or purchase credits.
Do not use production PayPal credentials. Do not send keys, cookies, or buyer account passwords to the project maintainer. When AI credentials are absent, the assistant still responds using seller facts and labels unsupported details for maker confirmation.


## What automated checks mean

Run `npm run check`. Provider interactions in this suite are simulated and test data is temporary. Passing checks establish source-level and local isolated behavior only. A live answer, approved Sandbox order, physical-device check, or evaluator access is not implied.

**Current evaluator gate (Nov 11):** The v0.6.22 source includes the product-fact evidence UI, buyer and maker assistants, five response languages, two-step PayPal checkout and fixed-height mobile chat. Buyer and maker account screens demonstrate sign-in, registration, Google entry and profile actions; they keep entered values in page memory and do not use a real authentication service. Local core/storage checks, 35/35 simulated AI probes, a 579-file release audit and the 40-file no-secret public-package check passed. Hosted assistant spot checks returned a seller-fact answer and a localized unknown-information response, but these do not guarantee continuous provider availability. If providers fail, the assistant uses matching seller facts or asks the maker to confirm. The entrant reports phone access and Sandbox payment results; these remain entrant-reported. Compare the deployed revision with the submitted demo before judging.

Official competition requirements, checked Nov 11: the deadline is Nov 12, 2026 at 12:00 p.m. Pacific (Nov 13 at 04:00 Beijing); the video must be under three minutes, publicly hosted on YouTube and show the project functioning on its target device; judges must have free, unrestricted access through Dec 15, 2026. A public repository must include its license and necessary code/assets/instructions. See the [official rules](https://paypalaihackathon.devpost.com/rules). Provider references: [Turso pricing](https://turso.tech/pricing), [OpenRouter free model limits](https://openrouter.ai/collections/free-models), [OpenRouter pricing](https://openrouter.ai/pricing/), and [Render free service limits](https://render.com/docs/free).
