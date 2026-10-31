# Validation commerciale — hypothèses au 31 octobre 2026

## Le problème à vendre

Une petite agence doit pouvoir montrer au client les réponses dans lesquelles sa marque apparaît, reproduire un protocole de mesure et expliquer une évolution sans inventer de causalité. La proposition est la traçabilité et le temps gagné pour rendre compte. L’open source et l’auto-hébergement renforcent contrôle et auditabilité ; ils ne constituent pas, seuls, une protection contre la copie.

## Concurrents observés sur leurs sites officiels

| Produit                                         | Éléments confirmés sur la page consultée                                                                                                                                             | Conséquence pour notre validation                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| [Peec AI](https://peec.ai/pricing)              | Starter : 50 prompts, choix de 3 modèles, suivi quotidien, 1 projet et utilisateurs illimités. Les montants n’étaient pas lisibles dans l’extraction consultée : ne pas les deviner. | Vérifier si les petites agences veulent surtout des espaces clients et moins de préparation de rapport.      |
| [Otterly AI](https://otterly.ai/pricing/)       | Lite annoncé à 29 $/mois, 15 prompts ; Standard à 189 $/mois, 100 prompts. Suivi quotidien, mentions/sentiment et sources annoncés.                                                  | Un simple tableau de mentions n’est pas une différenciation suffisante face à une entrée de gamme existante. |
| [Profound](https://www.tryprofound.com/pricing) | Essai de 7 jours avec 50 prompts quotidiens ; offre Enterprise sur devis, jusqu’à 9 moteurs, support dédié et fonctions d’entreprise annoncées.                                      | Tester un positionnement plus simple pour petites agences, sans prétendre égaler la couverture entreprise.   |

Ces descriptions reprennent des offres publiées, pas des tests indépendants de qualité. Leurs noms de moteurs ne prouvent pas que leurs canaux d’acquisition soient identiques aux nôtres. Demander la méthode et les conditions avant une comparaison chiffrée. Aucun statut de « premier » ou « meilleur » n’est revendiqué.

## Étude de dix agences, avant de bâtir le SaaS complet

Recruter quatre petites agences SEO (moins de dix clients), quatre agences de dix à trente clients et deux agences orientées e-commerce/local. Aucun contact n’est envoyé automatiquement par ce dépôt.

1. Entretien de 30 minutes : dernier rapport réellement livré, temps de préparation, questions du client, outil utilisé, fréquence, facture/prestation associée. Demander un exemple expurgé plutôt qu’une opinion sur une idée.
2. Test de 45 minutes : chacune configure une marque cliente autorisée, deux concurrents et dix questions avec ses clés ; observer sans guider le parcours. Mesurer le temps jusqu’au premier résultat valide et les erreurs d’interprétation.
3. Pilote de quatre semaines : deux campagnes comparables par semaine, entretien hebdomadaire court. Relever si l’agence consulte les réponses, réutilise l’export et partage une conclusion vérifiable.
4. Montrer trois offres concrètes, puis demander un engagement de pilote payant, ou la raison précise du refus. Ne pas confondre intérêt poli, intention et paiement confirmé.

Critères **proposés**, pas résultats acquis : 8/10 terminent le parcours sans assistance importante, 6/10 reviennent au moins trois semaines sur quatre, 3/10 acceptent un pilote payant aux conditions testées. Revoir le positionnement si ces seuils échouent ; ne pas empiler des fonctionnalités pour compenser une absence d’usage.

Fonctions dont la disposition à payer est à tester : hébergement/maintenance, planification fiable, rapport client explicable en marque blanche, séparation des clients et alertes peu bruyantes. Les connecteurs et métriques de base restent utiles en Community. Faire classer ces options par gain de temps et demander un budget réel ; ne pas déclarer qu’elles sont déjà validées.

## Économie unitaire reproductible

Calcul : `npm run economics`. Les offres et volumes suivants sont des **scénarios**, hors taxes, sans revenus réels ni promesse de rentabilité.

Hypothèses : 30 jours/mois, 2 fournisseurs, 3 répétitions/jour, 300 tokens d’entrée + 800 de sortie par réponse. Les questions sont un quota **total par abonnement**, pas par projet. 10/50/200 questions donnent 1 800/9 000/36 000 réponses mensuelles. Le MVP ne planifie pas encore ces appels ; ce sont les volumes à budgéter pour une future offre.

Tarifs de référence par million de tokens : [OpenAI GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini) 0,40 $ entrée et 1,60 $ sortie ; [Gemini Flash-Lite](https://ai.google.dev/gemini-api/docs/pricing) 0,10 $ / 0,40 $. Une paire de réponses à ces longueurs coûte environ 0,00175 $. Pas de gratuité, cache ou batch supposé. Recherche web exclue et facturée séparément si ajoutée ultérieurement.

Conversion de scénario : **1 USD = 0,92 EUR**, simple hypothèse de travail, pas un cours actuel. Support valorisé à 30 €/h. Infrastructure et stockage sont des allocations hypothétiques à remplacer par des factures réelles.

[Stripe France](https://stripe.com/fr/pricing) affiche 1,5 % + 0,25 € pour les cartes EEE standard ; [Stripe Billing à l’utilisation](https://stripe.com/fr/billing/pricing) ajoute 0,7 % du volume Billing. Le scénario additionne les deux (2,2 % + 0,25 €). Autres cartes, change, litiges, fiscalité/Stripe Tax et services additionnels peuvent augmenter ces montants.

| Par mois                              |    Starter | Professional |      Agency |
| ------------------------------------- | ---------: | -----------: | ----------: |
| Prix hypothétique HT                  |       39 € |         99 € |       249 € |
| Questions totales                     |         10 |           50 |         200 |
| Réponses                              |      1 800 |        9 000 |      36 000 |
| API en USD                            |    1,575 $ |      7,875 $ |     31,50 $ |
| API converties selon hypothèse        |     1,45 € |       7,25 € |     28,98 € |
| Infrastructure allouée                |        3 € |          6 € |        15 € |
| Stockage/sauvegarde                   |     0,50 € |          1 € |         3 € |
| Support (5/15/45 min)                 |     2,50 € |       7,50 € |     22,50 € |
| Paiement + Billing                    |     1,11 € |       2,43 € |      5,73 € |
| **Coût direct estimé**                | **8,56 €** |  **24,17 €** | **75,21 €** |
| Coût sous stress : API ×3, support ×2 |    13,96 € |      46,16 € |    155,67 € |

Le reste du prix n’est **pas un bénéfice** : développement, acquisition client, administration, incidents, audit/conformité, taxes, impayés et marge de sécurité ne sont pas inclus. La charge fixe peut rendre l’activité déficitaire avec peu de clients. Une moyenne à 1 200 tokens au lieu de 800 augmente les coûts de sortie de 50 % ; des modèles plus chers ou une recherche web peuvent changer fortement l’équation.

Contrôles à maintenir : quota de réponses, bornes de tokens, fréquence maximale, plafond monétaire, réservation transactionnelle, pas de relance payante implicite, arrêt aux limites et visibilité sur les coûts inconnus. Refuser une offre illimitée. Les commissions Hostinger ne figurent dans aucun calcul de viabilité.

La décision de commercialiser doit suivre des paiements pilotes et des coûts observés. Avant cela, ni clients payants, ni conversion, ni rétention, ni MRR ne peuvent être présentés comme des résultats.
