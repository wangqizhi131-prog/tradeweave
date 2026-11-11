# TradeWeave

**Commerce, with context.** TradeWeave is a prototype for independent makers. A seller maintains bilingual product facts; buyers can review product options, ask questions, and check out with PayPal Sandbox.

> **Evaluation status (2026-11-11):** TradeWeave serves a buyer storefront at <https://tradeweave-demo.onrender.com/shop#catalog> and a separate public maker workspace at <https://tradeweave-demo.onrender.com/workspace#products>. Render is linked to this repository’s `main` branch with automatic deploys; verify the deployed revision after each source update. Buyer and maker assistants use the same route and five reply languages. Suggested questions are shortcuts; custom questions are passed to the model with the selected product’s seller facts. If a provider request fails or returns no answer, the server uses a localized seller-fact fallback or asks the maker to confirm missing details. This fallback is not a general-knowledge model, and free provider capacity can still vary. Recent hosted spot checks returned a matching known material answer and a localized unknown-information response; these are point-in-time checks, not a stability guarantee. The entrant reports independently testing custom questions on both sides. The three original product images remain in the buyer catalog and maker workspace. Buyer and maker account panels demonstrate sign-in, registration, Google entry, profile, account switching and sign-out; they accept typed input locally and do not create or store credentials. Core checks and 35 simulated AI probes pass locally; simulation does not establish live model quality. This source update does not change Devpost or the demo video.

## What works in the local build

- A maker workspace for product drafts, bilingual facts, options, images, buyer questions, orders, and sandbox fulfillment. The hosted `/workspace` link opens a separate fictional demo store; its catalog and records do not touch the main buyer storefront. Demo data is shared among maker-demo visitors and can reset when the service restarts. Do not enter personal information.
- A separate buyer storefront with product search and filters, options, cart, product questions, and My orders. The three chat suggestions are shortcuts; buyers can enter their own questions, which are sent to the AI with the selected product's seller-maintained facts. Replies are accompanied by related facts and a clear state for relevant details the seller has not supplied; the interface does not claim sentence-level citation verification.
- Buyer and maker account panels demonstrate sign-in, registration, Google entry, profile details, account switching and sign-out. Typed values stay in the current page only; no account credentials are sent to a sign-in provider or persisted.
- Five interface and assistant reply languages: English, Simplified Chinese, Japanese, Spanish, and French. The buyer and maker reply-language selectors offer the same five choices. The fictional sample listings include translated product copy and supplied facts in all five. Required listing fields need English and Simplified Chinese for an active listing; Japanese, Spanish, and French copy is optional. When available content lacks the selected language, the storefront shows a fallback notice.
- SQLite-backed catalog, checkout snapshots, inventory reservations, orders, questions, and maker replies. A hosted instance can use the optional Turso/libSQL database so records survive Render restarts.
- A configurable OpenAI-compatible chat-completions interface and PayPal JavaScript SDK plus Orders API integration fixed to PayPal Sandbox.

The included shop and products are fictional examples. The checkout amount is USD and excludes shipping and tax. No production payment or shipping service is implemented.

## Run

Requires Node.js 24.x. Install the locked dependencies before running the checks or enabling the optional remote database.

```sh
npm ci
npm start
```

- Buyer: <http://127.0.0.1:4173/shop#catalog>
- Maker: <http://127.0.0.1:4173/workspace#products>

On the hosted preview, open <https://tradeweave-demo.onrender.com/workspace#products> to explore the public maker demo, or return to <https://tradeweave-demo.onrender.com/shop#catalog> for the buyer storefront. The public maker demo uses a separate SQLite database in temporary service storage; it does not expose the main storefront's catalog, orders, or questions. Demo visitors share the sample maker workspace with one another, and its records may reset after a service restart. Without live AI credentials, the app can answer recognized questions from seller facts and will ask the maker to confirm unsupported details. It never simulates payment success.

## Provider setup

Provider credentials are optional for local browsing and editing. To test integrations, copy `.env.example` to `.env`, configure credentials locally, and restart the server. Never commit `.env` or share secrets in screenshots or issue reports.

- **PayPal:** Use a PayPal Developer Sandbox REST app and a separate Sandbox Personal buyer account. The app's server API and browser SDK are configured for Sandbox. Never use a production account for testing.
- **AI:** Configure an OpenAI-compatible chat-completions endpoint, key, and model. This source bundle does not provide model credits or guarantee that any provider is free. A hackathon evaluator path must be verified as free and usable before submission; evaluators must not be asked to purchase credits or expose private keys.

See [evaluator setup and limitations](docs/evaluator-setup-en.md) for exact boundaries.

## Hosted buyer preview

The hosted buyer storefront is <https://tradeweave-demo.onrender.com/shop#catalog>; the public maker workspace is <https://tradeweave-demo.onrender.com/workspace#products>. On Nov 11, health, shop configuration, the three-product catalog, buyer page and maker demo all returned successfully. The buyer catalog contains three products with six image references. The latest hosted AI spot checks included a known-material answer that matched seller data and an unknown-details response that asked the buyer to confirm with the maker. The entrant also reports testing custom questions on both interfaces. These samples do not establish continuous availability. The server has three explicitly free OpenRouter fallback models and a zero prompt/completion price cap; when model requests fail, the shared assistant route returns a localized seller-fact answer or asks the maker to confirm. It does not claim general knowledge while the provider is unavailable.

The maker workspace runs in a separate shared demo database and temporary service storage. It cannot modify the main buyer catalog, questions or orders; its demo data can reset after restart. Keep the demo banner’s isolation and personal-information guidance in mind. Historical Sandbox order and phone-payment reports are entrant-reported, not repeated as part of this source update. This batch does not call PayPal, create an order, alter provider settings, or edit Devpost/video.

Render’s free service can sleep while idle and its local filesystem is temporary. The project supports an optional remote SQLite-compatible database when configured. The reported order read-back is evidence for that order only, not a full disaster-recovery guarantee.

## Checks

```sh
npm run check
```

The automated checks use isolated temporary data and simulated provider responses. On Nov 11, `npm run check` passed; 35/35 simulated AI probes passed with unexpected outbound traffic blocked; `npm run release:check` passed 579 manifest hashes, privacy/secret exclusions and isolated regressions; and `npm run public:prepare` passed the allowlisted candidate's no-secret startup check. The public candidate contains 40 allowlisted source files, excluding provider credentials and internal verification notes. Earlier clean-install and two-viewport buyer-flow checks remain recorded in the verification files. These results do not prove live provider availability, broad model answer quality, screen-reader speech, participant usability, or production readiness. See the current [evaluator setup and limitations](docs/evaluator-setup-en.md).

## License and assistance

Source code is offered under the [MIT License](LICENSE). Third-party services, generated sample images, and AI-assisted development are listed in [notices and AI-use disclosure](docs/notices-and-ai-use.md). The entrant must review authorship, rights, and the final tool/model disclosure before submitting.
