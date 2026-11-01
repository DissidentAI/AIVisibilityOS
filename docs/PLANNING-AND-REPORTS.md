# Préparer les scans et partager les résultats

## Français

**Modifier le projet et le scan**, à côté du lancement, permet de changer la marque, son domaine, le secteur, la description, le pays, la langue des réponses, les concurrents, les questions et les réglages de collecte (fournisseurs, modèle OpenRouter du catalogue, recherche web et échantillons). Ces réglages sont sauvegardés côté serveur et disponibles sur les autres appareils. Les choix temporaires du dialogue restent mémorisés dans le navigateur. Une édition concurrente du projet est détectée pour éviter un écrasement silencieux.

Les modifications préparent les **prochaines mesures**. Les appels déjà enregistrés, leurs résultats, leurs coûts et leurs paramètres d’origine restent des preuves immuables. Un planning existant conserve son instantané jusqu’à son réenregistrement explicite dans **Planification** ; le formulaire préremplit maintenant ses paramètres existants. Les limites techniques par modèle et fournisseur restent dans **Paramètres → Vitesse des scans**.

Dans **Requêtes suivies → Ajouter**, coller plusieurs questions, une par ligne, puis enregistrer le lot. Les doublons exacts sont ignorés. Chaque question accepte 5 à 1 000 caractères et le projet reste limité à 50 questions. L’éditeur du projet permet aussi de corriger ou retirer les questions enregistrées.

**Générer avec l’IA** utilise le fournisseur connecté choisi. Le contexte comprend le secteur, la description, le pays, la langue et les questions existantes. Les propositions sont sélectionnables, jamais ajoutées sans action de l’utilisateur. L’ajout d’un concurrent propose automatiquement une liste, même sans texte saisi, puis filtre cette liste pendant la saisie. Les domaines et la pertinence des concurrents sont des **hypothèses non vérifiées** ; un domaine inconnu reste vide. Les noms ne proviennent pas d’une liste de marques liée à Karburo.

La génération est une tâche persistante distincte des mesures de visibilité. Elle utilise les mêmes clés chiffrées, budgets et limites de débit. Elle consomme un appel API lorsqu’aucun résultat n’est en cache. Le cache est isolé par organisation, projet, contexte et modèle ; durée maximale 30 jours, ou moins si la conservation de l’installation est plus courte. Maximum 30 nouvelles générations sur 24 heures par organisation ; cette limite reste indépendante de la suppression d’un projet. Une erreur ou une interruption n’est jamais rejouée automatiquement. Les propositions et leur coût sont exportés avec les données personnelles, sans clé API.

Le sélecteur de langue de l’interface propose **français, anglais et chinois simplifié**. La langue du rapport se choisit indépendamment dans **Rapports clients** et est mémorisée. Les questions, réponses, noms et commentaires d’agence ne sont pas traduits : il faut préserver le texte original des preuves.

Le PDF présente une synthèse avec ses dénominateurs, une comparaison sur une échelle commune de 0 à 100 %, le détail des questions, jusqu’à huit extraits provenant de réponses distinctes (priorité à la marque principale), puis la méthode, les modèles, les dates et les limites. Les intervalles sont expliqués comme indicatifs. L’export JSON conserve l’intégralité des réponses, y compris les tentatives précédentes. Les polices sont incluses, avec leur licence, pour permettre une lecture hors ligne et du texte sélectionnable en chinois. Les logos d’agence existants sont pris en charge.

**Réessayer** ajoute uniquement les nouvelles tentatives à la même campagne. Une réponse réussie n’est pas remplacée. La dernière tentative de chaque question/fournisseur/échantillon compte dans les indicateurs ; toutes les tentatives comptent dans les coûts. Les tentatives précédentes restent consultables dans le journal et les exports CSV/JSON. Les campagnes avec reprises sont signalées et exclues des tendances automatiques.

## English

Use **Edit project and scan** to change saved business details, competitors, queries and defaults for future scans. Defaults are stored on the server; temporary dialog choices remain on the device. Existing measurements retain their exact snapshots. Re-save an existing schedule in **Scheduling** to update its future configuration; the form starts with its saved settings.

**Tracked queries → Add** accepts multiple questions, one per line, with exact duplicate removal, 5–1,000 characters per question and a 50-question project limit. **Generate with AI** provides selectable suggestions based on the project description, market and questions. Competitor suggestions load on opening the add form and filter locally as you type. They are unverified proposals, not evidence; unknown domains remain empty.

Generation is queued separately from visibility measurements, with shared encrypted credentials, API budgets, rate limits and accounting. Matching successful results are cached for up to 30 days (subject to shorter installation retention). Each organization can request at most 30 new generations in 24 hours. No automatic retry after failures or interrupted calls.

Choose **French, English or Simplified Chinese** for the interface and independently for each report. Original evidence and agency commentary are not translated. PDFs include an executive summary, comparable brand bars, question breakdown, up to eight excerpts from distinct answers, and clearly explained methods and limitations. Embedded licensed fonts support offline Chinese rendering and selectable text. The JSON evidence bundle retains full data.

Retries stay in one canonical campaign: successful answers survive, latest attempts determine metrics and every attempt contributes to cost. Previous attempts remain inspectable. Historical retry campaigns are grouped by migration 0009 while retaining original rows and identifiers.

## 简体中文

使用**编辑项目与扫描**修改品牌、域名、业务描述、目标国家、回答语言、竞争对手、问题及后续扫描设置。设置保存在服务器，可跨设备使用；临时选择保存在当前设备。历史回答及其参数保持不变。如需更改现有定时计划，请在**定时计划**中重新保存。

在**跟踪问题 → 添加**中，每行输入一个问题，即可批量添加。系统忽略完全重复的问题，每个项目最多 50 个问题，每题 5–1,000 个字符。**使用 AI 生成**根据业务描述、市场和已有问题提供建议，需用户选择后才会添加。添加竞争对手时，即使未输入文字也会加载建议；输入时只在本地筛选，不会每敲一个字就调用 API。竞争对手及域名均为待验证假设，未知域名保持为空。

建议生成是独立的持久任务，与扫描共享加密密钥、预算、限流和费用记录。相同上下文的结果最多缓存 30 天，并遵守更短的安装保留策略。每个组织 24 小时最多发起 30 次新生成。失败或中断后不会自动重试。

界面和报告均可选择法语、英语或简体中文，报告语言可独立选择。原始问题、回答及代理机构评论不会被翻译。PDF 包含清晰摘要、竞争对比、逐题明细、最多八条不同回答的摘录，以及方法、范围和局限。完整证据可通过 JSON 下载。中文字体已本地嵌入，支持离线阅读和文本选择。

重试整合在同一测量活动中，已有成功回答保留。指标采用每个样本的最新尝试，费用累计全部尝试。之前的记录可在历史与 CSV/JSON 中查看。包含重试的测量不会参与自动趋势对比。
