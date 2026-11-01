# Scans parallèles et contrôle du rythme

Vérifié le 1er novembre 2026. Les réglages se trouvent dans **Paramètres → Vitesse des scans** et sont conservés sur le serveur, par organisation, fournisseur et modèle. Les changements s’appliquent aux prochains appels, sans modifier la méthodologie ou les réponses déjà enregistrées.

## Fonctionnement

Le worker peut exécuter jusqu’à **12 mesures simultanées** dans l’installation (`WORKER_CONCURRENCY`, entier de 1 à 32). Chaque modèle commence à deux appels simultanés, ou moins si son plafond est inférieur. Après cinq succès, un emplacement supplémentaire est autorisé, jusqu’au plafond configuré. Un fournisseur en attente ne bloque pas les autres.

Les départs sont espacés selon le plafond RPM et une marge de **15 %**. Une fenêtre glissante de 60 secondes compte aussi les requêtes et réservations de tokens, majorées par l’usage effectivement retourné lorsqu’il dépasse cette réserve. La valeur effective reste au minimum une requête/minute. Le worker réserve la taille UTF-8 du prompt et des instructions, une marge de formatage et la sortie maximale ; le mode web ajoute une provision de contexte. C’est une estimation prudente, **pas le tokenizer ni une garantie du fournisseur**. Une requête dont la réserve dépasse à elle seule le plafond TPM effectif n’est pas envoyée : son erreur explique quel réglage vérifier et sa réservation financière est libérée.

Les prises de tâches, compteurs et pauses sont coordonnés dans PostgreSQL. Ajouter un worker ou redémarrer le processus ne réinitialise pas le rythme. Les jobs en attente ne sont pas déclarés « en cours » pendant leur pause. L’arrêt normal attend les appels déjà partis, et une interruption conserve le comportement prudent existant : aucune répétition automatique d’un appel possiblement facturé.

Sur HTTP **429/503**, ou un **402 accompagné de Retry-After**, les prochains appels du fournisseur sont suspendus. La pause respecte `Retry-After`, avec au moins 15 secondes, un recul exponentiel jusqu’à 15 minutes et un petit décalage aléatoire. Un `Retry-After` plus long reste prioritaire. Le parallélisme du modèle est divisé par deux. Les succès tardifs et la modification des réglages ne suppriment jamais une pause en cours. La reprise de la file est progressive. **L’appel échoué reste consultable et n’est pas rejoué automatiquement** ; le bouton de reprise explicite reste disponible.

Le tableau de campagne distingue les appels en cours des appels en attente et affiche les pauses. Les paramètres de chaque réponse conservent les plafonds et la réservation utilisés lors de son lancement. Les coûts, le nombre de questions et les échantillons ne changent pas parce que les appels sont parallèles.

## Valeurs de départ

Ces plafonds locaux permettent de démarrer ; ils ne certifient pas les droits du compte. Pour exploiter sa capacité réelle, recopier les valeurs de la console fournisseur, en gardant de la capacité pour les autres applications qui utilisent le compte.

| Fournisseur            | RPM configurées | TPM configurés | Appels simultanés maximum |
| ---------------------- | --------------: | -------------: | ------------------------: |
| OpenAI                 |              60 |        200 000 |                         6 |
| Gemini                 |              10 |        100 000 |                         4 |
| Kimi                   |              30 |        240 000 |                         4 |
| OpenRouter, par modèle |              60 |        300 000 |                         6 |
| Xiaomi MiMo V2.6 Pro   |             100 |     10 000 000 |                         8 |

Une augmentation du plafond ne force pas un lancement immédiat et n’efface pas les requêtes récentes. Baisser un plafond n’interrompt pas les appels déjà envoyés. Le nombre simultané reste aussi borné par le plafond global de l’installation.

## Sources officielles et limites

- [OpenAI — Rate limits](https://developers.openai.com/api/docs/guides/rate-limits) : les en-têtes de limite/solde/réinitialisation servent à abaisser les plafonds et à suspendre la file avant épuisement des tokens ou requêtes disponibles. Les limites de projet sont aussi observées. Seules des valeurs numériques autorisées sont utilisées ; aucun en-tête complet n’est stocké. Les plafonds observés expirent après 15 minutes.
- [Gemini — Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) : les quotas dépendent du modèle, du projet et du niveau de compte. La console AI Studio présente les valeurs actives. La limite TPM Gemini concerne les entrées ; notre réservation inclut aussi les sorties, ce qui peut être plus restrictif.
- [Kimi — Rate limits](https://platform.kimi.ai/docs/pricing/limits) et [concepts](https://platform.kimi.ai/docs/introduction) : les limites dépendent du compte et sont partagées entre modèles. La réservation inclut la sortie maximale demandée. Les appels Kimi des campagnes sont agrégés au niveau fournisseur ; l’intégration actuelle utilise un modèle Kimi direct.
- [OpenRouter — Limits](https://openrouter.ai/docs/api_reference/limits) et [errors](https://openrouter.ai/docs/api_reference/errors-and-debugging) : pas de quota RPM universel à déduire du champ historique `rate_limit`. Les réponses réussies ne fournissent pas les en-têtes de limite de plateforme. `Retry-After` est utilisé lorsqu’il est retourné ; les modèles routés restent suivis séparément et une pause fournisseur protège aussi les autres modèles du même compte.
- [Xiaomi MiMo — Rate limit](https://mimo.mi.com/docs/en-US/api/guidance/rate-limit) : la documentation affiche 100 RPM / 10 millions TPM pour MiMo V2.6 Pro, agrégés sur toutes les clés du compte pour ce modèle. Le plafond de concurrence n’est pas chiffré publiquement ; 8 est notre garde-fou réglable, pas une capacité Xiaomi garantie.

Une capacité maximale sans erreur ne peut pas être découverte sans informations du compte. Les quotas quotidiens, le solde, les outils web, les usages hors application et la charge du service peuvent encore déclencher une limitation. L’application ne change jamais de clé ou de modèle pour contourner une restriction. Les limites locales sont isolées par organisation : si un même compte fournisseur est partagé entre plusieurs organisations/installations, répartir sa capacité dans les réglages ; ce partage externe n’est pas détecté automatiquement. Le cloud multi-tenant reste fermé.

## English quick guide

Open **Settings → Scan speed** to set per-provider/model request, token and concurrency ceilings. Defaults are local guardrails, not verified account entitlements. The worker starts with two concurrent calls per model, grows by one after five successful calls, retains 15% RPM/TPM headroom and coordinates all workers through PostgreSQL. `WORKER_CONCURRENCY=12` bounds total in-flight measurements across the installation.

429/503 responses pause queued work for the affected provider, honor `Retry-After` and reduce concurrency. Other providers continue. Failed requests are never silently replayed; use the explicit retry button after reviewing costs. Account/day/tool quotas and usage outside this app can still throttle requests. Settings survive reloads and worker restarts. The configured quota must accommodate one request's conservative token reservation.
