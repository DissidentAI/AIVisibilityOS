# Fournisseurs, recherche web et sauvegarde du navigateur

Documentation officielle vérifiée le **1er novembre 2026**. Les adaptateurs utilisent HTTP côté serveur, sans SDK supplémentaire. Ils mesurent les API et ne reproduisent pas les applications grand public.

## Connexion directe Xiaomi MiMo

Dans **Paramètres → Connecter une clé → Xiaomi MiMo**, enregistrer votre clé API Xiaomi. Le modèle est **MiMo V2.6 Pro** (`mimo-v2.6-pro`). Aucun compte OpenRouter n’est nécessaire. Le connecteur envoie la clé dans l’en-tête `api-key` à `https://api.xiaomimimo.com/v1/chat/completions`, selon le [contrat officiel Xiaomi](https://mimo.mi.com/docs/en-US/api/chat/openai-api).

Ce profil utilise l’API à l’usage. Le Token Plan Xiaomi utilise une connexion distincte, non implémentée ici. Le [guide officiel](https://mimo.mi.com/docs/en-US/quick-start/summary/welcome) permet de vérifier le type de compte. La sortie est limitée à 1 200 tokens, avec `thinking: {type: "disabled"}` et `temperature: 0.7` ; le raisonnement n’est pas injecté dans les mesures. [Paramètres des modèles](https://mimo.mi.com/docs/en-US/api/guidance/model-hyperparameters).

Pour le mode web, activer le plugin **Web Search dans la console Xiaomi**. La requête contient `tools: [{type: "web_search", force_search: true, max_keyword: 1, limit: 3}]`. Les annotations structurées `message.annotations` de type `url_citation` deviennent des citations ; `usage.web_search_usage.tool_usage` indique les recherches effectuées. Une erreur de recherche retournée dans `message.error_message` invalide la mesure, au lieu de devenir une absence de marque.

Un refus HTTP 400 avec le paramètre `webSearchEnabled is false` signifie que le compte n’a pas activé Web Search. Ce n’est pas un refus de la clé. L’application affiche cette cause, arrête les autres questions MiMo en attente de cette campagne et libère leurs réservations. Le formulaire propose un lien vers la console Xiaomi et un bouton pour choisir explicitement le mode sans recherche. Aucun changement de mode ni relancement payant automatique n’est effectué. Les anciens 400 sans détail conservé restent des erreurs génériques et leurs coûts incertains ne sont pas réécrits.

## Kimi et OpenRouter

- **Kimi** : [clé de la plateforme API](https://platform.kimi.ai/docs/get-your-api-key), [modèles disponibles](https://platform.kimi.ai/docs/models). Le connecteur utilise `kimi-k3.1-pro`. Les clés Kimi Code et les abonnements grand public sont distincts de cette API.
- **OpenRouter** : [démarrage officiel](https://openrouter.ai/docs/quickstart), [Chat Completions](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request). Quatre profils sont proposés, vérifiés dans le [catalogue officiel](https://openrouter.ai/api/v1/models). Le catalogue complet n’est pas exposé.

| Profil OpenRouter              | Entrée USD / million | Sortie USD / million |           Limite de sortie |
| ------------------------------ | -------------------: | -------------------: | -------------------------: |
| `openai/gpt-4.1-mini`          |                 0,40 |                 1,60 |                      1 200 |
| `google/gemini-2.5-flash-lite` |                 0,10 |                 0,40 |                      1 200 |
| `moonshotai/kimi-k3.1-pro`     |                 2,00 |                10,00 | 8 192, raisonnement inclus |
| `xiaomi/mimo-v2.6-pro`         |                0,435 |                 0,87 |                      1 200 |

### Recherche Kimi

Le mode sans recherche utilise [Chat Completions](https://platform.kimi.ai/docs/api/chat) à `/v1/chat/completions`, avec `reasoning_effort: low`, `max_completion_tokens: 8192` et un cache implicite de cinq minutes.

Le mode web utilise la nouvelle [API Responses officielle](https://platform.kimi.ai/docs/api/responses) à `https://api.moonshot.ai/v1/responses`, avec `reasoning: {effort: "low"}`, `max_output_tokens: 8192`, `tools: [{type: "web_search", search_content_types: ["text"]}]`, `tool_choice: "auto"` et `include: ["web_search_call.action.sources"]`. L’API décide si une recherche est nécessaire : l’activation ne garantit pas son utilisation. Aucun `max_tool_calls` ou paramètre de géolocalisation non documenté n’est envoyé.

Les pages de `web_search_call.action.sources` sont conservées et affichées comme **pages trouvées par la recherche**, séparément des citations de réponse. Elles n’alimentent pas le taux de citation. Aucun lien généré dans le texte n’est transformé en citation. Le raisonnement reste exclu du texte analysé et ses tokens, déjà compris dans la sortie, ne sont pas comptés deux fois.

### Recherche OpenRouter

Le connecteur utilise le nouvel [outil serveur Web Search](https://openrouter.ai/docs/guides/features/server-tools/web-search), avec `type: "openrouter:web_search"`, moteur Exa, mode `fast`, `max_uses: 1`, `max_results: 3`, `max_total_results: 3`, `max_characters: 1500` et `max_tool_calls: 1`. Voir aussi le [fonctionnement des outils serveur](https://openrouter.ai/docs/guides/features/server-tools). L’outil peut être appelé ou ignoré par le modèle.

Les annotations structurées `url_citation` alimentent les citations ; `usage.server_tool_use_details.web_search_requests` fournit le nombre de recherches. Sans cette donnée, le nombre d’appels facturés reste inconnu. Les [annotations documentées](https://openrouter.ai/docs/guides/features/plugins/web-search) sont utilisées sans extraire de liens du texte. L’ancien plugin web est désactivé dans les requêtes pour ne pas ajouter une seconde recherche ou une recherche en mode baseline. Des politiques imposées dans le compte OpenRouter peuvent avoir priorité : vérifier les réglages du compte avant un pilote.

Un identifiant précis est envoyé, sans modèle de secours. Le routage entre hébergeurs du même modèle reste possible, avec `require_parameters: true`, `data_collection: deny` et un plafond `max_price` aux tarifs du profil, sans tarif par requête accepté. Si aucun hébergeur ne correspond, l’appel échoue. [Routage officiel](https://openrouter.ai/docs/guides/routing/provider-selection), [raisonnement](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens).

## Authentification et erreurs 401

Les clés sont chiffrées en base et liées à l’organisation et au fournisseur. Elles ne sont ni retournées dans `/api/state`, ni enregistrées dans le stockage du navigateur. Cliquer sur un fournisseur non connecté dans une campagne ouvre son formulaire de connexion, puis revient à la campagne après enregistrement.

L’interface vérifie l’authentification avant d’enregistrer une clé et avant de lancer une campagne manuelle. **Vérifier** dans Paramètres effectue le même contrôle, sans génération de texte ni lancement de mesure. Les endpoints en lecture seule sont fixes : `/v1/models` chez OpenAI, Kimi et Xiaomi, `/v1beta/models` chez Gemini, `/api/v1/key` chez OpenRouter. [OpenAI](https://developers.openai.com/api/reference/resources/models/methods/list), [Gemini](https://ai.google.dev/api/models), [OpenRouter](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key). Le contrôle est authentifié, limité en fréquence et isolé par organisation. Une acceptation HTTP ne garantit ni le solde ni l’accès au modèle choisi.

Un refus 401 exige une clé valide sur la bonne plateforme ; le logiciel ne peut pas réparer une clé refusée. Une panne réseau ou un 429 ne sont pas présentés comme une clé valide. Les messages restent explicites sans exposer le payload fournisseur, susceptible de contenir un secret.

Si un appel du worker reçoit 401, les requêtes encore en attente du même fournisseur dans cette campagne sont arrêtées, sans toucher aux autres organisations ou fournisseurs. Les réservations de ces requêtes et de la requête refusée sont libérées : aucune inférence n’a eu lieu. Les anciens refus 401 sont réconciliés de la même façon, sans effacer l’historique. Une clé connue comme refusée bloque les nouvelles campagnes jusqu’à son remplacement ou une vérification d’authentification réussie. Aucune campagne n’est relancée automatiquement. L’API d’enregistrement directe ne remplace pas ces contrôles d’interface ; le worker traite aussi ses refus.

## Coûts et limites

Tarifs de référence en USD, hors taxes et frais de recharge :

- **Kimi** : 2 USD/million en entrée, 10 en sortie et 0,20 en lecture de cache explicitement rapportée. L’écriture du cache cinq minutes coûte le tarif d’entrée. La recherche coûte 0,005 USD lorsqu’elle est déclenchée. [Tarifs tokens](https://platform.kimi.ai/docs/pricing/chat), [cache](https://platform.kimi.ai/docs/guide/context-caching), [recherche](https://platform.kimi.ai/docs/api/responses).
- **Xiaomi direct** : 0,435 USD/million en entrée, 0,87 en sortie et 0,0036 en lecture de cache, selon les tarifs hors Chine continentale. Recherche : 0,005 USD par appel rapporté. [Tarifs officiels](https://mimo.mi.com/docs/en-US/price/pay-as-you-go).
- **OpenRouter** : le coût total `usage.cost` est préféré à l’estimation, avec `costSource: provider_reported`. Il inclut déjà les frais de recherche : ils ne sont pas ajoutés une seconde fois. À défaut, l’usage disponible et les recherches rapportées sont valorisés au tarif figé ; Exa fast coûte 0,007 USD par recherche. Sans usage exploitable, la réservation reste un coût incertain. [Comptabilisation](https://openrouter.ai/docs/cookbook/administration/usage-accounting), [tarifs du nouvel outil](https://openrouter.ai/docs/guides/features/server-tools/web-search).

La réservation ne suppose aucun cache. Pour la recherche Kimi/MiMo/OpenRouter, elle ajoute une provision de **32 000 tokens d’entrée** pour le contexte de recherche, plus les frais d’un appel. OpenRouter provisionne deux passages du modèle, avant et après l’outil. Cette provision est une estimation explicite, **pas une limite contractuelle de facture** : le contexte réellement injecté dépend du fournisseur. L’usage retourné remplace l’estimation quand il est exploitable. Les plafonds du compte fournisseur restent nécessaires pour contrôler la dépense totale, notamment hors de cette application.

Les réservations atomiques et l’isolation s’appliquent aux cinq fournisseurs. La sortie est limitée à 8 192 tokens pour Kimi et 1 200 pour les autres ; elle peut encore être tronquée. Délai maximal de 90 secondes pour les profils Kimi et 60 secondes pour les autres, réponse limitée à 2 Mo, redirections refusées. Aucun échec n’est relancé automatiquement.

Chaque campagne fige les paramètres, l’endpoint, le modèle et les tarifs. Chaque réponse conserve son modèle retourné, son identifiant, ses dates, l’usage et le fournisseur d’exécution communiqué par OpenRouter. La comparaison historique exige une composition identique de modèles et de fournisseurs d’exécution connus. Une évolution de paramètres/tarifs ouvre une configuration distincte ; les plannings anciens concernés doivent être réenregistrés, sans réécriture silencieuse de leur configuration.

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
