# Des preuves aux actions / Evidence to action

Ces quatre parcours réutilisent les réponses enregistrées, sans nouvel appel IA. L’interface est disponible en français, anglais et chinois simplifié.

## Accès direct aux preuves

Dans la comparaison, cliquez sur une marque : le journal affiche les réponses valides qui la mentionnent explicitement. Leur nombre correspond au numérateur de la comparaison. Une marque à zéro mention ouvre une liste vide.

Dans **Requêtes suivies**, le nombre de preuves ouvre les réponses valides de la question ; le ratio de présence ouvre celles qui mentionnent la marque principale. Une question ajoutée après la campagne n’a pas encore de lien vers une mesure. Le journal combine marque, question exacte, fournisseur, statut et recherche textuelle.

**Copier le lien privé** conserve la campagne, le périmètre de marques, les filtres et, pour une preuve ouverte, l’identifiant de sa tentative. Le lien fonctionne après rechargement ou connexion. Il ne crée aucun accès public : les API vérifient l’organisation. Suppression et purge peuvent rendre une preuve indisponible. Le périmètre « marques actuelles » reste une réinterprétation locale qui évolue avec leur configuration ; les observations d’origine ne sont pas modifiées.

## Questions par thème

Sélectionnez plusieurs questions puis **Organiser la sélection**, ou utilisez **Organiser** pour une seule question. Seuls les champs cochés changent : thème libre, intention (découverte, comparaison, achat, assistance) et priorité. Un thème vide retire le classement.

Recherche, thème, intention et priorité se combinent. **Enregistrer la vue** conserve ces filtres dans le projet, accessibles depuis un autre navigateur. Réutiliser le même nom met la vue à jour. Limite : vingt vues par projet. Le filtre courant est également mémorisé localement, par compte et projet, selon la rétention du stockage navigateur.

Ces métadonnées n’entrent ni dans les instructions envoyées aux IA ni dans la configuration des mesures. Les indicateurs restent ceux de la campagne sélectionnée ; aucun taux global n’est silencieusement recalculé à partir d’un filtre de travail. Les éditions concurrentes sont contrôlées par la révision du projet.

## Actions GEO

Dans **Opportunités GEO**, utilisez **Suivre cette opportunité** ou **Créer une action** depuis une question mesurée. Renseignez titre, état (à vérifier, prévu, en cours, publié), responsable, échéance, URL et notes. Le responsable est un nom libre dans cette édition Community ; aucune notification n’est envoyée.

Le serveur archive les réponses valides de la question, leurs dates, modèles, paramètres, citations réellement retournées, mentions, marques et dénominateur à cet instant. Échecs et réponses en attente restent indiqués séparément. Cette copie reste consultable dans **Preuves archivées** après modification du projet, ajout de concurrents, reprise ou suppression de la campagne source. Elle n’est jamais remplacée par une preuve soumise par le navigateur.

Modifier le statut ou les notes ne modifie pas le constat initial. Deux éditions concurrentes ne s’écrasent pas silencieusement. La création est idempotente pour éviter les doublons après une interruption réseau. Limite : deux cents actions par projet. La liste ne transfère pas les réponses intégrales ; les preuves sont chargées à la demande.

Les actions et leurs copies suivent `RETENTION_DAYS`, à partir de la création de l’action, comme les rapports. Supprimer le projet ou le compte les supprime également. L’export du compte inclut actions et vues. Une publication ou une variation ultérieure ne démontre pas de causalité et ne garantit aucun gain de visibilité.

## Historique plus clair

La campagne sélectionnée sert de référence. **Comprendre l’évolution** affiche les campagnes par pages de vingt, y compris au-delà des cent campagnes du sélecteur rapide. Chaque ligne montre date, modèles demandés, mode web, mentions/réponses valides, échecs et tâches en attente, avec un bouton pour consulter cette campagne.

Le graphique utilise uniquement les campagnes comparables **de la page affichée**. Le compteur indique combien ont été examinées et retenues. Les exclusions sont expliquées : campagne partielle, reprises, questions, modèles demandés ou réellement retournés, routage OpenRouter inconnu, mode web, langue/pays, échantillonnage ou autres paramètres incompatibles. Si la référence est inéligible, son motif apparaît aussi.

Le périmètre « marques actuelles » autorise seulement les différences de marques d’origine. Les reprises ne sont pas présentées comme un échantillon collecté dans les mêmes conditions temporelles. Un point isolé ne constitue pas une tendance. L’API agrège les données côté serveur dans une lecture cohérente PostgreSQL ; elle n’envoie au graphique ni réponses intégrales ni données brutes fournisseur.

## English

- **Evidence links:** click a brand to open its valid mentioning answers, or a question’s answer count to open that question. Private links preserve campaign, scope, filters and optional attempt. They require authenticated access to the same organization; retention and deletion still apply.
- **Question organization:** bulk-edit themes, intent and priority, changing only checked fields. Save up to twenty named filter views per project, available across browsers. Current filters are also stored locally per account/project. Metadata never changes submitted prompts, measurement snapshots or historical metrics.
- **GEO actions:** track title, status, free-text owner, due date, target URL and notes. The server freezes valid answers and actual evidence at creation, with failures/pending counts separate. Edits preserve evidence; stale versions are rejected and creation is idempotent. Up to two hundred actions per project. Evidence loads on demand, survives source-campaign changes and follows `RETENTION_DAYS` from action creation. Project/account deletion removes it; account export includes it. No notifications or inference calls are triggered.
- **Clearer history:** twenty campaigns per page, without the quick selector’s hundred-campaign ceiling. The selected campaign is the reference. Charts include compatible campaigns on the displayed page, with explicit denominators and reasons for exclusions. Current-brand analysis relaxes only the original brand-set constraint. Retries are excluded from the homogeneous trend series. No causal claim is inferred.

## Installation et vérification / Installation and validation

Migration additive : `drizzle/0012_numerous_stick.sql`. Elle crée `query_views` et `geo_actions` et ajoute trois colonnes aux questions, sans réécrire les campagnes. Sauvegardez la base avant mise à jour ; appliquez les migrations avant de démarrer le nouveau worker. Docker Compose utilise son service de migration habituel.

```sh
npm ci
npm run db:migrate
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Tests ciblés : `tests/workflows.test.ts`, `tests/workflows-integration.test.ts`, `tests/e2e/workflows.spec.ts` et `tests/e2e/workflows-webkit.spec.ts`. Ils vérifient liens, numérateurs, autorisations, conflits, migrations, conservation des observations, rétention, pagination, parcours mobile et absence d’appels IA supplémentaires. Les fixtures ne fonctionnent que dans une base dont le nom finit par `_test`.
