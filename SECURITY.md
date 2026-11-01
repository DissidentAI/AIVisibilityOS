# Security policy

This is a Community MVP for a single owner per installation. Do not enable shared cloud tenancy by adding a public registration endpoint. Cross-organization tests exist, but an independent audit, threat modelling and broader tenant/role coverage are prerequisites for a hosted service.

## Implemented controls

- Passwords: salted Node scrypt, N=32768, r=8, p=3, 64-byte output, constant-time comparison. This is one of the [OWASP recommended scrypt configurations](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- Random 256-bit session tokens, only SHA-256 hashes persisted, seven-day absolute expiry, HttpOnly/SameSite cookies and Secure on HTTPS.
- Bootstrap token required for the first account; PostgreSQL advisory lock closes concurrent signup races. No second owner registration.
- Database-backed authentication/write/campaign rate limits and exact Origin checks on mutations. No trust in user-supplied organization identifiers.
- Server-side organization scoping and composite foreign keys for project/run/response relations. The worker is a trusted service with database access, not a user-facing API.
- API keys encrypted using AES-256-GCM with a unique nonce and organization/provider authenticated context. Key values are never returned in state or personal-data exports.
- Parameterized SQL and Zod validation; bounded HTTP request bodies and provider responses; official fixed API endpoints only, redirects rejected.
- Site audits only crawl configured project/competitor domains and their www variants. Every connection and redirect validates all DNS answers, pins a public IP and verifies the TLS hostname. Cookies, arbitrary ports, private networks, scripts and forms are excluded; robots rules, persistent domain pacing, global crawl leases, size/time/page bounds and daily quotas apply. Content is untrusted evidence. Citation links are not automatically crawled. See [SITE-AUDIT.md](docs/SITE-AUDIT.md). Add network-level egress restrictions as defense in depth on hosted infrastructure. Consumer interface scraping is not used.
- API responses displayed as text. CSV formulas prefixed safely. Security headers and frame denial. CSP currently permits inline scripts/styles for Next.js; nonce-based strict CSP is future hardening.
- Budget reservation and worker claiming are transactional. Raw upstream errors and SQL error objects are not logged, to avoid leaking secrets.
- Export and deletion with password confirmation; configurable response retention. Backups are the operator’s responsibility.

## Operations and known limits

Protect PostgreSQL, `.env`, backups, root/SSH access and encryption keys. Loss of `ENCRYPTION_KEY` makes stored API keys unrecoverable; save it separately from database dumps in a secured secret store. Rotation currently requires replacing the encryption key and re-entering provider keys during maintenance. No automated key rotation, MFA, SSO, email verification or email password reset is implemented. Local owner recovery requires authenticated server access; see deployment guide.

The application has application-layer tenant isolation, not PostgreSQL RLS. Rate limiting is installation/account based; deploy appropriate ingress protection before exposing a public endpoint. Cookie sessions are bearer credentials. A stolen server or database credential is outside the guarantees of application-layer authorization.

Do not add personal or confidential information to tracked questions without an appropriate basis. They are sent to external model providers. Review paid/free-tier data processing terms, international transfers, DPAs, subprocessors and retention for your context. These controls prepare for GDPR work; they do not constitute GDPR certification or legal compliance by themselves.

Retention defaults to 365 days for completed campaigns. Usage records persist at least 62 days and at least the configured retention to preserve budget accounting. The worker performs housekeeping; if it is offline, housekeeping pauses. Exports are authenticated but large exports are currently held in memory, so use bounded retention on large installations. Deletes cascade through organization-owned data; external provider records and operator backups follow their own retention policy.

## Reporting

Use GitHub **Security → Report a vulnerability** if private vulnerability reporting has been enabled on the repository. If it is unavailable, contact the repository owner privately through an existing verified channel. Do not post keys, personal data or exploit details in a public issue. No unverified security email address is supplied.

Only the current release branch is supported during the MVP stage. Pin dependencies, run `npm audit` and review official API/pricing changes before upgrading production. See `docs/VALIDATION.md` for the evidence actually collected.

## Agency workflows (0.2)

Scheduling shares the transactional spending gate with manual campaigns. One due occurrence creates at most one run, even across worker replicas. Schedule configuration is frozen and scoped to its organization/project. Pause leaves previously queued work intact. Resume does not replay overdue calls.

Reports and evidence bundles require authentication and organization ownership. No public share link is created. Agency logos accept only bounded PNG/JPEG uploads, decode with a pixel limit, and are normalized through Sharp; no remote logo fetch or SVG interpretation. PDF content uses plain text rather than HTML. Google Search suggestions use an opaque-origin sandboxed iframe without scripts, forms, top navigation or parent access; provider HTML is never injected into the application DOM. Report exports and schedule data are included in personal exports and deletion/retention policies.

These additions do not enable public signups or collaborator access. Review the documented provider/model retirement and conservative cost conventions before enabling paid scheduled calls.
