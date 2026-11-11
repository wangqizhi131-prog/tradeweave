# TradeWeave

**Commerce, with context.** TradeWeave is a prototype for independent makers. A seller maintains bilingual product facts; buyers can review product options, ask questions, and check out with PayPal Sandbox.

> **Evaluation status (2026-11-11):** This repository contains the frozen v0.6.22 public source for the buyer preview at <https://tradeweave-demo.onrender.com/shop#catalog>. The Render service is linked to this repository's `main` branch and configured for automatic deploys; verify the deployed revision separately. The last bounded read-only route check (v553, Nov 10) returned HTTP 200 for health, configuration, catalog and buyer product page, with three fictional products. Before this source update, hosted buyer assets were JS/CSS/locales 6.29/6.29/8; this release uses 6.69/6.32/17. In a bounded three-question hosted check on Nov 11 (v604), a custom material question returned HTTP 200 with a seller-matching answer; a shipping/arrival question and a cup-capacity/dimensions question returned HTTP 502. A prior request in v589 returned HTTP 200 without a retained answer body, and the entrant separately reported a manual check passed without a timestamp or retained answer. These observations show variable availability, not answer grounding or sustained reliability. This source retries one explicit upstream HTTP 502 once; this does not ensure the free route will be available. The entrant reports normal phone access outside the computer's Wi-Fi and normal functionality; the exact URL/build, device, browser and scenarios were not recorded, so this is not independent verification or a participant study. The entrant also reports a hosted Sandbox order/read-back after restart on Nov 6 and a phone Sandbox payment on Nov 9; neither was independently repeated here. Nov 11 Turso screenshots show the Starter Free plan and usage below displayed quotas, but do not show the Overages value; it remains unverified. A local OpenRouter `openrouter/free` delivery probe passed in v578 with `max_price=0`. These are bounded observations, not guarantees through judging. This is a prototype, not a production payment service.

## What works in the local build

- A local maker workspace for product drafts, bilingual facts, options, images, buyer questions, orders, and sandbox fulfillment.
- A separate buyer storefront with product search and filters, options, cart, product questions, and My orders. The three chat suggestions are shortcuts; buyers can enter their own questions, which are sent to the AI with the selected product's seller-maintained facts. Replies are accompanied by related facts and a clear state for relevant details the seller has not supplied; the interface does not claim sentence-level citation verification.
- Five interface languages: English, Simplified Chinese, Japanese, Spanish, and French. The fictional sample listings include translated product copy and supplied facts in all five. Required listing fields need English and Simplified Chinese for an active listing; Japanese, Spanish, and French copy is optional. When available content lacks the selected language, the storefront shows a fallback notice.
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

The Render Blueprint (`render.yaml`) describes the hosted buyer preview at <https://tradeweave-demo.onrender.com/shop#catalog>. Render is linked to this repository's `main` branch and its service settings show automatic deploys. Verify the deployed commit before treating source changes as live. The latest bounded public-route evidence is v553 (Nov 10): health, shop configuration, catalog, and buyer product page returned HTTP 200 after an initial timeout; no AI, PayPal, order, or write route was called. In a bounded three-question hosted check on Nov 11 (v604), one seller-fact question returned HTTP 200; two compound custom questions returned HTTP 502. A separate user-reported manual check passed but has no retained time, prompt or answer. This source retries one explicit upstream HTTP 502 once; timeouts, 429 responses and ambiguous results are not replayed. The retry is subject to free-route availability and does not establish answer quality or sustained availability. Before this source update, hosted buyer assets were JS/CSS/locales 6.29/6.29/8; this release uses 6.69/6.32/17. The entrant-reported Nov 6 order/read-back and Nov 9 phone Sandbox payment are not independent repetitions. The hosted maker workspace has no public maker login or role system.

Render may sleep an idle free service, and its filesystem is temporary. The project supports remote SQLite-compatible persistence when the configured database URL and token are present. The reported order read-back is evidence for that order only, not a full disaster-recovery guarantee. Nov 11 screenshots show the Turso Starter (Free) plan and usage below the displayed allowances, but the Overages value is not visible and remains unverified. A free plan or low usage does not prove that the account-level Overages value is off. Do not add a payment method, enable paid overages, upgrade, or buy AI credits for this evaluation.

The official rules page was checked on Nov 11; it lists a submission deadline of Nov 12, 2026 at 12:00 p.m. Pacific (Nov 13 at 04:00 Beijing), eight hours after the internal Nov 12 20:00 Beijing finish line. The demonstration video must be under three minutes, public on YouTube, and show the project functioning on its target device. Judges must have free, unrestricted access through the judging period ending Dec 15, 2026. The entrant reports that the submission and a 2:55 video were sent on Nov 5; the portal state and video have not been independently verified. The entrant will create the final demo video and handle any Devpost page changes manually. This source update does not change the Devpost page or video. See <https://paypalaihackathon.devpost.com/rules>.

## Checks

```sh
npm run check
```

The automated checks use isolated temporary data and simulated provider responses. On Nov 11, `npm run check` passed; 35/35 simulated AI probes passed with unexpected outbound traffic blocked; `npm run release:check` passed 577 manifest hashes, privacy/secret exclusions and isolated regressions; and `npm run public:prepare` passed the allowlisted candidate's no-secret startup check. The public candidate contains 40 allowlisted source files, excluding provider credentials and internal verification notes. Earlier clean-install and two-viewport buyer-flow checks remain recorded in the verification files. These results do not prove live provider availability, broad model answer quality, screen-reader speech, participant usability, or production readiness. See the current [evaluator setup and limitations](docs/evaluator-setup-en.md).

## License and assistance

Source code is offered under the [MIT License](LICENSE). Third-party services, generated sample images, and AI-assisted development are listed in [notices and AI-use disclosure](docs/notices-and-ai-use.md). The entrant must review authorship, rights, and the final tool/model disclosure before submitting.
