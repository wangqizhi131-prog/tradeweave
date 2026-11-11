# Notices and AI-use disclosure

## Third-party services and assets

- **PayPal:** The app loads the PayPal JavaScript SDK and can call the PayPal Orders API in Sandbox. PayPal services and marks remain subject to PayPal's terms; no credentials are included.
- **AI provider:** The app supports an optional OpenAI-compatible chat-completions endpoint. Local development used OpenRouter's `openrouter/free` routing alias and a limited number of bounded fact probes; the provider may select different model versions. Requests use a zero-price cap and the source includes three free-model fallbacks. If the configured provider fails or is unavailable, the app returns a deterministic answer based on matching seller facts, or tells the buyer to ask the maker when the listing does not answer the question. This does not provide open-domain model service during an outage. These checks do not guarantee hosted access or future free capacity. No model API key or credits are included.
- **Exchange-rate estimate:** A reference USD/CNY rate may be fetched from Frankfurter/ECB. It is informational; PayPal order settlement remains USD.
- **Fonts:** Optional Google Fonts are loaded at runtime with system-font fallbacks; font files are not bundled.
- **Sample product images:** The fictional stoneware cup and linen towel use generated illustrative images. They do not evidence real inventory, provenance, or maker claims.

## AI assistance

OpenAI Codex assisted with implementation and review. The two sample product illustrations were generated with OpenAI image generation. A limited number of isolated development questions used OpenRouter's free router, which may select different models. The v606 controlled probe confirmed one request could fail over to a specifically constrained zero-priced model; v608 local regressions cover provider errors and the deterministic seller-fact fallback. These are bounded checks, not evidence of sustained hosted availability or general answer quality. Limited historical development checks used the Astropods AI Gateway. Before submission, the entrant must confirm the AI tools and model/routing details used by the actual evaluator build, describe their use accurately, and review the work and asset rights.

This project retains its MIT License. The entrant must confirm that all submitted material is original or appropriately licensed and that the submitted work reflects the entrant's ideas and direction.
