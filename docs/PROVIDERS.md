# Kimi, OpenRouter et sauvegarde du navigateur

Documentation des nouveaux connecteurs vérifiée le **1er novembre 2026**. Les adaptateurs utilisent HTTP côté serveur, sans SDK supplémentaire. Ils mesurent les API et ne reproduisent pas les applications grand public.

## Connexion

Dans **Paramètres → Connecter une clé**, choisir Kimi ou OpenRouter et enregistrer la clé de la plateforme API correspondante. Les clés sont chiffrées en base, liées à l’organisation et au fournisseur ; elles ne sont ni retournées dans `/api/state`, ni sauvegardées dans le stockage local. L’enregistrement ne lance aucun appel payant. Une mesure réelle nécessite une clé autorisée et un solde fournisseur suffisant.

- **Kimi** : [démarrage officiel](https://platform.kimi.ai/docs/get-your-api-key), [modèles disponibles](https://platform.kimi.ai/docs/models). Le connecteur utilise `kimi-k3.1-pro` via `https://api.moonshot.ai/v1/chat/completions`. Les abonnements grand public/Kimi Code ne sont pas des crédits de cette API. Le modèle K2.5 est retiré et les modèles K2 ne sont plus accessibles aux nouveaux comptes ; ils ne sont donc pas proposés.
- **OpenRouter** : [démarrage officiel](https://openrouter.ai/docs/quickstart), [Chat Completions](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request). Une campagne peut choisir un profil parmi les trois ci-dessous, à partir du [catalogue officiel](https://openrouter.ai/api/v1/models). Cette version n’expose pas tout le catalogue OpenRouter.

| Profil OpenRouter              | Entrée USD / million | Sortie USD / million |           Limite de sortie |
| ------------------------------ | -------------------: | -------------------: | -------------------------: |
| `openai/gpt-4.1-mini`          |                 0,40 |                 1,60 |                      1 200 |
| `google/gemini-2.5-flash-lite` |                 0,10 |                 0,40 |                      1 200 |
| `moonshotai/kimi-k3.1-pro`     |                 2,00 |                10,00 | 8 192, raisonnement inclus |

## Paramètres et preuves

Kimi K3.1 Pro conserve son raisonnement activé. Le connecteur demande `reasoning_effort: low`, `max_completion_tokens: 8192` et un cache implicite de cinq minutes ; il omet les paramètres d’échantillonnage fixes du modèle. Seul le contenu de réponse final alimente les mentions. Les tokens de raisonnement sont déjà inclus dans `completion_tokens`, sans double comptage. Voir [le guide K3.1 Pro](https://platform.kimi.ai/docs/guide/kimi-k3-1-pro-quickstart) et [le contrat Chat Completions](https://platform.kimi.ai/docs/api/chat).

OpenRouter reçoit un identifiant de modèle précis, sans routeur automatique ni liste de modèles de secours. Le routage entre hébergeurs du même modèle reste possible, avec `require_parameters: true`, `data_collection: deny` et `max_price` plafonné aux tarifs du profil (aucun tarif par requête accepté). Si aucun hébergeur ne correspond, l’appel échoue ; aucune substitution silencieuse de modèle n’est effectuée par l’application. [Routage officiel](https://openrouter.ai/docs/guides/routing/provider-selection), [paramètres de raisonnement](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens).

Chaque campagne conserve les paramètres par fournisseur, l’endpoint, le modèle demandé et les tarifs. Chaque réponse conserve son modèle retourné, son identifiant, ses dates, son usage et le fournisseur d’exécution communiqué par OpenRouter. Celui-ci est visible dans la preuve et les exports. La comparaison historique exige aussi une composition identique des fournisseurs d’exécution OpenRouter ; si cette information manque, la campagne reste consultable mais n’entre pas dans une comparaison automatique.

Kimi et OpenRouter sont disponibles **sans recherche web** dans cette livraison. Le mode web reste limité à OpenAI et Gemini. Un lien généré dans une réponse Kimi/OpenRouter n’est pas transformé en citation. Les réponses vides, tronquées, refusées ou attendant un outil sont invalides, et ne deviennent pas des absences de marque.

## Coûts et limites

Les tarifs Kimi retenus sont 2 USD/million en entrée, 10 USD/million en sortie et 0,20 USD/million pour une lecture de cache effectivement rapportée. Le tarif d’écriture à cinq minutes est égal au tarif d’entrée ; les catégories d’usage sont exclusives et ne sont pas additionnées deux fois. La réservation ne suppose aucun cache. Sources : [tarifs Kimi](https://platform.kimi.ai/docs/pricing/chat), [fonctionnement et facturation du cache](https://platform.kimi.ai/docs/guide/context-caching).

Pour OpenRouter, `usage.cost` est conservé lorsqu’il est fourni, avec `costSource: provider_reported`. Sinon, l’usage disponible produit une estimation au tarif figé ; sans usage exploitable, la réservation demeure un coût incertain. Les taxes, frais de recharge et dépenses réalisées hors de cette installation ne sont pas inclus. [Comptabilisation officielle](https://openrouter.ai/docs/cookbook/administration/usage-accounting).

Les réservations de budget et l’isolation entre organisations s’appliquent aux quatre fournisseurs. La sortie Kimi est plafonnée à 8 192 tokens pour laisser de la place au raisonnement ; elle peut encore être tronquée. Le délai maximal est de 90 secondes pour les profils Kimi et 60 secondes pour les autres. Les réponses sont limitées à 2 Mo et les redirections réseau refusées. Aucun échec n’est relancé automatiquement.

Une évolution des profils/tarifs ouvre une configuration distincte. Les plannings ayant une version de tarifs ancienne doivent être réenregistrés après vérification de l’estimation ; leur configuration n’est pas remplacée silencieusement.

## Sauvegarde sur cet appareil

- Le brouillon du projet conserve l’étape, la marque, le domaine, le secteur, le pays, la langue, les concurrents et les questions. Après rechargement, ouvrir **Nouveau projet** pour le reprendre. Fermer la fenêtre conserve le brouillon ; **Effacer le brouillon** le retire. Une création réussie le supprime aussi.
- Le dernier projet sélectionné et les choix de campagne (fournisseurs, modèle OpenRouter, répétitions, mode) sont mémorisés. Aucun lancement ni planning payant n’est restauré automatiquement.
- Le stockage est séparé par compte/organisation, et par projet pour les choix de campagne. Les valeurs anciennes de plus de 30 jours ou invalides sont écartées et supprimées à la lecture. La suppression du compte retire les entrées locales connues de ce compte.
- Les brouillons sont propres au navigateur et à l’adresse du site. Un autre appareil, un autre navigateur, une nouvelle adresse de tunnel ou l’effacement du stockage ne les retrouve pas. Les projets déjà créés restent, eux, enregistrés côté serveur.
- Si le navigateur interdit le stockage ou atteint son quota, le formulaire continue de fonctionner et indique que la sauvegarde locale est indisponible. Le code d’installation, les mots de passe et les clés API ne font jamais partie de ces objets sauvegardés.

Cette fonctionnalité ne peut pas récupérer rétroactivement une saisie restée dans un onglet exécutant une ancienne version du formulaire. Copier ce brouillon avant la première actualisation.

## English

Connect a Kimi Platform or OpenRouter API key in **Settings → Connect a key**. Credentials are encrypted on the server and excluded from browser persistence. Kimi uses `kimi-k3.1-pro`; OpenRouter offers the three verified profiles in the table above, one model per campaign. New connectors currently support baseline mode only. The application records returned models, reported costs and OpenRouter serving-provider metadata; API measurements are distinct from consumer applications. Truncations and refusals never count as valid brand absences.

Project drafts, the last selected project and campaign preferences survive reloads in the **same browser and site origin**, scoped to the account. Reopen **New project** to restore a draft, or use **Discard draft** to remove it. Successful creation also clears it. Invalid or expired entries (30 days) are removed when read; unavailable browser storage does not block form use. Passwords, bootstrap codes and API keys are never included. Existing tabs running an older version cannot be recovered retroactively.

Automated tests use clearly identified synthetic responses and isolated test databases. No real Kimi/OpenRouter completion was performed without owner-provided API credentials. Availability, account access, latency and real billing must still be checked with a small authorized campaign.
