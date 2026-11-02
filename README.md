# TradeWeave

**Commerce, with context.** TradeWeave is a prototype for independent makers. A seller maintains bilingual product facts; buyers can review product options, ask questions, and check out with PayPal Sandbox.

> **Evaluation status:** This source bundle is a review candidate, not a submitted entry or a hosted demo. It contains no provider credentials. Without credentials, the storefront and maker workspace can be explored locally, while live AI and PayPal checkout report as unavailable. The free, unrestricted AI path for judging has not yet been established. Do not publish or submit this bundle until that requirement and the remaining review gates are resolved.

## What works in the local build

- A local maker workspace for product drafts, bilingual facts, options, images, buyer questions, orders, and sandbox fulfillment.
- A separate buyer storefront with product search and filters, options, cart, product questions, and My orders.
- Five interface languages: English, Simplified Chinese, Japanese, Spanish, and French. Product source content is currently English and Chinese; other languages display a clear fallback notice.
- SQLite-backed catalog, checkout snapshots, inventory reservations, orders, questions, and maker replies.
- A configurable OpenAI-compatible chat-completions interface and PayPal JavaScript SDK plus Orders API integration fixed to PayPal Sandbox.

The included shop and products are fictional examples. The checkout amount is USD and excludes shipping and tax. No production payment or shipping service is implemented.

## Run

Requires Node.js 24 or later. There are no npm dependencies.

```sh
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

The repository includes a [Render Blueprint](render.yaml) for a public, free-tier preview. Import this public GitHub repository as a Blueprint and choose the Free web service. Keep the account on the free plan and do not add a payment method. Enter `AI_API_KEY`, `PAYPAL_CLIENT_ID`, and `PAYPAL_CLIENT_SECRET` as private environment variables in the Render setup screen; never commit them.

The free instance sleeps after inactivity and takes about a minute to wake. Its filesystem is temporary, so sample edits, uploaded images, and order history reset whenever the instance sleeps, restarts, or redeploys. The hosted preview protects the maker workspace and exposes the buyer storefront only. The complete editable maker workspace remains available in the local build. See the [evaluator setup](docs/evaluator-setup-en.md) before relying on this preview.

## Checks

```sh
npm run check
```

The automated checks use isolated temporary data and simulated provider responses. They do not prove live provider availability, model answer quality, physical-device behavior, or production readiness.

## License and assistance

Source code is offered under the [MIT License](LICENSE). Third-party services, generated sample images, and AI-assisted development are listed in [notices and AI-use disclosure](docs/notices-and-ai-use.md). The entrant must review authorship, rights, and the final tool/model disclosure before submitting.
