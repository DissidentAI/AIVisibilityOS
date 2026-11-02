# Changelog

## 0.2.0-beta.1 — 2026-11-02

First packaged Community beta candidate for self-hosted agency installations.

- API-based brand and competitor measurement with OpenAI, Google Gemini, Kimi, OpenRouter and direct Xiaomi MiMo adapters; request provenance, citations when actually returned, budgets and provider-specific execution limits.
- Direct private evidence links, reusable question themes/intent/priority views, GEO action tracking with immutable evidence, and a paginated history that explains comparability exclusions.
- Retry failed measurements inside their original campaign while retaining successful answers and earlier attempts. Compare newly added brands against collected responses without new inference calls.
- Website audits, scheduled campaigns, evidence exports, multilingual PDF reports and French/English/Simplified Chinese interface.
- Standalone Hostinger VPS Compose candidate with a pinned source tag, built-in HTTPS proxy, private environment generator and fail-closed configuration validation. No local configuration bind mounts are required by the production template.
- Dependency notices included in application Docker images; reproducible source packaging, software bill of materials and checksums; Git history secret scanning in CI.
- Prevent background reads from starting between the beginning of a WebKit page reload and the old document's `pagehide`, including when previous requests have already finished. CSV and account exports explicitly download without navigating away. Writes are never replayed automatically.
- Keep evidence search text and selected filters in sync during typing, before updating the private evidence link.

### Upgrade

All migrations through `0012_numerous_stick.sql` are included. Back up the database and encryption key, drain the worker, then follow [DEPLOYMENT.md](docs/DEPLOYMENT.md). Migration 0012 is additive and preserves recorded measurements. Do not switch an existing Compose installation to a new project name: it would select different volumes. Keep the current deployment method for upgrades; the Hostinger template is intended for new installations.

### Beta limits

One owner per installation. No team accounts, Stripe subscriptions, outgoing alerts or automated report delivery. No claim of public-consumer ChatGPT/Gemini/Kimi visibility. Provider contract tests use synthetic responses and do not certify every account/model's live availability. Hostinger catalogue approval, a public VPS acceptance test and an official affiliate button are not included in this release candidate. Review [SECURITY.md](SECURITY.md) before exposure.
