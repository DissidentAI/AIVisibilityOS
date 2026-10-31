# Méthodologie / Measurement methodology v1

## Ce qui est observé

Une campagne représente le produit cartésien questions × fournisseurs sélectionnés × répétitions (1–5). Tous les appels sont des conversations neuves, sans historique ni personnalisation. La marque et les concurrents ne sont pas injectés dans l’instruction système. Les noms éventuellement présents dans une question écrite par l’utilisateur restent présents.

Le pays à deux lettres est une indication textuelle dans l’instruction système. Aucune géolocalisation, IP locale au pays ou personnalisation du produit grand public n’est revendiquée. La langue est une instruction, pas une garantie de respect par le modèle. Une réponse valide peut néanmoins être incorrecte factuellement.

Connecteurs initiaux, vérifiés le 31 octobre 2026 :

| Fournisseur | Endpoint officiel                                                                                    | Modèle demandé            | Paramètres                                              |
| ----------- | ---------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------- |
| OpenAI      | `POST https://api.openai.com/v1/responses`                                                           | `gpt-4.1-mini-2025-04-14` | temperature 0.7, max_output_tokens 1200, store false    |
| Google      | `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent` | `gemini-2.5-flash-lite`   | temperature 0.7, maxOutputTokens 1200, thinkingBudget 0 |

Références : [OpenAI génération de texte](https://developers.openai.com/api/docs/guides/text), [modèle GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [Gemini GenerateContent](https://ai.google.dev/api/generate-content). Les réponses des API ne sont pas celles des applications grand public.

## Statuts et dénominateur

- `queued` : réservée, pas encore démarrée ; `running` : prise par un worker.
- `succeeded` : texte non vide et réponse terminée (`completed` / `STOP`), sans refus explicite OpenAI.
- `invalid` : réponse reçue, mais refus, vide ou troncature ; usage conservé lorsqu’il est fourni.
- `failed` : échec technique ou clé absente/invalide ; aucune absence de marque n’en est déduite.
- `uncertain` : exécution interrompue, résultat non confirmé. Aucun replay automatique d’un appel potentiellement facturé.

Seules les réponses `succeeded` entrent dans les fréquences. Les autres statuts restent visibles dans le journal. Une campagne partielle n’est jamais présentée comme complète. Les graphiques historiques n’affichent que les campagnes entièrement valides, de configuration identique et de composition identique en modèles effectivement retournés ; les tailles d’échantillon restent consultables. Un identifiant retourné manquant empêche cette comparaison, sans empêcher de consulter la campagne.

## Mentions et score

`Brand Mention Rate = Visibility Score = 100 × nombre de réponses valides mentionnant la marque / nombre total de réponses valides`.

Une marque est comptée une fois par réponse au maximum, indépendamment du nombre de répétitions dans le texte. Recherche littérale insensible à la casse, avec frontières Unicode lettres/chiffres et échappement des caractères regex ; nom et domaine sont les deux formes autorisées. Pas de rapprochement sémantique, fautes corrigées, alias inventés ou position déduite. Les noms génériques, homonymes et mentions négatives peuvent être comptés : vérifier les extraits. Un domaine dans le texte n’est pas nécessairement une source vérifiée.

Le contexte/sentiment est `not_classified` dans ce MVP. Les extraits permettent une lecture humaine. Les caractéristiques positives/négatives ne sont pas encore classifiées automatiquement ; aucun zéro ou « neutre » fictif n’est affiché.

Si n=0, le taux est `null` (interface : « — »). Wilson 95 %, z=1.96 :

```text
p = mentions/n
d = 1 + z²/n
centre = (p + z²/(2n))/d
marge = z × sqrt(p(1-p)/n + z²/(4n²))/d
intervalle = 100 × [centre-marge, centre+marge], borné à [0,100]
```

L’intervalle suppose des observations de Bernoulli indépendantes. Réponses corrélées, sélection des questions et changements de modèles limitent sa portée. Plusieurs échantillons ne garantissent pas l’indépendance. Ne pas généraliser un taux à tous les internautes et ne pas qualifier une variation isolée de tendance significative.

## Citations et reproductibilité

Seules les annotations `url_citation` d’OpenAI et les `groundingChunks.web` de Gemini sont normalisées. Aucun lien n’est extrait du texte pour le présenter comme citation. Le mode `baseline` n’active pas de recherche ; le mode `web` utilise `web_search` (OpenAI, contexte `low`, `max_tool_calls=1`, `tool_choice=required`) ou `google_search` (Gemini). Les modes sont figés dans la configuration et ne sont jamais mélangés dans une série historique. Activer un outil ne prouve pas son utilisation : les métadonnées enregistrent séparément la recherche observée, les appels, les requêtes Gemini, les liens d’attribution et le bloc de suggestions Google. Ce bloc est affiché dans un iframe isolé sans scripts ni accès au document parent. Une URL structurée est une citation fournie par le modèle, **pas une vérification indépendante du contenu de la page**. Les liens ne sont jamais visités automatiquement.

Chaque campagne fige questions, marques, noms/domaines, langue, pays, instruction système, paramètres, modèles demandés, version de méthode et tarifs. Le SHA-256 de cette configuration sert au regroupement historique. Sont aussi conservés : modèle effectivement retourné, identifiant de réponse, dates de début/fin UTC, texte, payload fournisseur, consommation, état et coût estimé. Les anciennes campagnes ne sont pas réécrites quand les questions ou concurrents changent.

L’alias Gemini peut évoluer. Deux campagnes au même identifiant demandé ne sont donc pas une garantie de reproductibilité. L’interface permet de consulter les modèles retournés et les différences de modèles empêchent leur regroupement historique ; une modification de fournisseur doit déclencher une revue méthodologique avant toute conclusion de tendance. Les requêtes échouées ne sont jamais remplacées silencieusement.

## Coûts et garde-fous

Montants stockés en microdollars entiers, jamais en euros. Tarifs de référence : OpenAI 0,40 $ entrée / 1,60 $ sortie par million de tokens ; Gemini 0,10 $ / 0,40 $. Sources : [OpenAI](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [Google](https://ai.google.dev/gemini-api/docs/pricing). Pas de remise de cache ou de gratuité supposée.

Avant toute campagne : réservation prudente basée sur les octets UTF-8 de question+instruction, une marge de cadrage de 256 tokens et la sortie maximale de 1 200 tokens. Un verrou transactionnel sérialise les réservations ; plafonds organisation et installation sont vérifiés ensemble. La réservation est remplacée par l’estimation calculée sur l’usage retourné ; sans usage fiable, elle reste comptée comme coût incertain. Supprimer un projet n’efface pas la consommation du mois. Les réservations ouvertes des mois antérieurs restent comptées. À la prise en charge de la tâche, la date comptable de l’usage (`usage_records.created_at`) passe atomiquement à la date de tentative : une tâche mise en file fin octobre mais démarrée en novembre consomme le budget de novembre. La date de création de la campagne reste inchangée. Les tarifs peuvent changer et ces estimations ne remplacent ni les factures ni les limites configurées auprès des fournisseurs.

Le worker traite un appel à la fois et attend une seconde entre deux appels. Un fournisseur plus strict peut retourner 429 ; aucune relance payante automatique. L’installation Community utilise un seul worker par défaut. Les plafonds ne couvrent pas les appels effectués hors de cette application.

## Tarification de la recherche et disponibilité des modèles

Références consultées le 31 octobre 2026 : [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search), [tarifs des outils](https://developers.openai.com/api/docs/pricing), [limite des appels intégrés](https://developers.openai.com/api/reference/cli/resources/responses/methods/create), [Gemini Search](https://ai.google.dev/gemini-api/docs/google-search), [tarifs Gemini](https://ai.google.dev/gemini-api/docs/pricing).

- OpenAI `web_search` : 0,01 USD par appel, plus un bloc de 8 000 tokens d’entrée au tarif du modèle GPT-4.1 mini. Un seul appel intégré est autorisé. Par prudence, le coût estimé ajoute ce bloc à l’usage retourné : **il peut surestimer la facture si les tokens de recherche sont déjà inclus dans cet usage**. La réservation couvre deux blocs de 8 000 tokens en plus du prompt et de la sortie, pour couvrir cette convention conservatrice. Aucune précision de facturation inexistante n’est revendiquée.
- Gemini 2.5 : 0,035 USD par prompt avec recherche observée, indépendamment du nombre de requêtes internes. Les franchises gratuites partagées par compte ne sont pas soustraites. L’absence de métadonnées ne permet pas une vérification indépendante de facturation ; vérifier la console fournisseur avant un pilote.
- Sans usage exploitable ou sans normalisation de recherche pour un appel web, la réservation reste un engagement incertain. Les estimations et plafonds locaux ne constituent pas une garantie de facture fournisseur.

OpenAI a annoncé le retrait de `gpt-4.1-mini-2025-04-14` au **14 janvier 2027** : [avis officiel](https://developers.openai.com/api/docs/deprecations). Le profil reste figé pour préserver les mesures actuelles ; les nouvelles campagnes utilisant ce profil seront bloquées à cette date. Une migration vérifiée vers un modèle disponible devra ouvrir une nouvelle série, sans réécrire les anciennes réponses. Les clés et l’accès réels aux deux fournisseurs restent à vérifier.

## Rapports et planification

Les programmations capturent questions, marques, paramètres et tarifs à l’enregistrement. La cadence est de 24 ou 168 heures UTC, sans dérive horaire locale masquée. Une échéance ancienne ne déclenche qu’une campagne ; les créneaux omis sont comptés dans le journal. Budget insuffisant, clé absente ou campagne déjà active sur le même projet produisent un événement ignoré, sans appels ni réservations partiels. Deux projets peuvent avoir des campagnes en file simultanément, tout en partageant les plafonds organisation et installation.

Les rapports figent la campagne, la comparaison éventuelle, le logo, le nom de l’agence et son commentaire. La comparaison nécessite une campagne précédente du même projet, le même hash et les mêmes modèles réellement retournés, sans réponse invalide. Les écarts sont descriptifs. Le PDF inclut les métriques, n, la méthode, les paramètres, toutes les questions et jusqu’à 20 extraits de mention explicitement présentés comme une sélection. Le dossier JSON joint conserve l’ensemble des réponses et citations. Il reste vérifiable après expiration de la campagne d’origine, jusqu’à expiration ou suppression du rapport lui-même.
