# Préparer les scans et partager les résultats

## Français

**Modifier le projet et le scan**, à côté du lancement, permet de changer la marque, son domaine, le secteur, la description, le pays, la langue des réponses, les concurrents, les questions et les réglages de collecte (fournisseurs, modèle OpenRouter du catalogue, recherche web et échantillons). Ces réglages sont sauvegardés côté serveur et disponibles sur les autres appareils. Les choix temporaires du dialogue restent mémorisés dans le navigateur. Une édition concurrente du projet est détectée pour éviter un écrasement silencieux.

Les modifications préparent les **prochaines mesures**. Les appels déjà enregistrés, leurs résultats, leurs coûts et leurs paramètres d’origine restent des preuves immuables. Un planning existant conserve son instantané jusqu’à son réenregistrement explicite dans **Planification** ; le formulaire préremplit maintenant ses paramètres existants. Les limites techniques par modèle et fournisseur restent dans **Paramètres → Vitesse des scans**.

Un projet peut comparer **votre marque et 50 concurrents**. Le bouton **Ajouter un concurrent** est disponible dès la création du projet ; les lignes ajoutées sont conservées dans le brouillon. La comparaison comporte une recherche lorsque la liste dépasse dix marques. Les PDF paginent les grandes listes sans retirer de marques. Le nombre d’appels du scan dépend des questions, fournisseurs et échantillons, pas du nombre de concurrents : les mentions sont détectées dans les mêmes réponses. L’audit des sites accepte séparément **dix concurrents par exploration**, avec les mêmes plafonds par site et de 2 000 pages demandées sur 24 heures.

**Comparer un nouveau concurrent sans relancer le scan :** ajoutez-le dans **Concurrents**, puis sélectionnez une ancienne campagne. Le sélecteur **Marques à comparer → Concurrents actuels** recherche automatiquement les noms et domaines actuels dans les textes valides déjà collectés. Cela ne nécessite ni clé API, ni requête fournisseur, ni nouveau scan. **Marques d’origine** retrouve les définitions et résultats de la collecte, même après modification ou suppression d’un concurrent. Ce choix est mémorisé sur cet appareil, par compte. La réanalyse ne crée pas de nouvelle preuve IA et ne récupère pas les réponses expirées ou supprimées. Les suggestions IA de concurrents restent une fonction distincte pouvant consommer un appel.

Les extraits du journal, les opportunités et le CSV suivent la vue choisie. Chaque nouveau PDF/JSON fige sa liste de marques, la méthode, le hash de cette liste et la date de réanalyse, en conservant l’instantané d’origine et les dates de collecte. Les rapports déjà enregistrés ne sont jamais modifiés. Les tendances et rapports avant/après exigent le même périmètre d’analyse ; seuls les changements de liste des marques peuvent être neutralisés dans la vue actuelle, tous les autres paramètres de collecte devant rester identiques. Les campagnes partielles ou avec reprises restent exclues des tendances automatiques.

Dans **Requêtes suivies → Ajouter**, coller plusieurs questions, une par ligne, puis enregistrer le lot. Les doublons exacts sont ignorés. Chaque question accepte 5 à 1 000 caractères et le projet reste limité à 50 questions. L’éditeur du projet permet aussi de corriger ou retirer les questions enregistrées.

**Générer avec l’IA** utilise le fournisseur connecté choisi. Le contexte comprend le secteur, la description, le pays, la langue et les questions existantes. Les propositions sont sélectionnables, jamais ajoutées sans action de l’utilisateur. Pour un projet sans mesure, l’ajout d’un concurrent propose automatiquement une liste, même sans texte saisi, puis filtre cette liste pendant la saisie. Après une première campagne, le bouton **Générer avec l’IA** déclenche les suggestions sur demande : ajouter manuellement un concurrent ne lance aucun appel IA. Les domaines et la pertinence des concurrents sont des **hypothèses non vérifiées** ; un domaine inconnu reste vide. Les noms ne proviennent pas d’une liste de marques liée à Karburo.

La génération est une tâche persistante distincte des mesures de visibilité. Elle utilise les mêmes clés chiffrées, budgets et limites de débit. Elle consomme un appel API lorsqu’aucun résultat n’est en cache. Le cache est isolé par organisation, projet, contexte et modèle ; durée maximale 30 jours, ou moins si la conservation de l’installation est plus courte. Maximum 30 nouvelles générations sur 24 heures par organisation ; cette limite reste indépendante de la suppression d’un projet. Une erreur ou une interruption n’est jamais rejouée automatiquement. Les propositions et leur coût sont exportés avec les données personnelles, sans clé API.

Le sélecteur de langue de l’interface propose **français, anglais et chinois simplifié**. La langue du rapport se choisit indépendamment dans **Rapports clients** et est mémorisée. Les questions, réponses, noms et commentaires d’agence ne sont pas traduits : il faut préserver le texte original des preuves.

Le PDF présente une synthèse avec ses dénominateurs, une comparaison sur une échelle commune de 0 à 100 %, le détail des questions, jusqu’à huit extraits provenant de réponses distinctes (priorité à la marque principale), puis la méthode, les modèles, les dates et les limites. Les intervalles sont expliqués comme indicatifs. L’export JSON conserve l’intégralité des réponses, y compris les tentatives précédentes. Les polices sont incluses, avec leur licence, pour permettre une lecture hors ligne et du texte sélectionnable en chinois. Les logos d’agence existants sont pris en charge.

**Réessayer** ajoute uniquement les nouvelles tentatives à la même campagne. Une réponse réussie n’est pas remplacée. La dernière tentative de chaque question/fournisseur/échantillon compte dans les indicateurs ; toutes les tentatives comptent dans les coûts. Les tentatives précédentes restent consultables dans le journal et les exports CSV/JSON. Les campagnes avec reprises sont signalées et exclues des tendances automatiques.

## English

Use **Edit project and scan** to change saved business details, competitors, queries and defaults for future scans. Defaults are stored on the server; temporary dialog choices remain on the device. Existing measurements retain their exact snapshots. Re-save an existing schedule in **Scheduling** to update its future configuration; the form starts with its saved settings.

Compare your brand with **up to 50 competitors**. Add rows during onboarding, retain them in your draft and search large comparison lists. PDFs paginate every brand. Competitors share the same response sample, so adding them does not increase scan API calls for unchanged queries/providers/sampling. **Site audit** separately accepts up to ten competitors per crawl while retaining its page and daily limits.

**Compare a new competitor without another scan:** add it under **Competitors**, select an existing campaign and use **Brands to compare → Current competitors**. Current names/domains are checked locally in saved valid answers, without API credentials, provider requests or a new campaign. **Original brands** restores the original definitions and results, including removed or renamed brands. The view preference is saved per account on this device. Deleted or expired answers cannot be recovered. AI competitor suggestions are separate and may incur an API call.

Evidence excerpts, GEO opportunities and CSV follow the selected scope. New PDF/JSON reports freeze the analyzed brands, their hash, method and reanalysis timestamp alongside original collection settings and dates. Previously saved reports remain unchanged. Historical comparisons require the same analysis scope and brands; only differences in tracked brand lists can be ignored in the current view. All other collection settings and actual model identities must match; partial or retried campaigns remain excluded from automatic trends.

**Tracked queries → Add** accepts multiple questions, one per line, with exact duplicate removal, 5–1,000 characters per question and a 50-question project limit. **Generate with AI** provides selectable suggestions based on the project description, market and questions. Competitor suggestions load automatically for projects with no measurements and filter locally as you type. Once a campaign exists, use **Generate with AI** to request them; manually adding a competitor starts no AI request. They are unverified proposals, not evidence; unknown domains remain empty.

Generation is queued separately from visibility measurements, with shared encrypted credentials, API budgets, rate limits and accounting. Matching successful results are cached for up to 30 days (subject to shorter installation retention). Each organization can request at most 30 new generations in 24 hours. No automatic retry after failures or interrupted calls.

Choose **French, English or Simplified Chinese** for the interface and independently for each report. Original evidence and agency commentary are not translated. PDFs include an executive summary, comparable brand bars, question breakdown, up to eight excerpts from distinct answers, and clearly explained methods and limitations. Embedded licensed fonts support offline Chinese rendering and selectable text. The JSON evidence bundle retains full data.

Retries stay in one canonical campaign: successful answers survive, latest attempts determine metrics and every attempt contributes to cost. Previous attempts remain inspectable. Historical retry campaigns are grouped by migration 0009 while retaining original rows and identifiers.

## 简体中文

使用**编辑项目与扫描**修改品牌、域名、业务描述、目标国家、回答语言、竞争对手、问题及后续扫描设置。设置保存在服务器，可跨设备使用；临时选择保存在当前设备。历史回答及其参数保持不变。如需更改现有定时计划，请在**定时计划**中重新保存。

每个项目可比较您的品牌和**最多 50 个竞争对手**。创建项目时即可添加更多行，草稿会保留这些内容。较长的比较列表支持搜索，PDF 会完整分页。竞争对手使用相同的回答样本，问题、供应商和抽样次数不变时，不会因此增加扫描 API 调用。网站审计每次可另选最多十个竞争对手，仍遵守每站及每日页面上限。

**无需重新扫描即可比较新竞争对手：**添加后选择已有测量，在**要比较的品牌 → 当前竞争对手**中，系统会在有效的已保存回答中本地查找当前名称及域名，无需密钥或新的 AI 调用。**原始品牌**保留采集时的品牌定义和结果，即使品牌已改名或移除。视图选择按账户保存在此设备。已删除或过期的回答无法恢复。AI 竞争对手建议是独立功能，仍可能产生费用。

摘录、内容机会及 CSV 与选定视图一致。新 PDF/JSON 固定保存分析品牌列表、哈希、方法及重新分析日期，同时保留原始采集参数与日期。已保存报告不变。历史趋势必须使用相同分析范围、品牌及采集设置；当前视图只允许忽略原始品牌列表的差异。部分完成或含重试的活动仍不参与自动趋势。

在**跟踪问题 → 添加**中，每行输入一个问题，即可批量添加。系统忽略完全重复的问题，每个项目最多 50 个问题，每题 5–1,000 个字符。**使用 AI 生成**根据业务描述、市场和已有问题提供建议，需用户选择后才会添加。尚无测量的项目在添加竞争对手时可自动加载建议；已有测量的项目需点击**使用 AI 生成**主动请求，手动添加不调用 AI。输入时仅在本地筛选，不会每敲一个字就调用 API。竞争对手及域名均为待验证假设，未知域名保持为空。

建议生成是独立的持久任务，与扫描共享加密密钥、预算、限流和费用记录。相同上下文的结果最多缓存 30 天，并遵守更短的安装保留策略。每个组织 24 小时最多发起 30 次新生成。失败或中断后不会自动重试。

界面和报告均可选择法语、英语或简体中文，报告语言可独立选择。原始问题、回答及代理机构评论不会被翻译。PDF 包含清晰摘要、竞争对比、逐题明细、最多八条不同回答的摘录，以及方法、范围和局限。完整证据可通过 JSON 下载。中文字体已本地嵌入，支持离线阅读和文本选择。

重试整合在同一测量活动中，已有成功回答保留。指标采用每个样本的最新尝试，费用累计全部尝试。之前的记录可在历史与 CSV/JSON 中查看。包含重试的测量不会参与自动趋势对比。
