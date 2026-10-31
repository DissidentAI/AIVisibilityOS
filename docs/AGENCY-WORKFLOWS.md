# Workflows agences / Agency workflows

## Français

### Mettre à jour une installation

Sauvegarder la base, arrêter web/worker, installer les dépendances (`npm ci`), appliquer `npm run db:migrate`, construire (`npm run build`) puis redémarrer web et worker. La migration `0002` ajoute les programmations, événements, rapports, identité d’agence et métadonnées de recherche sans effacer les campagnes existantes. La migration `0003` impose les cadences supportées au niveau PostgreSQL. Avec Docker, sauvegarder puis utiliser `docker compose up --build -d` ; le service de migration reste le préalable au démarrage. Pour éviter l’exécution d’un ancien worker pendant la migration, arrêter d’abord `web` et `worker`.

### Lancer une mesure

Dans **Lancer une mesure**, sélectionner les fournisseurs connectés, le nombre d’échantillons et le mode avec/sans recherche web. L’aperçu côté serveur indique le nombre d’appels et la réservation prudente. Si les questions changent entre estimation et lancement, l’envoi est refusé et une nouvelle estimation est nécessaire. Aucun appel fournisseur n’est fait pour cet aperçu.

Le mode web utilise les clés habituelles et nécessite l’accès aux outils du fournisseur. Il est plus coûteux. Une recherche demandée peut ne pas être confirmée par les métadonnées : l’écran de preuve le précise. Les citations viennent exclusivement des structures retournées ; aucun crawler du site n’est activé. Voir les conventions conservatrices de coûts dans [METHODOLOGY.md](METHODOLOGY.md).

### Programmer les campagnes

Dans **Planification**, choisir la première échéance en heure locale et une cadence de 24 heures ou 7 jours. L’heure est convertie en UTC ; la cadence reste fixe lors du changement d’heure. Le planning capture les questions, marques et paramètres actuels. Le reconfigurer pour appliquer des changements.

Un seul planning par projet. Enregistrer remplace sa configuration pour les prochaines échéances, sans modifier les campagnes passées. Pause n’annule pas les appels déjà en file. Reprise attend un intervalle complet avant le prochain lancement. Une panne longue entraîne au plus une campagne au redémarrage et un compteur des créneaux omis. Le journal expose les budgets insuffisants, clés manquantes et chevauchements. Le worker doit être actif ; aucun service cron/Redis supplémentaire.

### Produire un rapport

Choisir une campagne terminée puis **Rapports clients**. Enregistrer le nom/logo de l’agence (PNG/JPEG, 250 Ko et 1 048 576 pixels maximum, normalisé côté serveur). Ajouter un commentaire clairement identifié comme celui de l’agence, choisir éventuellement une campagne précédente compatible, puis créer le rapport.

Le PDF et son dossier de preuves JSON sont téléchargeables avec une session propriétaire. Aucun lien public ni envoi d’e-mail n’est créé. Les rapports sont figés, même si le logo ou le projet changent. Ils sont conservés selon `RETENTION_DAYS`, supprimés avec leur projet/compte et inclus dans l’export personnel. Maximum 200 rapports conservés par organisation, 20 créations/heure et 30 rendus PDF/heure par utilisateur. Le PDF contient une sélection annoncée d’extraits ; le JSON conserve toutes les réponses. La police embarquée Noto Sans couvre la typographie latine FR/EN ; licence SIL OFL fournie avec la dépendance.

Les réponses ne sont pas validées factuellement par l’application. Un score de mention ne distingue pas une recommandation d’une critique. Les fonctions de collaboration, notifications, facturation et audit GEO restent distinctes de cette livraison.

## English

Update with a backup, stop web/worker, run `npm ci`, `npm run db:migrate`, `npm run build`, then restart both processes. Docker: stop web/worker after backup, then `docker compose up --build -d`.

- **Run measurement** previews the conservative reservation and sample size before any paid request. Baseline and web-search modes remain separate historical series; provider free allowances are not assumed. Configuration changes invalidate the preview.
- **Scheduling** saves one persistent daily/weekly schedule per project with frozen questions and settings. First execution is entered in local time and stored in UTC. Subsequent intervals are fixed at 24/168 hours, including daylight saving changes. Pause leaves queued calls intact; resume waits one complete interval. Missed slots are never replayed in a paid burst. Budget/credential/overlap failures are recorded in activity.
- **Client reports** creates an immutable French/English PDF with agency name/logo, optional compatible before/after comparison, commentary, methodology and selected evidence excerpts. The accompanying JSON bundle preserves every response and citation. Downloads require authentication. Reports follow retention and project/account deletion, and are included in personal exports. No automatic delivery, public sharing or collaborator access is enabled.

Search adapters are verified against official documentation and synthetic fixtures. Live provider access has not been verified without real authorized keys. Do not represent API measurements as observations of consumer ChatGPT/Gemini applications.

## API additions

All routes require a session; mutations require the configured Origin. Amounts are integer USD microdollars.

| Route                             | Purpose                                                                 |
| --------------------------------- | ----------------------------------------------------------------------- |
| `POST /api/runs/estimate`         | Read-only quote: projectId, providers, samples, mode (`baseline`/`web`) |
| `POST /api/runs`                  | Same settings, optional expectedConfigHash guards a stale quote         |
| `GET /api/schedules?project=UUID` | Schedule and latest 30 occurrence events                                |
| `POST /api/schedules`             | Campaign settings + intervalHours (24/168) + firstRunAt (ISO timestamp) |
| `POST /api/schedules/UUID`        | `{ "enabled": false }` pauses; true resumes                             |
| `GET/POST /api/branding`          | Agency name and normalized logo                                         |
| `POST /api/reports`               | runId, optional previousRunId, locale, optional agency notes            |
| `GET /api/reports?project=UUID`   | Latest 100 saved reports                                                |
| `GET /api/reports/UUID/pdf`       | Authenticated PDF download                                              |
| `GET /api/reports/UUID/data`      | Frozen JSON evidence bundle                                             |
| `DELETE /api/reports/UUID`        | Delete a saved report                                                   |
