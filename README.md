# TradeWeave

**Commerce, with context.** TradeWeave is a prototype for independent makers. A seller maintains bilingual product facts; buyers can review product options, ask questions, and check out with PayPal Sandbox.

> **Evaluation status (2026-11-11):** This public source updates the v0.6.22 buyer preview at <https://tradeweave-demo.onrender.com/shop#catalog>. Render is linked to this repository's `main` branch and configured for automatic deploys; verify the deployed revision separately. The last bounded route smoke after the previous release returned HTTP 200 for health, config, catalog and buyer page; it showed three fictional products and assets JS/CSS/locales 6.69/6.32/17. One post-deploy custom material question returned HTTP 200 with a seller-matching answer. Earlier v604 checks had two custom-question 502s out of three; that and one successful answer are evidence of variable availability, not sustained reliability. This source adds OpenRouter model-level fallbacks to three explicitly named `:free` models and preserves a zero prompt/completion price cap. OpenRouter may try another model after provider downtime or rate limits, but the whole chain or gateway can still fail. The source was regression-tested with simulated provider responses; no live fallback-chain test was run. The entrant reports normal phone access outside the computer's Wi-Fi and normal functionality; the exact URL/build, device, browser and scenarios were not recorded, so this is not independent verification or a participant study. The entrant also reports a hosted Sandbox order/read-back after restart on Nov 6 and a phone Sandbox payment on Nov 9; neither was independently repeated here. Nov 11 Turso screenshots show the Starter Free plan and usage below displayed quotas, but do not show the Overages value; it remains unverified. These are bounded observations, not guarantees through judging. This is a prototype, not a production payment service.

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

The Render Blueprint (`render.yaml`) describes the hosted buyer preview at <https://tradeweave-demo.onrender.com/shop#catalog>. Render is linked to this repository's `main` branch and its service settings show automatic deploys. Verify the deployed commit before treating source changes as live. The latest post-deploy read-only smoke returned HTTP 200 for health, shop configuration, catalog and buyer product page. One custom material question then returned HTTP 200 with an answer matching the seller record; this single sample does not establish continuous availability. Earlier v604 checks had two HTTP 502 responses among three custom questions. This source adds three explicit OpenRouter `:free` model fallbacks and retains `max_price=0`; it may recover from an individual model/provider error, but not from a fully exhausted chain or gateway outage. Simulated regression checks verify the request shape and price cap; the new fallback chain has not been live-probed. No checkout, order or payment route was called in the AI checks. The entrant-reported Nov 6 order/read-back and Nov 9 phone Sandbox payment are not independent repetitions. The hosted maker workspace has no public maker login or role system.

Render may sleep an idle free service, and its filesystem is temporary. The project supports remote SQLite-compatible persistence when the configured database URL and token are present. The reported order read-back is evidence for that order only, not a full disaster-recovery guarantee. Nov 11 screenshots show the Turso Starter (Free) plan and usage below the displayed allowances, but the Overages value is not visible and remains unverified. A free plan or low usage does not prove that the account-level Overages value is off. Do not add a payment method, enable paid overages, upgrade, or buy AI credits for this evaluation.

The official rules page was checked on Nov 11; it lists a submission deadline of Nov 12, 2026 at 12:00 p.m. Pacific (Nov 13 at 04:00 Beijing), eight hours after the internal Nov 12 20:00 Beijing finish line. The demonstration video must be under three minutes, public on YouTube, and show the project functioning on its target device. Judges must have free, unrestricted access through the judging period ending Dec 15, 2026. The entrant reports that the submission and a 2:55 video were sent on Nov 5; the portal state and video have not been independently verified. The entrant will create the final demo video and handle any Devpost page changes manually. This source update does not change the Devpost page or video. See <https://paypalaihackathon.devpost.com/rules>.

## Checks

```sh
npm run check
```

The automated checks use isolated temporary data and simulated provider responses. On Nov 11, `npm run check` passed; 35/35 simulated AI probes passed with unexpected outbound traffic blocked; `npm run release:check` passed 577 manifest hashes, privacy/secret exclusions and isolated regressions; and `npm run public:prepare` passed the allowlisted candidate's no-secret startup check. The public candidate contains 40 allowlisted source files, excluding provider credentials and internal verification notes. Earlier clean-install and two-viewport buyer-flow checks remain recorded in the verification files. These results do not prove live provider availability, broad model answer quality, screen-reader speech, participant usability, or production readiness. See the current [evaluator setup and limitations](docs/evaluator-setup-en.md).

## License and assistance

Source code is offered under the [MIT License](LICENSE). Third-party services, generated sample images, and AI-assisted development are listed in [notices and AI-use disclosure](docs/notices-and-ai-use.md). The entrant must review authorship, rights, and the final tool/model disclosure before submitting.
