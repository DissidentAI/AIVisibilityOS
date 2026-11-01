# Périmètre livré et suites

## Phase 1 — Community MVP

Implémentés : structure Next.js, migrations PostgreSQL/Drizzle, propriétaire et sessions, projets/marques/concurrents/questions, OpenAI/Gemini, campagne persistante, réponses/coûts/mentions, tableaux de bord sans fixtures, comparaison historique à configuration égale, CSV, export/suppression de données et configuration Docker/HTTPS. La validation réelle de clés fournisseur reste distincte des tests simulés ; consulter VALIDATION.md.

## Phase 2 — Workflows agences livrés, à valider avec dix agences

- Planification PostgreSQL persistante : cadence 24/168 h, configuration figée, pause/reprise, unicité des occurrences, aucun rattrapage massif, plafonds communs avec les campagnes manuelles et journal des échéances ignorées.
- Rapports PDF à la demande en français/anglais, nom/logo validé, comparaison avant/après à configuration et modèles réellement retournés identiques, dossier JSON de preuves et historique de rapports figés. Les téléchargements sont authentifiés.
- Mode recherche web via les outils officiels OpenAI/Gemini, métadonnées conservées, liens d’attribution et suggestions Google isolées ; aperçu du budget avant lancement ou planification.
- Restent à valider avec les agences : envoi automatique des rapports, partage temporaire, édition de modèles de rapports et espaces clients collaboratifs.
- Reprise ciblée des échecs avec conservation des tentatives, estimation supplémentaire et anti-doublon ; historique filtrable et diagnostic des incidents. Opportunités éditoriales descriptives reliées aux preuves, sans crawl. Voir [l’audit et ses priorités](AUDIT-2026-11-01.md).

### Suites non livrées

- Alertes : événements d’exécution, budget et changements ; seuil minimum d’échantillon, comparaison homogène, intervalle d’incertitude et période anti-duplication. Ne pas appeler « baisse significative » une simple différence.
- Suivi des actions issues de l’audit : persistance des tâches, validation humaine et évolution des constats. L’audit public borné, protégé contre SSRF et complété par une synthèse IA facultative est livré ; voir [SITE-AUDIT.md](SITE-AUDIT.md).
- Sentiment : classification avec extraits vérifiables, incertitude et corrections humaines ; corpus d’évaluation français/anglais avant score produit.
- Espaces clients/membres/rôles : matrice de permissions serveur, tests adversariaux, audit indépendant et éventuellement PostgreSQL RLS avant ouverture.

## Phase 3 — SaaS commercial

`subscription_plans`, `subscriptions`, `billing_events` et quotas côté serveur : Stripe Checkout/Customer Portal, webhooks signés, traitement idempotent par identifiant d’événement, aucune décision d’accès basée sur la page de succès. Les plans définissent un nombre total de questions, modèles, répétitions, exécutions et un budget monétaire, jamais de promesse illimitée.

Le serveur doit rester la source de vérité des droits. Réduire un plan ou perdre le paiement bloque les nouveaux appels payants selon une politique explicite sans détruire silencieusement les données. Journalisation d’administration, métriques opérationnelles, restauration testée, procédure d’incident/support et suivi de dépenses obligatoires avant vente.

Les modèles et tarifs initiaux sont un catalogue versionné dans le code, figé dans les campagnes. Une future table `model_configurations` devra être validée côté serveur ; ne jamais accepter d’endpoint réseau arbitraire fourni par un client.

## Phase 4 — Selon demande démontrée

Search Console, API publique avec scopes/quotas, nouveaux adaptateurs officiels, tests de contenu, analyses plus larges et sources enrichies. Ne pas inférer de causalité d’un changement de contenu à partir d’une seule variation de modèle.

## Mesures commerciales à instrumenter

Pas de chiffres inventés ni de tableaux de bord commerciaux alimentés par fixtures.

| Mesure                  | Définition proposée                                                                                       | État                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Utilisateur activé      | Compte avec ≥1 projet, clé configurée, ≥1 campagne terminée avec réponses valides                         | Dérivable localement, pas de télémétrie sortante              |
| Projet configuré        | Marque + ≥1 question + clé d’un fournisseur                                                               | Dérivable                                                     |
| Analyses terminées      | Campagnes sans tâche en attente ; distinguer valides/partielles/échouées                                  | Dérivable                                                     |
| Coût moyen              | Somme des coûts connus / analyses, en affichant la part inconnue                                          | Dérivable                                                     |
| Conversion essai→payant | Premiers paiements confirmés / essais éligibles de la cohorte                                             | Non disponible sans facturation                               |
| Rétention J30           | Activés revenus effectuer une mesure sur fenêtre J23–J37 / cohorte éligible                               | Instrumentation future ; ne pas remplacer par connexion seule |
| MRR                     | Somme des abonnements récurrents actifs normalisés au mois, hors taxes, avec politique de remises/impayés | Non disponible sans facturation                               |

La feuille de route n’est pas une liste de fonctionnalités déjà utilisables.
