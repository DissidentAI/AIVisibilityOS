# Périmètre livré et suites

## Phase 1 — Community MVP

Implémentés : structure Next.js, migrations PostgreSQL/Drizzle, propriétaire et sessions, projets/marques/concurrents/questions, OpenAI/Gemini, campagne persistante, réponses/coûts/mentions, tableaux de bord sans fixtures, comparaison historique à configuration égale, CSV, export/suppression de données et configuration Docker/HTTPS. La validation réelle de clés fournisseur reste distincte des tests simulés ; consulter VALIDATION.md.

## Phase 2 — À valider avec dix agences

- Mesures récurrentes : table `measurement_schedules` liée à org/projet, échéance UTC, configuration versionnée, identifiant unique `(schedule_id, due_at)`, réservation par le service de campagnes existant. Pas de cron en mémoire. Une échéance manquée ne doit pas déclencher un rattrapage massif payant.
- PDF et marque blanche : table `reports`, logo téléchargé et validé, figer les campagnes, méthode/version/taille d’échantillon et avertissements ; pas de lien public sans autorisation et expiration.
- Alertes : événements d’exécution, budget et changements ; seuil minimum d’échantillon, comparaison homogène, intervalle d’incertitude et période anti-duplication. Ne pas appeler « baisse significative » une simple différence.
- Opportunités GEO : `recommendations` avec faits sourcés, hypothèses et actions séparés. Crawl public autorisé avec protections SSRF avant activation. Aucun accès à une URL arbitraire dans le MVP.
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
