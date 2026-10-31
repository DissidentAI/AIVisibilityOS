# AI Visibility OS — Community

Self-hosted AI visibility measurement with auditable evidence. It measures explicit brand mentions in a defined sample of official API responses. **API observations are not observations of consumer ChatGPT or Gemini interfaces.**

The usable slice includes owner registration, encrypted credentials, projects and competitors, tracked queries, OpenAI/Gemini adapters, a durable PostgreSQL queue, spending reservations, response evidence, charts, historical comparisons and CSV export. French/English and light/dark modes are included. No production demo responses are generated.

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

Country is textual prompt context, not geolocation. Web search is disabled in the initial configurations; generated text URLs are not promoted to verified citations. Full provider metadata is retained. Exact models and pricing are captured in each campaign configuration. See [methodology](METHODOLOGY.md).

This release supports one owner per installation. Persistent daily/weekly campaigns, explicit web-search measurements, preflight cost previews and branded PDF reports with immutable JSON evidence are available; see [agency workflows](AGENCY-WORKFLOWS.md). Teams, automatic report delivery, outbound alerts, content audits, GEO recommendations, Stripe and a hosted multi-tenant service remain future work. See [roadmap](ROADMAP.md) and [security](../SECURITY.md).

## Open source and business

AGPL-3.0-only allows commercial use and competing hosting. Operators must comply with its source availability obligations; there is no warranty. See [license decision](LICENSE-DECISION.md). The repository is not made public automatically.

No Hostinger approval or referral URL is fabricated. Only an official issued deploy button may be added after onboarding. The €39/€99/€249 offers are hypotheses, not active subscriptions. [Business validation and cost model](BUSINESS.md).

## Interface and remote preview

The responsive amber-and-ink interface includes glass surfaces, animated navigation, dialogs, onboarding and charts, with light/dark themes and an animation pause control. OS reduced-motion preferences are respected. See [design and accessibility](DESIGN.md) and [temporary HTTPS access from a phone](REMOTE-PREVIEW.md).
