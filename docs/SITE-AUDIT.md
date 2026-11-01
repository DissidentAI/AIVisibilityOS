# Audit des sites et comparaison concurrentielle

L’onglet **Audit de site** explore le domaine du projet et jusqu’à dix concurrents choisis parmi les marques configurées. Il conserve les preuves en PostgreSQL et continue sans navigateur ouvert. Le worker habituel suffit : aucun navigateur distant ni service supplémentaire n’est requis.

1. Choisir les concurrents et 10, 25, 50 ou 100 pages maximum par site.
2. Lancer l’exploration. Chaque URL conserve la date, le statut HTTP, les erreurs et les faits extraits. Le bouton Arrêter conserve les preuves déjà enregistrées.
3. Comparer les pages HTML effectivement obtenues. Chaque ratio affiche son dénominateur. Les URL bloquées et inaccessibles ne sont pas traitées comme des pages sans titre.
4. Inspecter les constats et télécharger les exports CSV/JSON.
5. Facultativement, choisir un fournisseur connecté, estimer le coût puis confirmer la synthèse IA. Les extraits publics seront transmis à ce fournisseur.

## Ce qui est mesuré

Titres, descriptions, langue HTML, H1 et autres titres, canonical syntaxiquement valide, directives noindex, types JSON-LD observés et blocs non analysables, attributs alt absents et texte initial approximatif. Des titres/descriptions identiques sont groupés ; les textes principaux identiques sont détectés par SHA-256 après normalisation des espaces. Les doublons peuvent être intentionnels. Un document sans JSON-LD peut utiliser un autre format de données structurées que cette version ne vérifie pas.

Les liens internes ne sont déclarés cassés que si leur cible a réellement retourné 404 ou 410 durant cet audit. Une interdiction robots, un timeout, un 403 ou une cible non explorée ne prouve pas un lien cassé. Les autres cibles sont signalées non vérifiées. Le temps observé inclut les redirections et éventuels contrôles/politesse ; ce n’est ni Lighthouse ni une mesure de Core Web Vitals.

Aucun score SEO arbitraire, classement IA, volume de trafic ou effet causal sur les recommandations IA n’est déduit. Une directive noindex, plusieurs H1 ou une canonical absente peuvent être adaptés au contexte. Les résultats décrivent les pages observées à leur date de collecte.

## Portée et protections

- GET publics sur le domaine exact et sa variante `www` ; pas de formulaires, sessions, cookies, authentification ou exécution JavaScript. Les paramètres d’URL (hors paramètres de suivi retirés), actions de compte et fichiers non HTML sont exclus de la découverte.
- Respect de `robots.txt` pour chaque page, sitemap et redirection. Un 404/410 autorise la poursuite sans règles ; une indisponibilité ou un document inexploitable arrête l’exploration. Un délai robots supérieur à dix secondes est respecté en arrêtant cet audit borné.
- Minimum d’une seconde entre accès au même domaine, coordonné en PostgreSQL. Les 429/503 arrêtent le site et mettent son domaine en pause (au moins 60 secondes, ou Retry-After).
- Maximum 100 pages tentées, profondeur 5, 1 000 URL découvertes, cinq sitemaps, 20 minutes et 50 Mo par site ; 1,5 Mo par ressource reçue/décompressée, cinq redirections et douze secondes de réseau par ressource. Les attentes de politesse sont exclues du délai réseau.
- 2 000 pages **demandées** par organisation sur une fenêtre de 24 heures ; la suppression d’un audit ne remet pas ce quota à zéro. Une exploration active par organisation et une étape réseau active par installation évitent de surcharger les sites.
- Toutes les adresses DNS doivent être publiques. L’adresse sélectionnée est épinglée à la connexion, avec Host/SNI et vérification du certificat pour le vrai domaine. Chaque redirection est revalidée. Ports arbitraires, adresses privées, locales, réservées et de métadonnées sont refusés. Les réponses sont bornées, les en-têtes sensibles ne sont pas conservés.

Une exploration terminée signifie que la file des URL découvertes et autorisées est épuisée. Cela ne garantit pas que l’ensemble d’un site a été découvert. Les grands sites, contenus rendus par JavaScript, espaces privés, protections antibot et restrictions robots limitent la couverture. L’application ne contourne pas ces restrictions. La collecte est réservée aux pages publiques dont l’exploration est autorisée.

## Synthèse IA et coûts

Le corpus est figé après la collecte : statistiques sur toutes les pages, extraits sélectionnés en alternant les sites dans une enveloppe bornée. Le devis indique les pages dont les extraits seront transmis. Une synthèse reçoit un appel API sans recherche web ni outils externes. Les pages sont expressément traitées comme des données non fiables, jamais comme des instructions.

Le résultat attendu sépare observation proposée, hypothèse et action. Son JSON et ses références à des pages du corpus sont validés. Cela ne valide **pas** la véracité de chaque interprétation : le rapport indique qu’elle reste à vérifier. Une sortie invalide garde son texte original et son coût, sans fabriquer de constats structurés.

Les jobs de synthèse sont séparés des réponses de visibilité. Ils partagent les réservations de budget, plafonds RPM/TPM, concurrence et pauses fournisseur des scans. Aucun appel incertain n’est relancé automatiquement. Une nouvelle synthèse demande une confirmation et une nouvelle réservation ; dix maximum par audit. Annuler libère uniquement une réservation qui n’a pas encore été envoyée. Les appels déjà lancés se terminent et sont comptabilisés.

La conservation suit `RETENTION_DAYS`. Les audits actifs ne sont pas purgés ; les lignes d’usage conservent leur propre durée de rétention. L’export du compte inclut audits, pages et synthèses. L’isolation est contrôlée côté serveur et par clés étrangères composées.

## Installation et références

Appliquer `npm run db:migrate` (migrations 0007/0008), reconstruire l’application et redémarrer le worker. Docker Compose exécute les migrations lors du déploiement habituel. Les clés IA restent chiffrées côté serveur. Aucun appel IA n’est nécessaire pour la partie technique de l’audit.

Sources techniques : [Cheerio](https://cheerio.js.org/docs/intro/), [robots-parser](https://github.com/samclarke/robots-parser), [ipaddr.js](https://github.com/whitequark/ipaddr.js), [Node HTTP](https://nodejs.org/docs/latest-v24.x/api/http.html), [limites de robots.txt](https://developers.google.com/search/docs/crawling-indexing/robots/intro).

## English usage and limits

Open **Site audit**, select up to ten configured competitors and a page limit, then start crawling. The persistent worker stores actual public HTML evidence. Inspect page-level checks, comparison denominators, coverage and stop reasons. CSV and JSON exports retain dates and provenance. The optional AI synthesis requires a provider, a cost estimate and confirmation; it shares the same API budgets and rate controls as visibility scans, but never contributes to mention metrics.

Only public static HTML is analyzed. Robots rules, pinned public DNS/IP connections, same-site redirects, pacing and resource limits apply. JavaScript, private pages, external link testing, browser performance and ranking outcomes are outside this audit. Completion does not guarantee that every website page was discovered. AI references are validated against collected pages; interpretations still require human review. Exports and account deletion/retention cover audit data.
