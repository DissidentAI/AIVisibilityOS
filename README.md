# AI Visibility OS

**Montrez à vos clients comment les IA parlent de leur marque. Avec les réponses pour le prouver.**

[English](docs/README.en.md) · [Bêta v0.2.0-beta.1](https://github.com/DissidentAI/AIVisibilityOS/releases/tag/v0.2.0-beta.1) · [Installation Hostinger](docs/HOSTINGER.md) · [Méthodologie](docs/METHODOLOGY.md) · [AGPL-3.0-only](LICENSE)

[![Vérification des workflows Community](https://github.com/DissidentAI/AIVisibilityOS/actions/workflows/ci.yml/badge.svg?branch=codex%2Fcommunity-mvp)](https://github.com/DissidentAI/AIVisibilityOS/actions/workflows/ci.yml)

AI Visibility OS est une plateforme open source et auto-hébergeable pour les petites agences marketing, les consultants GEO/AEO et les marques. Configurez vos questions, mesurez les mentions de votre marque et de ses concurrents, examinez les preuves et préparez des rapports clients en français, anglais ou chinois simplifié.

Vos données restent dans votre installation. Vous connectez vos propres clés API ; les questions sont envoyées aux fournisseurs sélectionnés pour les analyses concernées. Les frais d’API et d’hébergement restent à votre charge. Aucun abonnement à AI Visibility OS n’est nécessaire pour utiliser cette version Community.

> **Périmètre de mesure :** l’application observe un échantillon explicite de réponses des **API officielles**. Ces réponses ne sont pas celles des interfaces grand public ChatGPT, Gemini ou Kimi. Elle ne mesure pas toute la visibilité d’une marque sur Internet.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/overview-dark.png">
  <img alt="Tableau de bord AI Visibility OS, avant la première campagne, avec navigation, projets et indicateurs sans données" src="docs/screenshots/overview-light.png" width="1440">
</picture>

_Interface réelle, configuration de test Karburo : aucune mesure simulée dans cette vue. [Voir le mode clair](docs/screenshots/overview-light.png) · [Voir le mode sombre](docs/screenshots/overview-dark.png)._

## De la question au rapport client

| Votre besoin                   | Ce que la bêta permet                                                                                                                                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mesurer une présence**       | Plusieurs projets, jusqu’à 50 concurrents et 50 questions par projet, 1 à 5 échantillons par question et fournisseur. Chaque réponse conserve sa provenance, sa date, ses paramètres et son coût estimé.                           |
| **Vérifier un résultat**       | Accès direct et authentifié aux réponses depuis une marque ou une question ; Markdown lisible, recherche, filtres, copie et exports texte, Markdown et CSV. Citations uniquement lorsqu’elles sont effectivement retournées.       |
| **Comparer dans le temps**     | Historique paginé, campagnes comparables identifiées et exclusions expliquées. Ajoutez de nouveaux concurrents aux réponses déjà collectées, sans nouvel appel IA et en conservant le périmètre d’origine.                         |
| **Organiser le travail**       | Questions par thème, intention et priorité ; vues enregistrées, ajout par lots, propositions de questions et de concurrents assistées par l’IA, paramètres de projet et de scan modifiables.                                       |
| **Passer à l’action**          | Opportunités GEO séparant faits, hypothèses et actions suggérées ; suivi des actions avec preuves archivées. Audit borné des pages publiques du site et de 10 concurrents, avec synthèse IA facultative.                           |
| **Livrer un rapport**          | PDF en français, anglais ou chinois simplifié, nom et logo d’agence, comparaison compatible et dossier de preuves JSON figé. Rapports générés à la demande.                                                                        |
| **Automatiser avec un budget** | Campagnes quotidiennes ou hebdomadaires, file persistante, appels parallèles limités par fournisseur/modèle et pauses sur limitation de débit. Reprise des seuls échecs dans la même campagne, sans effacer les réponses réussies. |

L’interface comprend des thèmes clair et sombre, une navigation mobile, des brouillons mémorisés dans le navigateur par compte et des animations désactivables. Les préférences de réduction des animations sont respectées. Les clés API ne sont jamais conservées dans le stockage du navigateur.

### Fournisseurs pris en charge

**OpenAI · Google Gemini · Kimi / Moonshot AI · OpenRouter · Xiaomi MiMo en direct**

Chaque fournisseur utilise son API officielle. Votre clé Xiaomi fonctionne avec le connecteur MiMo direct, sans compte OpenRouter. Le mode avec recherche web est disponible pour les cinq connecteurs, sous réserve du modèle et des droits du compte ; MiMo requiert l’activation de son plugin Web Search. Les pages trouvées sont distinguées des citations explicites de la réponse.

Les modèles, endpoints, tarifs de référence, limites et prérequis sont documentés dans le [guide des fournisseurs](docs/PROVIDERS.md). Les tests simulés vérifient les contrats des adaptateurs ; ils ne certifient pas l’accès réel de chaque compte à chaque modèle.

## Installer avec Docker

Prérequis : **Git, Docker Engine ou Docker Desktop, et Docker Compose v2**. Ces commandes créent une nouvelle installation locale ; pour un serveur public, utilisez le [parcours VPS avec HTTPS](docs/HOSTINGER.md).

```sh
git clone --branch v0.2.0-beta.1 --depth 1 https://github.com/DissidentAI/AIVisibilityOS.git
cd AIVisibilityOS

# Générer une configuration privée ; Node n’est pas requis sur la machine hôte.
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work \
  node:24-bookworm-slim node scripts/setup.ts

docker compose up --build -d --wait
```

Commandes pour un terminal macOS/Linux, ou WSL sous Windows. Le premier build télécharge les dépendances et prend quelques minutes. Les migrations sont exécutées avant le démarrage du web et du worker. Le web écoute uniquement sur `127.0.0.1:3000` et PostgreSQL n’est pas exposé à l’extérieur.

1. Ouvrez [localhost:3000](http://localhost:3000).
2. Créez le compte propriétaire avec le code `BOOTSTRAP_TOKEN` du fichier local `.env`. Les inscriptions ferment après ce premier compte.
3. Créez un projet : marque, domaine, description, concurrents et questions.
4. Connectez au moins une clé API dans **Paramètres**, vérifiez le budget et lancez une mesure.
5. Consultez les réponses, les mentions et les coûts, puis générez votre premier rapport.

L’installation ne déclenche aucun appel de génération IA et ne contient aucun résultat de démonstration. Conservez `.env` et sa clé de chiffrement en lieu sûr ; ne les publiez jamais. `APP_URL` doit correspondre exactement à l’origine utilisée dans le navigateur.

### Installer sur Hostinger ou un autre VPS

Le [guide Hostinger](docs/HOSTINGER.md) propose un fichier Compose autonome, construit depuis le tag de cette bêta, avec PostgreSQL, migrations, web, worker et proxy HTTPS. Il explique la configuration du domaine, la génération des secrets, l’import dans Docker Manager et la maintenance. Le [guide indépendant de l’hébergeur](docs/DEPLOYMENT.md) détaille également sauvegarde, restauration et mises à jour.

**Pour l’évaluation Hostinger :** [dossier de candidature](docs/HOSTINGER-SUBMISSION.md) · [fichier Compose versionné](https://github.com/DissidentAI/AIVisibilityOS/blob/v0.2.0-beta.1/deploy/compose.hostinger.yaml) · [archives de la bêta](https://github.com/DissidentAI/AIVisibilityOS/releases/tag/v0.2.0-beta.1).

Le modèle a un test d’intégration Docker en CI. La recette sur un VPS Hostinger réel et la validation du programme restent distinctes. Aucun partenariat, référencement au catalogue ou bouton officiel « Deploy on Hostinger » n’est revendiqué ; le bouton sera ajouté seulement après réception du lien fourni par Hostinger.

## Comprendre les indicateurs

Le **Visibility Score** correspond au taux de mention explicite :

```text
100 × nombre de réponses valides mentionnant la marque / nombre total de réponses valides
```

Les échecs, refus et réponses tronquées sont exclus du dénominateur. Sans réponse valide, aucun score n’est affiché. Chaque indicateur expose sa méthode et sa taille d’échantillon. Les intervalles de Wilson décrivent l’incertitude sous des hypothèses d’indépendance ; le choix des questions et la corrélation entre réponses limitent leur interprétation.

Une mention n’est pas une recommandation. Aucun classement ordinal, sentiment ou source n’est inventé. Le pays est un contexte textuel, pas une géolocalisation. Les opportunités éditoriales ne constituent pas une garantie de visibilité. Consultez la [méthodologie complète](docs/METHODOLOGY.md) avant d’interpréter une évolution.

## Statut et limites de la bêta

Cette version est destinée à l’évaluation et aux premiers usages Community, avec **un propriétaire par installation**. Les clés sont chiffrées côté serveur, les accès sont contrôlés côté serveur et les budgets réservent le coût estimé avant exécution. Les tests d’isolation existent ; ils ne remplacent pas un audit indépendant pour un service cloud multi-tenant.

Ne sont pas inclus : comptes d’équipe, SSO/MFA, facturation Stripe, cloud géré, envoi automatique des rapports, alertes sortantes et classification automatique du sentiment. Le suivi des actions GEO est disponible ; celui des actions issues des audits de sites reste à développer. Les coûts sont estimés à partir des informations disponibles et des tarifs enregistrés ; les quotas et conditions des fournisseurs continuent de s’appliquer.

Les [notes de version](CHANGELOG.md), la [validation effectuée](docs/VALIDATION.md), la [politique de sécurité](SECURITY.md) et la [feuille de route](docs/ROADMAP.md) précisent le périmètre. Les notes de la release relient la version au commit et à sa CI ; les archives sont accompagnées d’un SBOM, des notices tierces et d’empreintes SHA-256.

## Développer et tester

Dans le dépôt cloné, utilisez **Node.js 24** (minimum 22.12). Le serveur PostgreSQL local de développement écoute sur `127.0.0.1:55432` ; aucun service cloud ni Docker n’est nécessaire pour ce parcours. N’exécutez pas ce parcours sur les ports d’une installation Docker déjà active.

```sh
npm ci
npm run setup
npm run db:local
```

Gardez ce terminal ouvert. Dans un deuxième terminal, depuis le même dossier :

```sh
npm run db:migrate
npm run dev
```

Dans un troisième terminal : `npm run worker`. Ouvrez ensuite [localhost:3000](http://localhost:3000) et suivez le parcours de création du propriétaire ci-dessus. La base locale utilise des identifiants de développement et ne doit jamais être exposée sur Internet.

```sh
npm run format:check
npm run typecheck
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
npm audit
```

Les tests utilisent des bases PostgreSQL isolées sur les ports 55433 et 55434 et des réponses synthétiques réservées aux tests. En CI, `TEST_DATABASE_URL` doit cibler une base suffixée `_test`. Aucun endpoint de production ne permet d’injecter ces fixtures.

### Architecture

Next.js App Router, React, TypeScript, Tailwind et Recharts ; PostgreSQL 18 avec migrations Drizzle ; worker Node et file persistante sans Redis ; connecteurs REST officiels via `fetch`. Docker Compose assemble les services et Caddy fournit HTTPS sur VPS.

```text
src/app/          Interface et API authentifiée
src/components/   Espace de travail, formulaires et graphiques
src/db/           Schéma, client et exécution des migrations
src/lib/          Authentification, connecteurs, mesures, budget et file
src/worker.ts     Traitement des tâches persistantes
drizzle/          Migrations SQL versionnées
tests/            Tests unitaires, PostgreSQL et navigateur
deploy/           Modèles de déploiement et HTTPS
docs/             Guides produit, méthode et exploitation
```

## Documentation et contributions

| Sujet                                                   | Guide                                                                            |
| ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Preuves, thèmes, actions GEO et historique              | [Workflows de preuves](docs/EVIDENCE-WORKFLOWS.md)                               |
| Questions, concurrents, scans et rapports multilingues  | [Planification et rapports](docs/PLANNING-AND-REPORTS.md)                        |
| Réponses Markdown, copie et téléchargements             | [Exports des réponses](docs/ANSWER-EXPORTS.md)                                   |
| Fournisseurs, coûts, parallélisme et quotas             | [Fournisseurs](docs/PROVIDERS.md) · [Exécution](docs/EXECUTION.md)               |
| Analyse technique des sites publics                     | [Audit de site](docs/SITE-AUDIT.md)                                              |
| Automatisations et rapports d’agence                    | [Workflows agences](docs/AGENCY-WORKFLOWS.md)                                    |
| Interface, accessibilité et aperçu depuis un téléphone  | [Design](docs/DESIGN.md) · [Prévisualisation temporaire](docs/REMOTE-PREVIEW.md) |
| Viabilité, coûts estimés et validation auprès d’agences | [Modèle économique](docs/BUSINESS.md)                                            |

Les retours sur les parcours réels sont bienvenus. Consultez [CONTRIBUTING.md](CONTRIBUTING.md) avant une contribution, puis ouvrez une [issue](https://github.com/DissidentAI/AIVisibilityOS/issues). Pour une faille de sécurité, suivez [SECURITY.md](SECURITY.md) et utilisez le signalement privé ; ne publiez pas de clés ou de données clients.

## Licence

Le code original est distribué sous [AGPL-3.0-only](LICENSE), sans garantie. L’utilisation commerciale et l’hébergement concurrent sont permis ; les obligations de fourniture du code source, notamment pour les versions modifiées accessibles à distance, s’appliquent. Les dépendances et ressources conservent leurs licences : voir [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) et la [décision de licence](docs/LICENSE-DECISION.md).
