# TradeWeave

**Commerce, with context.** TradeWeave is a prototype for independent makers. A seller maintains bilingual product facts; buyers can review product options, ask questions, and check out with PayPal Sandbox.

> **Evaluation status:** This public source repository is a review candidate, not a submitted entry or a verified hosted demo. It contains no provider credentials. Without credentials, the storefront and maker workspace can be explored locally, while live AI and PayPal checkout report as unavailable. The free, unrestricted AI path for judging has not yet been established. Do not present it as a working evaluation demo or submit it until that requirement and the remaining review gates are resolved.

## What works in the local build

- A local maker workspace for product drafts, bilingual facts, options, images, buyer questions, orders, and sandbox fulfillment.
- A separate buyer storefront with product search and filters, options, cart, product questions, and My orders.
- Five interface languages: English, Simplified Chinese, Japanese, Spanish, and French. Product source content is currently English and Chinese; other languages display a clear fallback notice.
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

## Free hosted preview

The repository includes a Render Blueprint (`render.yaml`) for an optional public preview. Import the public GitHub repository as a Blueprint and choose the Free web service. Do not add a payment method. Enter `AI_API_KEY`, `PAYPAL_CLIENT_ID`, and `PAYPAL_CLIENT_SECRET` only as private environment variables in Render; never commit them.

The Free service sleeps after 15 minutes without traffic and may take about a minute to wake. Its filesystem is temporary. Configure both `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to store the catalog, orders, inventory reservations, buyer questions, replies and newly uploaded image blobs in a remote SQLite-compatible database; without both values, it falls back to local SQLite, which resets when the host filesystem is cleared. Included fictional sample images are restored from the repository at startup. The hosted configuration disables the maker workspace and exposes the buyer storefront. The OpenRouter free router may be rate-limited or unavailable; this Blueprint does not guarantee free model capacity for the judging period. Do not describe it as a working demo until the deployment and both provider flows have been checked.

Turso currently lists a $0 Free plan with no credit card required. Keep the account on that plan, do not enable paid overages, and check its billing page before and after judge access. Limits and account policies can change; this project has not created or tested a hosted Turso database.

## Checks

```sh
npm run check
```

The automated checks use isolated temporary data and simulated provider responses. They do not prove live provider availability, model answer quality, physical-device behavior, or production readiness.

## License and assistance

Source code is offered under the [MIT License](LICENSE). Third-party services, generated sample images, and AI-assisted development are listed in [notices and AI-use disclosure](docs/notices-and-ai-use.md). The entrant must review authorship, rights, and the final tool/model disclosure before submitting.
