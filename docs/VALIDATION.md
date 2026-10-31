# Validation effectuée

État vérifié le **31 octobre 2026**, sur macOS arm64, Node 24.19, PostgreSQL 18 local.

| Vérification                                                | Résultat                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| Migrations sur base vide et seconde application idempotente | Réussite                                                             |
| TypeScript strict                                           | Réussite                                                             |
| Tests unitaires + intégration PostgreSQL                    | **27 tests réussis**                                                 |
| Build Next.js production standalone                         | Réussite                                                             |
| Parcours navigateur Chromium                                | **1 scénario complet réussi**, desktop + mobile, FR + EN             |
| Audit npm, dépendances de production et développement       | **0 vulnérabilité signalée** au contrôle effectué                    |
| Connexion réelle OpenAI                                     | Non vérifiée : aucune clé réelle fournie                             |
| Connexion réelle Gemini                                     | Non vérifiée : aucune clé réelle fournie                             |
| Docker sur la machine locale                                | Non exécuté : Docker absent ; vérification prévue par GitHub Actions |
| Déploiement public, HTTPS et restauration VPS               | Non effectués                                                        |
| Audit de sécurité indépendant / charge SaaS multi-tenant    | Non effectués ; cloud partagé fermé                                  |

Le scénario navigateur crée un propriétaire dans une base distincte suffixée `_test`, configure Karburo (domaine de test `.example`), deux concurrents et dix questions, enregistre deux clés factices, lance une campagne, puis utilise un worker de test injectant vingt réponses synthétiques. Il vérifie le taux attendu de 7/20, les réponses intégrales, l’export CSV, l’anglais et l’absence de débordement horizontal mobile. **Il ne constitue pas un test des fournisseurs réels.** Aucune fixture n’est enregistrée dans la base d’application locale.

Les tests de sécurité couvrent notamment : absence d’accès à un projet/campagne/export d’une autre organisation, rejet des mutations d’origine étrangère, sessions expirées, premier propriétaire, clés chiffrées liées au locataire et au fournisseur, réservations concurrentes, non-duplication des jobs et conservation du budget après suppression d’un projet. Ils ne remplacent pas un audit exhaustif.

Les captures `screenshots/overview-light.png` et `overview-dark.png` proviennent de l’application exécutée dans Chromium **avant la première mesure** : aucun score simulé n’y apparaît. Le nom et les concurrents sont une configuration de test, pas des résultats commerciaux.

## Contrôle réel avant pilote

1. Connecter deux clés autorisées et vérifier l’accès aux modèles indiqués dans la méthode.
2. Utiliser une seule question puis dix questions, un échantillon et un budget réduit.
3. Comparer le texte, les modèles retournés, dates et tokens à la console fournisseur ; vérifier coûts inconnus, refus et erreurs.
4. Lancer une seconde campagne avec configuration identique ; examiner l’évolution sans conclure à une causalité.
5. Tester une sauvegarde/restauration sur une instance privée avec worker arrêté.
6. Vérifier les politiques de confidentialité et les conditions des fournisseurs pour les données pilotes.

Une fonctionnalité future n’est pas marquée livrée sur la base d’un écran ou d’un schéma seulement. Voir ROADMAP.md.
