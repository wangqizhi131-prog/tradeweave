# TradeWeave

**Commerce, with context.** TradeWeave is a prototype for independent makers. A seller maintains bilingual product facts; buyers can review product options, ask questions, and check out with PayPal Sandbox.

> **Evaluation status (checked 2026-11-05; hosted revision `7fb38ab`):** A hosted buyer preview is available at <https://tradeweave-demo.onrender.com/shop#catalog>. The live health check returned `ok`; the public shop configuration reports AI and PayPal credentials configured, remote persistence mode, and three fictional catalog products. These configuration signals do not prove a successful hosted AI response or hosted PayPal approval/capture. A one-time hosted persistence check wrote a marked test buyer question, restarted Render, read the same record back, then deleted it and confirmed zero matching rows remained in Turso. This verifies that record across one service restart; it is not a backup or disaster-recovery test. User-provided Render and Turso billing screenshots dated 2026-11-05 showed free plans, no payment method, and $0 current/unbilled charges, with usage within displayed free quotas; this is point-in-time evidence and does not guarantee future free access or policy. The hosted maker workspace is disabled because the public app has no hosted maker login or role system; use the local build for maker tasks. One USD 68 PayPal Sandbox checkout was completed locally through the storefront JavaScript SDK and read back as completed by PayPal and TradeWeave; no real money moved. Bounded live OpenRouter requests have succeeded, and an empty-model response has also occurred. Continuous free AI availability is not guaranteed. Without provider credentials the local build correctly reports live AI and PayPal as unavailable. Never put credentials in this repository. The demo is not a production payment service.

## What works in the local build

- A local maker workspace for product drafts, bilingual facts, options, images, buyer questions, orders, and sandbox fulfillment.
- A separate buyer storefront with product search and filters, options, cart, product questions, and My orders.
- Five interface languages: English, Simplified Chinese, Japanese, Spanish, and French. The fictional sample listings include translated product copy and supplied facts in all five. Makers must supply English and Simplified Chinese for an active listing; Japanese, Spanish, and French copy is optional and missing translations show a clear fallback notice.
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

The maker workspace is restricted to a direct local connection. The default no-credential build does not fake AI answers or payment success.

## Provider setup

Provider credentials are optional for local browsing and editing. To test integrations, copy `.env.example` to `.env`, configure credentials locally, and restart the server. Never commit `.env` or share secrets in screenshots or issue reports.

- **PayPal:** Use a PayPal Developer Sandbox REST app and a separate Sandbox Personal buyer account. The app's server API and browser SDK are configured for Sandbox. Never use a production account for testing.
- **AI:** Configure an OpenAI-compatible chat-completions endpoint, key, and model. This source bundle does not provide model credits or guarantee that any provider is free. A hackathon evaluator path must be verified as free and usable before submission; evaluators must not be asked to purchase credits or expose private keys.

See [evaluator setup and limitations](docs/evaluator-setup-en.md) for exact boundaries.

## Hosted buyer preview

The Render Blueprint (`render.yaml`) backs the public buyer preview at <https://tradeweave-demo.onrender.com/shop#catalog>. On 2026-11-05, `/healthz` returned `ok`, `/api/shop/config` reported AI and PayPal configured and remote persistence, and the store API returned three fictional products. A marked test buyer question survived one Render service restart and was then removed from Turso; no matching test row remained. This is a bounded one-time persistence check, not a general backup guarantee. Hosted PayPal approval/capture has not been verified. The hosted maker workspace is intentionally disabled because no hosted maker login or role system exists.

The Free service sleeps after 15 minutes without traffic and may take about a minute to wake. Its filesystem is temporary. OpenRouter's free router may be rate-limited or unavailable; the Blueprint does not guarantee model capacity for the judging period. The live AI flow has returned both useful answers and an empty-model failure, so use its retry or maker handoff path when needed.

Keep Render and Turso on Free plans, do not add a payment method or enable paid overages, and recheck both billing pages before and after evaluation. User-provided dashboard screenshots dated 2026-11-05 showed Free plans, no payment methods, and $0 current/unbilled charges; provider quotas and policies can change, so availability and zero-cash access through the judging period are not guaranteed.

## Checks

```sh
npm run check
```

The automated checks use isolated temporary data and simulated provider responses. They do not prove live provider availability, model answer quality, physical-device behavior, or production readiness.

## License and assistance

Source code is offered under the [MIT License](LICENSE). Third-party services, generated sample images, and AI-assisted development are listed in [notices and AI-use disclosure](docs/notices-and-ai-use.md). The entrant must review authorship, rights, and the final tool/model disclosure before submitting.
