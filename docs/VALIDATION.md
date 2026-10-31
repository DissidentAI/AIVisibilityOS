# Validation effectuée

État vérifié le **31 octobre 2026**, sur macOS arm64, Node 24.19, PostgreSQL 18 local.

| Vérification                                                | Résultat                                                                           |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Migrations sur base vide et seconde application idempotente | Réussite                                                                           |
| TypeScript strict                                           | Réussite                                                                           |
| Tests unitaires + intégration PostgreSQL                    | **41 tests réussis**                                                               |
| Build Next.js production standalone                         | Réussite                                                                           |
| Parcours navigateur Chromium                                | **1 scénario complet réussi**, desktop + mobile, FR + EN                           |
| Audit npm, dépendances de production et développement       | **0 vulnérabilité signalée** au contrôle effectué                                  |
| Connexion réelle OpenAI                                     | Non vérifiée : aucune clé réelle fournie                                           |
| Connexion réelle Gemini                                     | Non vérifiée : aucune clé réelle fournie                                           |
| Docker sur la machine locale                                | Docker absent localement ; **images, démarrage et smoke test validés en CI Linux** |
| Déploiement public et HTTPS sur VPS                         | Non effectués                                                                      |
| Audit de sécurité indépendant / charge SaaS multi-tenant    | Non effectués ; cloud partagé fermé                                                |

La version 0.1 a été vérifiée par la [CI GitHub](https://github.com/DissidentAI/AIVisibilityOS/actions/runs/41242325221) qui a également validé la création d’un compte/projet dans les conteneurs, le heartbeat du worker et un dump/restauration dans une base distincte, avec vérification du projet restauré. La restauration sur un VPS de production reste à effectuer avant mise en service.

Le scénario navigateur crée un propriétaire dans une base distincte suffixée `_test`, configure Karburo (domaine de test `.example`), deux concurrents et dix questions, enregistre deux clés factices, lance une campagne, puis utilise un worker de test injectant vingt réponses synthétiques. Il vérifie le taux attendu de 7/20, les réponses intégrales, l’export CSV, l’aperçu budgétaire, la création/pause/reprise d’un planning, l’identité d’agence conservée dans le dossier de preuves, le téléchargement d’un PDF réel, l’anglais et l’absence de débordement horizontal mobile. Un second lot de vingt fixtures teste le mode web, les liens d’attribution et les suggestions Google dans un iframe sans scripts. **Il ne constitue pas un test des fournisseurs réels.** Aucune fixture n’est enregistrée dans la base d’application locale.

Les tests de sécurité couvrent notamment : absence d’accès à un projet/campagne/export d’une autre organisation, rejet des mutations d’origine étrangère, sessions expirées, premier propriétaire, clés chiffrées liées au locataire et au fournisseur, réservations concurrentes, non-duplication des jobs et conservation du budget après suppression d’un projet et imputation au mois de démarrage pour une tâche réservée le mois précédent. Les ajouts agences couvrent aussi les déclenchements planifiés concurrents, la reprise après interruption, les budgets épuisés, les configurations figées, les téléchargements PDF/JSON inter-organisations refusés, les comparaisons incompatibles et les logos invalides/surdimensionnés. Ils ne remplacent pas un audit exhaustif.

Les captures `screenshots/overview-light.png` et `overview-dark.png` proviennent de l’application exécutée dans Chromium **avant la première mesure** : aucun score simulé n’y apparaît. Le nom et les concurrents sont une configuration de test, pas des résultats commerciaux.

## Contrôle réel avant pilote

1. Connecter deux clés autorisées et vérifier l’accès aux modèles indiqués dans la méthode.
2. Utiliser une seule question puis dix questions, un échantillon et un budget réduit.
3. Comparer le texte, les modèles retournés, dates et tokens à la console fournisseur ; vérifier coûts inconnus, refus et erreurs.
4. Lancer une seconde campagne avec configuration identique ; examiner l’évolution sans conclure à une causalité.
5. Tester une sauvegarde/restauration sur une instance privée avec worker arrêté.
6. Vérifier les politiques de confidentialité et les conditions des fournisseurs pour les données pilotes.

Une fonctionnalité future n’est pas marquée livrée sur la base d’un écran ou d’un schéma seulement. Voir ROADMAP.md.

## Livraison 0.2 — workflows agences

Les tests locaux incluent le rendu PDF à partir de vrais objets persistés, avec réponses **synthétiques**. Le PDF téléchargé a été ouvert/rendu et son texte extrait avec Poppler pour contrôler la pagination, les accents, la méthode et les preuves. La compilation standalone inclut les dépendances et la police nécessaires au PDF. La [CI de la livraison 0.2](https://github.com/DissidentAI/AIVisibilityOS/actions/runs/41247804955) est réussie : 41 tests, parcours navigateur, images Docker, tables agences, estimation web, présence de la police/licence PDF et sauvegarde/restauration. Aucune connexion réelle ou exécution cloud n’est déduite des fixtures.

La base locale existante a été sauvegardée à l’arrêt, puis migrée et redémarrée avec web/worker 0.2. Au contrôle final, elle contient zéro compte/projet et aucune fixture ; le endpoint de santé et le heartbeat répondent. Aucun déploiement public n’a été effectué.
