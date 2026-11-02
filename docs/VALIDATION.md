# Validation effectuée

Les sections ci-dessous conservent l’historique des validations. La préparation **v0.2.0-beta.1 du 2 novembre 2026** ajoute les contrôles d’installation Hostinger ; voir la section dédiée en fin de document et la CI du commit de release pour son résultat final.

État initial vérifié le **1er novembre 2026**, sur macOS arm64, Node 24.19, PostgreSQL 18 local.

| Vérification                                                | Résultat                                                                           |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Migrations sur base vide et seconde application idempotente | Réussite                                                                           |
| TypeScript strict                                           | Réussite                                                                           |
| Tests unitaires + intégration PostgreSQL                    | **92 tests réussis**                                                               |
| Build Next.js production standalone                         | Réussite                                                                           |
| Parcours navigateur Chromium et WebKit                      | **13 scénarios réussis**, desktop + mobile 320/390 px, FR + EN                     |
| Audit npm, dépendances de production et développement       | **0 vulnérabilité signalée** au contrôle effectué                                  |
| Connexion réelle OpenAI                                     | Non vérifiée : aucune clé réelle fournie                                           |
| Connexion réelle Gemini                                     | Non vérifiée : aucune clé réelle fournie                                           |
| Appels de génération Kimi / OpenRouter / Xiaomi MiMo        | Non vérifiés : réponses synthétiques uniquement                                    |
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

## Xiaomi MiMo direct, recherche web et refus d’authentification

Le connecteur Xiaomi utilise sa propre clé et son endpoint officiel, modèle `mimo-v2.6-pro`. Les contrats de recherche Kimi Responses, OpenRouter Server Tools/Exa et Xiaomi Web Search ont été vérifiés dans les documentations officielles ; les exemples Xiaomi et ses tarifs ont été inspectés dans son site officiel. Les tests HTTP vérifient les en-têtes, paramètres, endpoints fixes, citations structurées, compteurs de recherche, tokens de cache et coûts. Les pages trouvées par Kimi ne sont pas comptées comme citations. Les réponses simulées ne prouvent pas la disponibilité commerciale des comptes ou des modèles.

Les tests PostgreSQL exécutent trente réponses web synthétiques, conservent les preuves et tarifs des trois fournisseurs, puis simulent un 401. Ils vérifient qu’un seul appel refusé arrête les neuf requêtes Kimi restantes de la campagne, sans affecter l’autre fournisseur ni l’autre organisation. Leurs réservations sont libérées, les erreurs restent dans l’historique et la même clé refusée bloque une nouvelle campagne jusqu’au remplacement. Les refus anciens sont réconciliés sans suppression de réponses. Un usage de recherche OpenRouter absent reste un coût incertain si aucun total fournisseur n’est retourné.

Le contrôle d’authentification est testé avec session obligatoire, séparation des organisations, URLs fixes et absence de secrets dans les réponses. Un **contrôle réel en lecture seule** de la clé Kimi enregistrée a retourné HTTP 401 ; les vingt réponses Kimi déjà échouées portaient le même code. Cela confirme un refus d’authentification, sans identifier à lui seul si la clé est erronée, révoquée ou destinée à une autre plateforme. La clé doit être remplacée dans l’application. **Aucun appel réel de génération n’a été lancé par cette validation.** Xiaomi et OpenRouter restent à vérifier avec les clés autorisées du propriétaire.

Les scénarios WebKit couvrent la connexion directe Xiaomi depuis la campagne, le retour avec Xiaomi sélectionné, le clic sur les lignes et la sélection au clavier en mode web, le maintien des préférences sans stocker les clés, un refus 401 sans lancement de scan et la fermeture pendant un contrôle en cours sans lancement ultérieur. Les réponses de contrôle d’authentification sont explicitement simulées dans ces seuls tests navigateur ; les clés factices ne quittent pas leur environnement isolé.

Les jobs CI disposent désormais d’un délai maximal, dont sept minutes pour l’installation des navigateurs, après observation d’une ancienne exécution bloquée à cette étape. Le résultat du nouveau commit doit être consulté sur GitHub ; un succès local ne prouve pas un succès CI.

## Diagnostic MiMo HTTP 400

Une unique répétition diagnostique d’une requête web refusée, avec la clé Xiaomi enregistrée, a retourné HTTP 400, `Param Incorrect`, et le paramètre `web search tool found in the request body, but webSearchEnabled is false`. Aucune réponse de génération ni aucun usage n’a été retourné. Ce diagnostic confirme que l’option de recherche web est désactivée côté compte Xiaomi ; il ne constitue pas un test réussi de génération avec ou sans recherche.

L’adaptateur reconnaît uniquement ce refus précis dans un corps d’erreur limité à 16 Kio ; le texte fournisseur n’est ni exposé ni journalisé. Les autres erreurs restent génériques. Les tests vérifient l’arrêt des questions MiMo restantes, les réservations libérées uniquement pour les refus identifiés, le maintien des anciennes erreurs 400 sans réinterprétation et la possibilité de choisir une nouvelle campagne sans recherche. Le parcours WebKit contrôle le lien officiel et le changement explicite de mode, sans lancement automatique.

Le scénario de validation des champs utilise maintenant le mode de mouvement réduit, après un délai de stabilité dépassé dans WebKit Linux en CI. Le scénario mobile distinct conserve les animations actives et leurs vérifications de navigation/focus.

## Parallélisme, logo et réponses Markdown

Les migrations 0005/0006 ajoutent les plafonds persistants, les pauses fournisseur et un index pour les fenêtres glissantes. Les tests PostgreSQL vérifient les appels réellement simultanés avec adaptateurs synthétiques différés, le plafond global, les prises concurrentes sans doublon, les plafonds RPM/TPM, la pause 429, les en-têtes de quota OpenAI, la persistance des réglages et l’isolation des organisations. Les succès arrivés en retard ne suppriment pas une pause et ne relèvent pas un plafond récemment observé plus bas.

Le rendu Markdown est testé contre des liens dangereux et du HTML brut. Un parcours WebKit vérifie les titres/listes/tableaux, les repères fournisseur, l’absence de téléchargement des images distantes, les fichiers `.txt` et `.md` (ce dernier identique à la réponse originale), la copie et son repli manuel sur refus du navigateur, ainsi que le layout à 390 px. L’API du presse-papiers est simulée uniquement dans ce test pour contrôler explicitement succès/refus ; il ne valide pas une permission iOS physique. Un autre parcours modifie les plafonds Xiaomi et vérifie leur persistance après actualisation, puis sur mobile. Le logo fourni apparaît sur les captures réelles de l’application.

Aucun appel payant ni benchmark fournisseur réel n’a été lancé pour ces changements. La vitesse maximale et les quotas exacts du compte du propriétaire ne sont pas certifiés par des fixtures. Les sources officielles et les valeurs locales sont documentées dans [EXECUTION.md](EXECUTION.md). Les captures de réponses sont explicitement synthétiques et réservées à la base `_test`.

## Conservation de la campagne pendant une reprise

Le lancement d’une reprise conserve la campagne sélectionnée et ses réponses à l’écran. Les nouvelles tentatives apparaissent dans un suivi distinct ; leurs résultats restent consultables explicitement. Après rechargement, la campagne initiale la plus récente est sélectionnée par défaut, plutôt que le dernier sous-ensemble relancé. Les compteurs historiques et les preuves ne sont ni fusionnés ni supprimés. Une autre reprise attend la fin de la campagne déjà en cours dans le projet.

Validation du correctif dans une copie propre de la version publiée : compilation de production, TypeScript, formatage, 92 tests unitaires/PostgreSQL et deux parcours WebKit réussis. Le parcours principal vérifie une reprise individuelle puis groupée, le maintien des filtres et de la réponse réussie, les trois questions après rechargement, le suivi des reprises et la navigation explicite entre une reprise et sa campagne d’origine. Le parcours mobile vérifie l’annulation pendant le contrôle de clé. Les réponses restent des fixtures isolées, sans appel fournisseur payant.

## Audit public des sites

Les tests couvrent la classification des IP privées/réservées, les DNS mixtes, l’épinglage IP avec Host/SNI, les redirections hors site, délais DNS, limites de taille et de décompression, robots.txt et crawl-delay, sitemaps avec espace de noms, progression persistante et annulation avec jeton de lease. Les tests PostgreSQL vérifient l’isolation, les sélections et quotas bornés, les prises concurrentes, les budgets partagés avec les scans, les sorties IA invalides, les appels interrompus et la conservation de l’usage après purge. Aucune synthèse d’audit n’entre dans les métriques de visibilité.

Le parcours WebKit utilise deux domaines réservés et huit URL synthétiques, dont des pages interdites et en 404. Il vérifie l’exploration, les comparaisons, le devis IA, une synthèse structurée avec références valides, l’inspection des preuves, l’export JSON, l’arrêt et la mise en page mobile. La capture est explicitement synthétique. Le test de navigation mobile attend maintenant le chargement de l’espace authentifié avant de décider d’ouvrir son menu ; un échec CI a révélé qu’une inspection trop précoce prenait une interface encore en chargement pour un écran desktop.

Un contrôle réseau réel et non facturé a exploré cinq pages publiques de karburo.io le 1er novembre 2026, après robots.txt HTTP200 : cinq pages HTML HTTP200, 188 URL découvertes et arrêt explicite au plafond de cinq pages. Ce contrôle ne couvre pas l’intégralité du site. Les synthèses IA restent validées par des adaptateurs de test ; aucun nouvel appel payant n’a été lancé par cette validation.

Résultats de cette tranche : 112 tests unitaires/PostgreSQL, 14 parcours navigateur Chromium/WebKit, compilation de production, TypeScript et formatage validés ; npm audit ne rapporte aucune vulnérabilité. Le quota de pages a fait l’objet d’un contrôle additionnel après durcissement, et le parcours d’audit mobile a été rejoué après correction de la largeur de son tableau. Le serveur de test reçoit désormais un arrêt gracieux, conformément à la [configuration Playwright](https://playwright.dev/docs/test-webserver), pour éviter l’accumulation de segments mémoire de PostgreSQL après les tests macOS.

## Reprises regroupées — 1 novembre 2026

Migration 0009 testée sur une chaîne de campagnes héritées : aucun effacement des réponses, anciennes URL résolues vers une campagne canonique. 42 tests d’intégration et deux scénarios WebKit passent : reprises ciblées puis groupées, trois réponses finales dans une seule campagne, deux tentatives antérieures consultables, annulation sans lancement. Build de production validé.

## Configuration et rapports multilingues — 1 novembre 2026

125 tests unitaires et d’intégration passent : lots de questions atomiques/dédoublonnés, limites, édition concurrente détectée, identité des marques conservée, anciens snapshots inchangés, édition d’un planning, suggestions persistantes avec budget/cache/quotas/isolation et validation JSON. Les tâches de suggestions ne produisent aucune mesure de visibilité. Les fournisseurs sont simulés dans ces tests ; aucune nouvelle génération réelle n’a été achetée pour cette vérification.

Les trois PDF ont été générés avec des fixtures explicitement synthétiques. Contrôle visuel des synthèses FR et chinoise, des barres comparatives et des questions ; extraction du texte chinois avec Poppler vérifiée. Un test long de 50 questions vérifie la pagination et les limites de taille. Le catalogue couvre toutes les chaînes statiques FR/EN de l’interface et inclut les libellés des contrôles d’audit.

Le parcours WebKit de préparation teste : ajout par lots, génération IA de test réellement traitée par la file, filtrage de concurrents pendant la saisie, édition du projet, rechargement des réglages du scan, conservation de la réponse initiale, langue chinoise persistée, rapport anglais depuis une interface chinoise, téléchargement PDF réel, écrans de 390 et 320 px. Les scripts de fixture refusent toute base non suffixée `_test`.

Vérification finale locale de cette tranche : les 15 parcours Chromium/WebKit passent ensemble, ainsi que les 125 tests unitaires/intégration, TypeScript, le build de production et le formatage. L’audit npm ne rapporte aucune vulnérabilité. Les liens de téléchargement déclarent explicitement leur comportement pour Safari ; la fermeture d’une fenêtre dispose d’un délai de repli si l’animation ne signale pas sa fin.

## Comparaison étendue à 50 concurrents — 1 novembre 2026

131 tests unitaires/intégration et les 16 parcours Chromium/WebKit passent. Les nouveaux contrôles couvrent création/édition à 50 concurrents, refus du 51e concurrent, ajouts concurrents au plafond, séparation des organisations, conservation des snapshots et coût/nombre d’appels inchangés à questions/fournisseurs/échantillons identiques. Les grands projets Unicode et les brouillons contenant 50 adresses longues restent pris en charge avec une taille maximale bornée.

Le parcours WebKit crée plus de deux lignes dès l’onboarding, supprime une ligne intermédiaire, recharge le brouillon, compare 51 marques, recherche la dernière marque, ouvre ses réglages et sélectionne dix concurrents dans l’audit, à 390 et 320 px. L’intégration vérifie les onze sites de l’audit, le refus d’une sélection excessive et le maintien du quota de 2 000 pages demandées sur 24 heures. Aucun crawl réel ni appel IA payant n’a été ajouté pour ces tests.

Le PDF synthétique de 51 marques avec de longs noms chinois est paginé sans tronquer la liste. Extraction Poppler : chacun des 50 concurrents apparaît dans la comparaison et dans les quatre questions ; vérification visuelle d’une page de questions. Les tests PDF existants FR/EN/zh-CN et les preuves historiques restent valides. Aucune migration de base n’est nécessaire.

## Nouveaux concurrents sur les réponses existantes — 1 novembre 2026

134 tests unitaires/PostgreSQL et les 18 parcours Chromium/WebKit passent, avec TypeScript, compilation de production et formatage validés. Les régressions vérifient une marque ajoutée après collecte, des mentions par nom ou domaine, la déduplication par réponse, l’exclusion des textes invalides, les dernières tentatives et la conservation des tentatives précédentes. Les lectures et exports réanalysés ne font aucun appel réseau (fetch interdit pendant le test) et laissent intactes toutes les lignes de campagnes, réponses, mentions d’origine, citations, consommation, reprises, suggestions et anciens rapports. Les accès d’une autre organisation sont refusés.

Les rapports figent la nouvelle analyse sans modifier l’instantané de collecte. Une édition/suppression ultérieure des marques n’altère ni ce rapport ni la vue d’origine. Une comparaison actuelle peut réunir deux campagnes dont seule la liste de marques différait ; un changement de prompt, de périmètre d’analyse ou une reprise l’interdit. Les CSV indiquent leur périmètre et les deux listes de marques.

Les nouveaux parcours vérifient l’ajout manuel, le basculement vers les marques d’origine, la préférence après rechargement, les extraits justificatifs, les CSV et PDF/JSON, l’absence de nouvelle campagne et une consommation inchangée. Safari teste sans aucune clé ; Chrome garde une clé configurée et attend au-delà du délai des suggestions pour vérifier qu’aucun travail IA n’est lancé automatiquement. Les écrans restent bornés à 320 px. Les suggestions restent déclenchables explicitement après une première campagne ; le parcours de préparation vérifie ce bouton.

Trois PDF synthétiques réanalysés (FR/EN/zh-CN) ont été générés ; leur texte est extractible et distingue date de collecte, date de réanalyse et méthode. La page comparative française a été inspectée visuellement. Le scénario historique d’installation fonctionne désormais aussi après les autres groupes de tests, sans supposer une base vide. Aucun appel IA payant n’a été effectué et aucune migration de données n’est nécessaire.

## Audit responsive et accessibilité

Après `npm run build`, exécuter `npx playwright test tests/e2e/responsive.spec.ts tests/e2e/responsive-webkit.spec.ts`. Les fixtures ne s’exécutent que dans la base de test. `CAPTURE_RESPONSIVE=1` conserve des captures de travail dans `.local/responsive-after/`. La matrice couvre les onze pages, trois langues, six formats en français, petits/grands écrans dans les autres langues, fenêtres de saisie, commandes clavier et texte réellement visible. Axe analyse les pages dans les deux thèmes ; les traces sont conservées en CI en cas d’échec. Aucun appel IA réel n’est effectué.

Voir les corrections, limites et résultats dans [le rapport d’audit](AUDIT-PRODUIT-UX-2026-11-01.md). Un résultat automatique sans violation n’est pas une certification d’accessibilité ; les lecteurs d’écran, claviers virtuels et appareils physiques demandent encore des essais humains.

## Parcours des preuves aux actions

Validation complète : 156 tests unitaires/PostgreSQL, 22 parcours Chromium/WebKit, TypeScript, formatage et compilation de production réussis. Le parcours de rechargement WebKit a également réussi trois exécutions successives. La matrice responsive générale reste verte ; les nouveaux parcours vérifient les écrans à 320, 768 et 1440 px, les contrôles tactiles et les preuves réouvrables. Aucun appel IA payant n’a été effectué pour cette validation.

Tests ciblés : `npm test -- tests/workflows.test.ts tests/workflows-integration.test.ts tests/client-api.test.ts`, puis après compilation `npx playwright test tests/e2e/workflows.spec.ts tests/e2e/workflows-webkit.spec.ts`. Ils utilisent PostgreSQL isolé, des réponses synthétiques explicitement marquées et les véritables routes de l’application.

Contrôles : numérateur identique aux preuves filtrées, lien de tentative réouvrable, classement en lot sans réécriture des campagnes, vues persistantes, isolation entre organisations et entre projets, conflits de versions, idempotence, conservation et purge des preuves d’action, export/suppression, pagination au-delà de cent campagnes, motifs d’exclusion, absence de nouvel appel fournisseur. Les parcours couvrent Chromium et WebKit de 320 à 1440 px ; la matrice responsive générale contrôle aussi les trois langues.

Les lectures navigateur sont interrompues à la sortie et aucune nouvelle lecture ne démarre après fermeture de la page. Un test vérifie la reprise après `pageshow`. Les mutations ne sont ni annulées ni rejouées automatiquement. Références de cycle de vie : [MDN pagehide](https://developer.mozilla.org/en-US/docs/Web/API/Window/pagehide_event), [MDN pageshow](https://developer.mozilla.org/en-US/docs/Web/API/Window/pageshow_event), [MDN beforeunload](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event). Le candidat Hostinger ci-dessous étend ce suivi sans créer de dialogue.

## Candidat Hostinger — 2 novembre 2026

La CI du commit précédent `0118d46` est [entièrement verte](https://github.com/DissidentAI/AIVisibilityOS/actions/runs/41355416326), y compris tests navigateur, Docker et restauration. La préparation du candidat ajoute quatre tests d’installation, un test d’archives et une régression du cycle de navigation (162 tests unitaires/PostgreSQL au total) : secrets uniques, domaine canonique sans injection de configuration, refus des paramètres incohérents, conservation des fichiers existants/symlinks, exclusion des données privées et vérification des sommes de contrôle. Les 22 parcours navigateur ont été exécutés localement, avec compilation et TypeScript validés. Un premier passage Linux a révélé une lecture lancée entre `beforeunload` et `pagehide` sous WebKit : le suivi de navigation reste désormais actif même après la fin des lectures précédentes, sans relancer les écritures. La CI de la release doit confirmer l’ensemble sur son commit exact. Le scan initial Gitleaks 8.30.1 de tous les commits accessibles n’a signalé aucun secret ; un nouveau job CI refait ce contrôle sur chaque commit. Les résultats ne constituent pas un audit de sécurité indépendant.

`scripts/test-hostinger-compose.sh` est limité à une infrastructure CI jetable. Il utilise `deploy/compose.hostinger.yaml`, construit depuis le checkout testé, puis vérifie TLS avec une CA interne, redirection HTTP, cookie Secure, bootstrap, autorisations, heartbeat worker, notices, absence de ports hôte pour web/DB, restauration séparée et conservation du projet après recréation des conteneurs. Les volumes de test sont supprimés en fin de scénario ; ce script doit rester interdit sur une instance utilisateur. Le résultat de ce nouveau scénario est celui du job `docker` du commit exact, lié depuis la release.

Les archives sont produites par `npm run release:pack` depuis les seuls fichiers suivis au commit ; les chemins privés sont refusés. Le dossier inclut un SBOM CycloneDX dérivé du lockfile, les notices des dépendances installées, des empreintes SHA-256 et le commit source. Les images d’application conservent leur propre inventaire de licences selon leur plateforme.

Les exports CSV et de compte déclarent explicitement leur téléchargement pour ne pas déclencher une sortie de page. Le champ de recherche des preuves met à jour sa valeur pendant l’événement de saisie, conformément au [contrat des champs contrôlés de React](https://react.dev/reference/react-dom/components/input#my-input-caret-jumps-to-the-beginning-on-every-keystroke), avant la synchronisation du lien privé. Le parcours de reprise vérifie le texte et le statut conservés. Une trace Linux montrait par ailleurs un projet créé malgré l’expiration du délai de clic de 15 secondes ; ce clic conserve toutes ses vérifications d’interactivité avec une limite de 30 secondes. Le job complet dispose de 30 minutes ; aucun scénario n’est ignoré ni relancé automatiquement.

Aucun VPS réel, DNS public, achat, génération IA payante, inscription partenaire ou publication publique n’est effectué par ces tests. La validation hPanel, ACME public et les recettes fournisseurs avec un budget autorisé restent explicitement à effectuer avant d’annoncer un déploiement en un clic validé.
