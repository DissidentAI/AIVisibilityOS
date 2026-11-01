# AI Visibility OS — Community

Self-hosted AI visibility measurement with auditable evidence. It measures explicit brand mentions in a defined sample of official API responses. **API observations are not observations of consumer ChatGPT, Gemini or Kimi interfaces.**

The usable slice includes owner registration, encrypted credentials, projects and competitors, tracked queries, OpenAI/Gemini/Kimi/OpenRouter and **direct Xiaomi MiMo adapters using your Xiaomi API key**, a durable PostgreSQL queue, spending reservations, response evidence, charts, historical comparisons and CSV export. Project drafts and campaign preferences persist per account in the same browser, excluding secrets. See [provider profiles, costs and browser persistence](PROVIDERS.md). French/English/Simplified Chinese and light/dark modes are included. No production demo responses are generated.

## Retry and review

Failed, invalid and interrupted responses can be retried individually or together from **History & exports**, with a cost preview and an explicit confirmation. Retries remain in the same canonical campaign, preserve previous attempts and costs, and never repeat successful responses. Duplicate launches are blocked. Retry samples are excluded from automatic historical comparisons. History has search, provider/status filters, incident explanations and mobile cards. **GEO opportunities** separates observed mention gaps, hypotheses and suggested editorial actions, with direct access to evidence. It does not crawl your website or establish causation. See the [product audit](AUDIT-2026-11-01.md).

**Site audit** separately crawls bounded public HTML for your brand and up to ten competitors, respects robots rules and protects against SSRF. It provides observed page comparisons, technical evidence, CSV/JSON exports and an optional budgeted AI synthesis. See [scope, security and limitations](SITE-AUDIT.md).

## Start locally

Use Node 24 (minimum 22.12).

```sh
npm ci
npm run setup
npm run db:local
```

Keep PostgreSQL running; in another terminal:

```sh
npm run db:migrate
npm run dev
```

Start `npm run worker` in a third terminal, then open `http://localhost:3000`. Register the installation owner using `BOOTSTRAP_TOKEN` from `.env`. Registration closes after the first account. Create a project, add competitors/questions, save your API keys in Settings and launch a measurement.

`APP_URL` must exactly match the browser origin. Never commit `.env`. The database helper is for local development only, listens on loopback and uses a known development password. Docker generates a separate random database password.

## Docker and verification

After generating `.env`, run `docker compose up --build -d`. See [deployment](DEPLOYMENT.md) for HTTPS, backups and restore commands, compatible with Hostinger and other Docker VPS hosts.

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
npm audit
```

Tests use isolated `_test` databases and clearly labeled synthetic provider fixtures. No real provider connection is claimed until tested with authorized credentials. See [validation](VALIDATION.md).

## Method and scope

The visibility score equals the explicit brand mention rate: `100 × mentioning valid responses / all valid responses`. Failures, refusals and truncated outputs are excluded. Zero valid responses means no score. Wilson intervals describe sample uncertainty under independence assumptions; correlated outputs and prompt selection limit inference. A mention is not an endorsement. No average ranking or automatic sentiment score is invented.

Country is textual prompt context, not geolocation. Baseline mode does not request search; web mode is available for all five providers. Direct MiMo requires activating the Web Search plugin in the Xiaomi console. Kimi uses its Responses API; retrieved pages remain distinct from explicit answer citations. OpenRouter uses its bounded Exa server tool. Generated text URLs are not promoted to verified citations. Full provider metadata is retained. Exact models and pricing are captured in each campaign configuration. See [methodology](METHODOLOGY.md).

To use your Xiaomi key, select **Settings → Connect a key → Xiaomi MiMo**. The direct connector uses `mimo-v2.6-pro` at Xiaomi's official pay-as-you-go endpoint; no OpenRouter account is required. The separate Xiaomi Token Plan is not supported by this endpoint. Saving a key in the UI and starting a manual campaign first check authentication using a read-only endpoint, without text generation. A successful check does not guarantee model access or available credit. A rejected Kimi key must be replaced with a valid Kimi API Platform key; retries cannot repair it. If a worker receives 401, it stops that campaign's remaining queued requests for the same provider and releases their reservations.

This release supports one owner per installation. Persistent daily/weekly campaigns, explicit web-search measurements, preflight cost previews and branded PDF reports with immutable JSON evidence are available; see [agency workflows](AGENCY-WORKFLOWS.md). Teams, automatic report delivery, outbound alerts, audit action tracking, Stripe and a hosted multi-tenant service remain future work. See [roadmap](ROADMAP.md) and [security](../SECURITY.md).

## Open source and business

AGPL-3.0-only allows commercial use and competing hosting. Operators must comply with its source availability obligations; there is no warranty. See [license decision](LICENSE-DECISION.md). The repository is not made public automatically.

No Hostinger approval or referral URL is fabricated. Only an official issued deploy button may be added after onboarding. The €39/€99/€249 offers are hypotheses, not active subscriptions. [Business validation and cost model](BUSINESS.md).

## Interface and remote preview

The responsive amber-and-ink interface includes glass surfaces, animated navigation, dialogs, onboarding and charts, with light/dark themes and an animation pause control. OS reduced-motion preferences are respected. See [design and accessibility](DESIGN.md) and [temporary HTTPS access from a phone](REMOTE-PREVIEW.md).

## Parallel scans and readable evidence

Scans now use concurrent, PostgreSQL-coordinated calls with per-model ceilings, 15% request/token headroom, gradual ramp-up and provider cooldowns. Set your account quotas in **Settings → Scan speed**. See [execution controls](EXECUTION.md) for official sources, defaults and limitations.

AI answers render Markdown with safe links, tables and code. Copy or download the displayed text, or switch to the unchanged Markdown source for `.md` export. See [answer exports](ANSWER-EXPORTS.md). The supplied A/star logo is used throughout the interface.

## Planning, suggestions and multilingual reports

New competitors can be compared against saved answers without another scan or API key. Choose **Current competitors** to reanalyze literal names/domains locally, or **Original brands** to inspect the original results. CSV and new reports record the selected scope; existing answers, costs and saved reports are preserved.

The interface and PDF reports support French, English and Simplified Chinese, with independent report language selection. Add questions in batches, generate contextual AI suggestions, edit saved project/scan settings and retry failures within one campaign. See the [FR / EN / 中文 guide](PLANNING-AND-REPORTS.md) for behavior, budgets and evidence preservation.
