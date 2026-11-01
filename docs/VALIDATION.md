# Validation effectuée

État vérifié le **1er novembre 2026**, sur macOS arm64, Node 24.19, PostgreSQL 18 local.

| Vérification                                                | Résultat                                                                           |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Migrations sur base vide et seconde application idempotente | Réussite                                                                           |
| TypeScript strict                                           | Réussite                                                                           |
| Tests unitaires + intégration PostgreSQL                    | **62 tests réussis**                                                               |
| Build Next.js production standalone                         | Réussite                                                                           |
| Parcours navigateur Chromium et WebKit                      | **7 scénarios réussis**, desktop + mobile 320/390 px, FR + EN                      |
| Audit npm, dépendances de production et développement       | **0 vulnérabilité signalée** au contrôle effectué                                  |
| Connexion réelle OpenAI                                     | Non vérifiée : aucune clé réelle fournie                                           |
| Connexion réelle Gemini                                     | Non vérifiée : aucune clé réelle fournie                                           |
| Connexion réelle Kimi / OpenRouter                          | Non vérifiée : réponses synthétiques uniquement                                    |
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

La base locale existante a été sauvegardée à l’arrêt, puis migrée et redémarrée avec web/worker 0.2. Au contrôle de cette livraison, elle contenait zéro compte/projet et aucune fixture ; le endpoint de santé et le heartbeat répondaient. Aucun déploiement VPS n’avait été effectué.

## Refonte de l’interface — ambre, verre et mouvement

Validation locale : 41 tests unitaires/intégration, TypeScript strict, build standalone et trois scénarios navigateur réussis. Chromium couvre le parcours métier complet, toutes les pages à 390 px, les exports, les transitions, la boucle de focus du menu et le retour au déclencheur après fermeture d’une fenêtre. WebKit couvre la connexion, la navigation à 390/320 px, l’onboarding, le focus et la conservation d’un brouillon entre étapes. Un dernier scénario WebKit vérifie le mouvement réduit et le fonctionnement lorsque `localStorage` est bloqué. Les erreurs JavaScript du parcours principal et du parcours mobile sont contrôlées.

Les contrôles ont permis de corriger le focus pendant l’ouverture du menu, la restitution du focus à la fermeture des fenêtres et la différence d’activation des boutons dans Safari. Le thème/la langue ne sont plus écrasés au premier rendu et une actualisation des mêmes mesures ne relance plus le graphique. Audit npm : aucune vulnérabilité signalée lors du contrôle. Les captures de connexion et des deux thèmes sont générées depuis l’application réelle ; les captures de dashboard précèdent les réponses synthétiques.

Une prévisualisation HTTPS temporaire a été ouverte à la demande du propriétaire via Cloudflare Quick Tunnel, vers une copie isolée du build de production sur le Mac. Le chargement du formulaire sur le lien HTTPS a été vérifié dans le navigateur à 390 px ; `/api/health` répond, `/api/state` refuse une session absente et une mutation d’origine étrangère est rejetée. Aucun compte de test, aucune clé factice et aucune mesure synthétique n’ont été ajoutés à cette installation. Le code de première installation et l’adresse éphémère restent hors du dépôt. Ce tunnel n’est pas un déploiement SaaS permanent.

Les limites restent identiques : aucun appel réel aux fournisseurs sans clés, aucun test sur téléphone physique, aucune garantie de disponibilité du Mac, et aucun audit de sécurité indépendant.

## Correction de la création de projet sur mobile

Le formulaire et l’API utilisent désormais les mêmes règles de validation. Les adresses web complètes (avec chemin, paramètres ou majuscules) sont acceptées et seul leur domaine validé est enregistré. Les étapes sont vérifiées avant de continuer ; un rejet du serveur ramène au champ concerné et conserve les saisies. Les erreurs de questions indiquent leur numéro, et les champs invalides sont annoncés aux technologies d’assistance.

Le défaut a été reproduit en comparant l’ancien schéma, qui rejetait une URL avec chemin, au schéma corrigé. Le domaine exact de la saisie signalée par le propriétaire n’était pas disponible : cette reproduction ne permet pas de lui attribuer une cause certaine. Les tests couvrent aussi les domaines invalides, les noms et questions en double, les limites conservées, l’absence d’écriture partielle et les accès anonymes refusés.

Un nouveau parcours WebKit à 390 px crée réellement un projet dans la base de test avec les noms « Karbu France » et « Gasoil Now », des domaines réservés `.example` et dix questions proposées par le formulaire. Il contrôle le focus sur le domaine invalide, une question en double et le retour à l’étape Concurrents après un rejet serveur **simulé uniquement dans le test**. La requête suivante utilise la véritable API et vérifie les domaines enregistrés. Aucun appel fournisseur ni aucune donnée de test n’est ajouté à l’installation de prévisualisation.

## Kimi, OpenRouter et persistance des formulaires

Les connecteurs et leurs paramètres ont été confrontés aux sources officielles listées dans [PROVIDERS.md](PROVIDERS.md). Le tableau de prix Kimi a été lu dans le navigateur officiel ; les trois profils OpenRouter ont été vérifiés dans son endpoint public `/api/v1/models`. Aucun SDK ni service supplémentaire n’a été installé.

Les tests couvrent les requêtes HTTP, modèles autorisés, refus/troncatures, tokens de raisonnement sans double comptage, cache Kimi, coûts rapportés par OpenRouter (y compris zéro), routage plafonné, refus de recherche non prise en charge avant l’appel et absence de fuite de clés. Les tests PostgreSQL exécutent vingt réponses synthétiques Kimi/OpenRouter via le worker, vérifient les coûts persistés, les budgets, l’isolation des organisations et le modèle figé des campagnes planifiées. Les comparaisons OpenRouter refusent les fournisseurs d’exécution inconnus ou différents.

Trois nouveaux parcours WebKit vérifient la restauration d’un brouillon après rechargement/fermeture, sa suppression après création ou abandon explicite, les nouvelles connexions et préférences de campagne, l’absence de clés dans le stockage local et le fonctionnement lorsque ce stockage est bloqué. Les tests du stockage couvrent aussi l’expiration, les données corrompues/surdimensionnées et la séparation des comptes. **Les connexions réelles Kimi/OpenRouter restent non vérifiées sans clés autorisées ; aucune mesure payante n’a été lancée.**

La configuration canonique a aussi été vérifiée après stockage JSONB et inversion de l’ordre des fournisseurs. Le worker refuse une modification des paramètres figés. Une panne simulée du rafraîchissement après création confirme que le brouillon est supprimé dès la confirmation serveur, sans attendre le chargement du tableau de bord.
