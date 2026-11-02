# Community beta release checklist

This is a release procedure, not an assertion of Hostinger approval. Candidate: **v0.2.0-beta.1**.

## Before creating the draft

- [ ] Review the exact commit and migration notes; preserve existing user changes.
- [ ] Pass typecheck, unit/PostgreSQL tests, production build and browser tests.
- [ ] Pass GitHub `secrets`, `test` and `docker` jobs for that exact commit. The Docker job covers both ordinary Compose and the standalone Hostinger candidate.
- [ ] Scan the full reachable Git history with the pinned Gitleaks version, and review tracked paths for local configurations, dumps or personal data. No scanner guarantees absence of every secret.
- [ ] Review third-party notices, fonts and logo rights; preserve the original license. No blanket legal certification is implied.
- [ ] Check the source archive contains only committed project files, not `.env`, runtime databases or provider credentials.
- [ ] Generate source/submission archives, SBOM, notices and SHA-256 checksums using `npm run release:pack` from a clean tracked checkout.
- [ ] Create a draft prerelease targeting the tested commit. Attach the generated files; record the CI URL in its notes. Do not move a published tag later.

## Public transition — explicit owner authorization required

- [ ] Owner approves public repository visibility and publication of this beta.
- [ ] Verify the public default branch presents the README, license and installation limitations correctly. `private: true` in package.json only prevents accidental npm publication; it does not restrict source-code hosting.
- [ ] Publish the verified tag/release. Verify repository, archive, tag and Compose links anonymously.
- [ ] Enable GitHub private vulnerability reporting and provide a verified contact path before inviting external users to submit security reports.
- [ ] Submit the repository in hPanel with [the prepared dossier](HOSTINGER-SUBMISSION.md). Do not claim partnership or catalogue admission while pending.
- [ ] Add only the Hostinger-issued button and referral parameters. Disclose the affiliate link.

## VPS acceptance — separate authorization for deployment/purchases

- [ ] Fresh Linux VPS, Docker Engine/Compose v2, sufficient build memory, controlled DNS, ports 80/443 and restricted SSH. Do not overwrite an existing server installation.
- [ ] Generate and securely retain the unique environment values. Never regenerate an encryption key on an existing database.
- [ ] Launch the standalone template, confirm migrations/web/worker, public HTTPS and HTTP redirect. Confirm PostgreSQL/3000 are not externally published.
- [ ] Create the owner with the bootstrap token. Confirm a second signup and anonymous data access are rejected.
- [ ] With an explicitly approved API budget, test a small real campaign for each provider/mode advertised as verified. Keep those observations separate from fixture results; do not upload answers/keys to the public release.
- [ ] Restart containers without deleting volumes, then verify projects, historical responses and key decryption.
- [ ] Restore a backup into a separate database, worker disabled, and verify the encryption key plus data. Check disk/memory and retention under the expected pilot volume.
- [ ] Record acceptance results and any account/model limitations. Do not label the product as audited multi-tenant SaaS.

Publishing the source does not deploy the private local instance, publish its database, or open its accounts. The temporary phone preview is not a production deployment or a suitable permanent catalogue demo.
