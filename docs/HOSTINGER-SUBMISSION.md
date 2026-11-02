# Dossier de candidature Hostinger — AI Visibility OS

Préparé le **2 novembre 2026** pour **v0.2.0-beta.1**. Ce document contient les textes à copier dans le formulaire ; les intitulés de champs ci-dessous sont indicatifs, pas une reproduction du schéma interne Hostinger.

## Informations à renseigner

| Élément                            | Valeur                                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Nom                                | AI Visibility OS                                                                                          |
| Mainteneur                         | DissidentAI — https://github.com/DissidentAI                                                              |
| Dépôt                              | https://github.com/DissidentAI/AIVisibilityOS                                                             |
| Version proposée                   | v0.2.0-beta.1 — Community beta                                                                            |
| Licence du code original           | AGPL-3.0-only                                                                                             |
| Catégories suggérées               | Analytics, SEO/GEO, developer tools                                                                       |
| Déploiement demandé                | VPS Linux avec Docker Compose v2                                                                          |
| Langues d’interface et de rapports | Français, anglais, chinois simplifié                                                                      |
| Modèle économique Community        | Gratuit et auto-hébergeable ; frais API payés directement aux fournisseurs avec les clés de l’utilisateur |
| Contact                            | Profil GitHub du mainteneur et issues du dépôt ; aucun email non vérifié fourni                           |

Le dépôt est préparé pour publication mais sa visibilité et le statut de la release doivent être vérifiés avant envoi. Aucune approbation Hostinger ni affiliation active n’est revendiquée.

## Description courte — français

Plateforme open source pour mesurer comment les API d’IA mentionnent une marque et ses concurrents. Vérifiez les réponses, suivez leur évolution et préparez des rapports clients avec des preuves consultables. Auto-hébergement et propres clés API.

## Short description — English

Open-source AI visibility analytics for agencies and brands. Measure brand and competitor mentions in official AI API responses, inspect the evidence, compare compatible campaigns and create client reports. Self-hosted with your own API keys.

## Full description — English

AI Visibility OS helps small marketing agencies and brands understand how they appear in a defined set of questions submitted to official AI APIs. It stores responses, requested and returned models, timestamps, parameters, citations when supplied, token usage and estimated costs.

Users can configure projects, track competitors, organize questions by theme, run or schedule measurement campaigns, retry failed answers without losing successful ones, and compare newly added competitors against previously collected responses without further inference calls. Private evidence links connect metrics to their underlying answers. GEO actions retain a frozen evidence record, while historical comparisons explain which campaigns are compatible. The application also provides bounded public-site audits, CSV/Markdown exports and PDF reports in French, English and Simplified Chinese.

The Community beta runs on a Linux VPS using Docker Compose, PostgreSQL, a persistent worker and an HTTPS reverse proxy. Each installation has one owner and uses the owner's provider credentials. API observations are explicitly distinguished from consumer chatbot interfaces. No guaranteed ranking improvements, public SaaS tenancy or Hostinger endorsement are claimed.

## Technical review notes — English

- **Runtime:** Next.js/React on Node 24, PostgreSQL 18, persistent Node worker, Drizzle migrations, Caddy HTTPS. No Redis dependency.
- **Services:** `db`, one-shot `migrate`, `web`, `worker`, `proxy`. Only the proxy publishes ports 80/443. Database and application ports are private to the Compose network.
- **Template:** `deploy/compose.hostinger.yaml`. It builds web/worker/proxy from the versioned Git tag; no host-side source files or bind-mounted Caddyfile are needed. The repository/tag must be publicly readable for anonymous builds. `AI_VISIBILITY_SOURCE` is an advanced source override used in CI, not a secret or required onboarding field.
- **Secrets:** `ENCRYPTION_KEY` (64 lowercase hex characters), `POSTGRES_PASSWORD` (48 hex), `BOOTSTRAP_TOKEN` (48 hex), generated independently. The private `.env.hostinger` generator refuses overwrites and symlinks. No shared default password. API keys are added later in the authenticated interface and are not necessary to install the app.
- **Domain:** `APP_DOMAIN` is an owned DNS hostname; `APP_URL` must be exactly `https://APP_DOMAIN`. Validation runs before migrations/web startup. Hostinger may populate equivalent values through its environment editor. Domain DNS and open ports are needed for public ACME issuance.
- **Persistence:** named PostgreSQL and Caddy volumes. Recreating containers preserves the volumes. Back up the database, environment configuration and encryption key separately.
- **Initial access:** a bootstrap token is required to create the owner. Further registration is closed. A fresh installation contains no customer data or demo measurements.
- **Costs:** app installation itself triggers no AI generation. The default installation ceiling is USD 20/month, with a lower organization ceiling, and each manual campaign has a cost preview. API/provider terms and quotas still apply.
- **Resource starting point:** 2 vCPU / 4 GiB RAM / 20 GiB disk is a provisional starting point for building and a small pilot, not a measured service-level guarantee. Retention and response volume affect storage. A load test on the target VPS remains necessary.
- **Verification:** GitHub CI tests application workflows, clean Docker startup, database migration and backup restore. The Hostinger candidate additionally exercises the reverse proxy with a private test CA, HTTP→HTTPS redirect, secure cookies and persistent data after container recreation. Public certificate issuance and the actual hPanel deployment path still need a real VPS acceptance test.
- **Known limits:** one owner, no team roles/SSO/MFA, no managed subscriptions, no outgoing alerts. Provider tests are predominantly contract fixtures; live generation is not certified for every listed provider/account. Native image-processing dependencies retain their separate licenses and notices.

## Pièces du dossier

- README, [licence](../LICENSE), [sécurité](../SECURITY.md), [notices tierces](../THIRD_PARTY_NOTICES.md), [notes de version](../CHANGELOG.md).
- [Installation Hostinger](HOSTINGER.md), [exploitation et restauration](DEPLOYMENT.md), [validation](VALIDATION.md), [checklist de publication](RELEASE-CHECKLIST.md).
- Logo fourni par le mainteneur : `src/assets/brand-mark.png`.
- Captures : `docs/screenshots/overview-light.png`, `overview-dark.png`, `sign-in-mobile.png`, `response-markdown-mobile.png`, `reports-chinese-mobile.png`.
- Les captures proviennent de l’application réelle en environnement de test. Les vues de démarrage n’affichent aucune mesure ; les réponses/rapports de test sont synthétiques et ne constituent pas des résultats clients.
- Archives de release : source complète, dossier de présentation, notices tierces, SBOM CycloneDX, manifeste du commit et `SHA256SUMS`. Ne jamais joindre `.env`, `.env.hostinger`, `.local` ou une sauvegarde de base.

## Texte d’accompagnement — français

Bonjour,

Je vous propose AI Visibility OS, une application open source sous AGPLv3 destinée aux petites agences marketing et aux marques. Elle mesure les mentions de marques dans les réponses d’API IA et fournit des preuves vérifiables, des comparaisons historiques et des rapports clients multilingues.

La version proposée est une bêta Community auto-hébergeable sur VPS avec Docker Compose, PostgreSQL, un worker persistant et HTTPS. Le dépôt contient un modèle de déploiement autonome, la génération des secrets, les migrations, les tests et les procédures de sauvegarde/restauration. L’installation ne nécessite aucune clé IA ; les utilisateurs connectent ensuite leurs propres fournisseurs.

Je souhaite faire vérifier sa compatibilité avec votre programme Open-source partners et le parcours de déploiement depuis hPanel. Les limites de la bêta et la distinction entre observations API et interfaces grand public sont documentées. Merci de m’indiquer les éventuelles adaptations spécifiques à votre catalogue et de me fournir le bouton officiel après validation.

## Dernières étapes réservées au propriétaire

1. Autoriser la publication du dépôt et de la release bêta, puis vérifier leurs liens sans authentification. Une release en brouillon ou un dépôt privé n’est pas accessible au réviseur externe.
2. Inscrire le dépôt dans **hPanel → Source libre → Inscrivez votre application**. Choisir le parcours VPS/Docker Compose si ce choix est proposé ; cette architecture comprend PostgreSQL et un worker distinct.
3. Fournir les textes/pièces demandés, sans secret ni données clients. Ne déclarer « déploiement en un clic validé » qu’après le test du parcours réel.
4. Récupérer le lien/Markdown officiel et le code partenaire réellement délivrés. Les intégrer au README avec une mention d’affiliation ; aucun lien ne doit être inventé.
5. Effectuer la recette sur un VPS autorisé, avec un domaine et un budget validés. L’acceptation, les commissions et modalités de versement dépendent de Hostinger.

Sources officielles vérifiées le 2 novembre 2026 : [programme Open-source partners](https://www.hostinger.com/open-source-partners), [Docker Manager VPS](https://www.hostinger.com/support/12040815-how-to-deploy-your-first-container-with-hostinger-docker-manager/), [contextes de build Git Docker](https://docs.docker.com/build/concepts/context/).
