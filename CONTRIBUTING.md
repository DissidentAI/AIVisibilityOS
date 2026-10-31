# Contributing

Merci / Thank you. Start with the [README](README.md) and [measurement methodology](docs/METHODOLOGY.md).

1. Explain the user problem and intended observable behavior in an issue or draft PR.
2. Create a focused branch. Do not commit `.env`, local databases, customer responses or provider credentials.
3. Use Node 24, `npm ci`, `npm run setup`, `npm run db:local` and `npm run db:migrate`.
4. Add meaningful tests for measurement changes, authorization, money/budget logic and provider parsing. Synthetic data belongs under `tests/` and must not appear in production statistics.
5. Run `npm run typecheck`, `npm test`, `npm run build` and `npm run test:e2e` for a user flow change. See the README for browser installation.
6. Generate migrations with `npm run db:generate`; inspect SQL, apply to an empty test database and an existing schema. Never rewrite an applied release migration.
7. Include French and English labels, accessible form names, keyboard behavior and mobile layout for interface changes.
8. Describe validation and known limitations in the PR. Never claim a live API connection was tested when only fixtures were used.

Adapters must use documented official endpoints, retain provenance/usage, handle refusal/truncation and exclude invalid responses from denominators. Do not infer rankings, invent citations or activate unbudgeted tools/retries. Changing model defaults or methodology requires explicit versioning and comparison review.

Contributions are accepted under AGPL-3.0-only, the same license as this project. Contributors retain their copyright. No copyright assignment or dual-licensing permission is implied by contributing. Third-party code/assets must retain required attribution and compatible licenses.
