# Hostinger : programme et déploiement

Version candidate : **v0.2.0-beta.1**, préparée le **2 novembre 2026**. [Dossier prêt à copier dans hPanel](HOSTINGER-SUBMISSION.md) · [Checklist de publication](RELEASE-CHECKLIST.md).

Page officielle consultée le **2 novembre 2026** : [Open-source partners](https://www.hostinger.com/open-source-partners).

La page annonce une commission de **20 %** lorsqu’une personne achète un plan via le bouton partenaire. Elle décrit l’ajout d’un dépôt GitHub public, une vérification de sa compatibilité, puis la récupération du bouton et du code de parrainage depuis le programme. Les applications Docker Compose sur VPS font partie des stacks annoncées. Les conditions finales, l’éligibilité, l’attribution et les paiements doivent être vérifiés dans le compte partenaire avant toute promesse commerciale.

État du programme partenaire : **aucune approbation obtenue, aucun lien de parrainage délivré, aucun bouton actif**. Le [dépôt GitHub](https://github.com/DissidentAI/AIVisibilityOS) et la [bêta v0.2.0-beta.1](https://github.com/DissidentAI/AIVisibilityOS/releases/tag/v0.2.0-beta.1) constituent les liens de candidature. La publication du code ne vaut pas admission au programme.

Procédure :

1. Vérifier les notes de la bêta, ses limites et les obligations de licence ; transmettre le dépôt et la release accessibles sans authentification.
2. Inscrire ce dépôt dans le programme officiel et attendre la vérification.
3. Copier exactement le Markdown/URL et les paramètres réellement délivrés par Hostinger.
4. Ajouter ce bouton au README, en déclarant le lien rémunéré ; tester son chemin de déploiement sans achat automatique.
5. Conserver le [guide Docker/VPS indépendant de l’hébergeur](DEPLOYMENT.md).

L’application ne dépend d’aucun service Hostinger propriétaire. Les revenus d’affiliation sont accessoires, exclus des calculs de viabilité des abonnements. La publication de la bêta n’effectue aucun achat, déploiement de l’application sur un serveur public ou inscription partenaire.

## Choisir le parcours

- **Nouvelle installation VPS :** `deploy/compose.hostinger.yaml` est autonome. Web, worker et proxy sont construits depuis le tag de la bêta ; la configuration Caddy est incluse dans son image. Aucune copie locale du Caddyfile n’est nécessaire. Le build du tag nécessite que le dépôt soit accessible.
- **Installation existante :** conserver son fichier Compose et son nom de projet/volumes. Suivre [DEPLOYMENT.md](DEPLOYMENT.md) pour les mises à jour. Passer directement au nouveau modèle créerait des volumes distincts.
- **Hébergement Node.js seul :** le simple import du frontend ne déploie pas PostgreSQL et le worker persistant. Le parcours proposé pour cette version est VPS/Docker Compose.

## Générer les paramètres privés

Dans le dépôt de la version à installer, avec Node 24 :

```sh
node scripts/setup-hostinger.mjs --domain visibility.votre-domaine.fr
```

Sans Node sur le VPS, Docker suffit :

```sh
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work \
  node:24-bookworm-slim node scripts/setup-hostinger.mjs --domain visibility.votre-domaine.fr
```

Le script crée `.env.hostinger` avec des droits 0600, des secrets aléatoires distincts et aucun affichage de leur contenu. Il refuse d’écraser un fichier existant ou un lien symbolique. Sauvegarder ce fichier dans un gestionnaire sécurisé : perdre `ENCRYPTION_KEY` rend les clés API enregistrées indéchiffrables. Ne pas l’ajouter au dossier de candidature.

| Variable                 | Rôle                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `APP_DOMAIN`             | Nom DNS réellement contrôlé, sans protocole, port ni chemin                        |
| `APP_URL`                | Exactement `https://APP_DOMAIN`, sans slash final                                  |
| `ENCRYPTION_KEY`         | 64 caractères hexadécimaux, générés par le script                                  |
| `POSTGRES_PASSWORD`      | 48 caractères hexadécimaux, générés indépendamment                                 |
| `BOOTSTRAP_TOKEN`        | 48 caractères hexadécimaux ; sert à créer le premier propriétaire                  |
| `MAX_MONTHLY_BUDGET_USD` | Plafond de l’installation, 20 par défaut ; le compte a aussi son plafond inférieur |
| `RETENTION_DAYS`         | Conservation, 365 jours par défaut                                                 |
| `WORKER_CONCURRENCY`     | Maximum de tâches simultanées, 12 par défaut ; quotas fournisseur supplémentaires  |

Les clés OpenAI/Gemini/Kimi/OpenRouter/MiMo sont facultatives pour installer l’application. Elles se configurent ensuite dans l’interface authentifiée. Aucune génération IA n’est déclenchée par l’installation.

## Déployer depuis hPanel

Le parcours documenté par Hostinger est **VPS → Docker Manager → Compose → Compose from URL**, avec un lien vers un fichier Compose. [Guide officiel](https://www.hostinger.com/support/12040815-how-to-deploy-your-first-container-with-hostinger-docker-manager/).

Fichier Compose de la bêta :

```text
https://github.com/DissidentAI/AIVisibilityOS/blob/v0.2.0-beta.1/deploy/compose.hostinger.yaml
```

Il s’agit d’un fichier de déploiement versionné, pas d’un bouton de parrainage ni d’une approbation du catalogue. Fournir les variables dans l’éditeur d’environnement du projet Hostinger. Si le parcours ne permet pas de les renseigner avant lancement, utiliser le terminal privé et la procédure ci-dessous ; ne pas inscrire les secrets dans un Compose public.

Le domaine A/AAAA doit pointer vers le VPS. Les ports 80/443 doivent être disponibles ; PostgreSQL et le web ne publient aucun port hôte. Le modèle active HTTPS sans profil facultatif. Le contrôle de configuration précède les migrations ; web et worker attendent leur succès. Le premier build prend plus longtemps qu’un téléchargement d’image précompilée. Prévoir initialement 4 GiB RAM pour le build, à confirmer sur la machine réelle.

### Alternative Docker Compose dans le terminal

Cloner le tag dans un nouveau dossier :

```sh
git clone --branch v0.2.0-beta.1 --depth 1 https://github.com/DissidentAI/AIVisibilityOS.git
cd AIVisibilityOS
node scripts/setup-hostinger.mjs --domain visibility.votre-domaine.fr
docker compose --env-file .env.hostinger -f deploy/compose.hostinger.yaml up --build -d --wait
docker compose --env-file .env.hostinger -f deploy/compose.hostinger.yaml ps
```

Pour tester un checkout local, les contributeurs peuvent utiliser `AI_VISIBILITY_SOURCE=..` placé devant la commande Compose. Une installation depuis le tag public n’a pas besoin de cet override. Ne jamais mettre un jeton GitHub dans cette variable.

Ouvrir le domaine HTTPS, créer le propriétaire avec son code d’installation, puis connecter ses fournisseurs. Les inscriptions suivantes sont fermées. Aucune clé d’exemple, aucun compte prédéfini et aucune donnée de démonstration ne sont fournis.

## Sauvegarde, redémarrage et maintenance

```sh
bash scripts/backup.sh --env-file .env.hostinger -f deploy/compose.hostinger.yaml
docker compose --env-file .env.hostinger -f deploy/compose.hostinger.yaml restart web worker
```

Le dump est privé et doit être chiffré et copié hors serveur, avec une conservation adaptée. Garder séparément la clé de chiffrement. La restauration doit d’abord viser une base distincte, worker désactivé : reprendre la procédure de [DEPLOYMENT.md](DEPLOYMENT.md) en ajoutant `--env-file .env.hostinger -f deploy/compose.hostinger.yaml` à chaque commande Compose. Ne pas lancer `down -v` sur une installation contenant des données.

Pour une mise à jour future, conserver le nom de projet et les volumes, sauvegarder, arrêter le worker puis vérifier les migrations et le nouveau tag source avant de rebuilder. Le retour à une ancienne image n’annule pas une migration.

## Vérification et publication

La CI utilise le même modèle avec un checkout local, des secrets jetables et une autorité TLS interne de test. Elle vérifie le démarrage, les cookies sécurisés, la redirection HTTPS, les API protégées, le worker, les notices de licences, les ports privés, la persistance et une restauration séparée. Aucun appel IA ni certificat public n’est demandé. Voir le résultat de la CI du commit exact dans la release.

La recette sur le VPS réel, DNS/ACME et le parcours hPanel restent nécessaires avant de déclarer l’installation en un clic validée. Les coûts et quotas des fournisseurs doivent être vérifiés avec un budget autorisé.

Une fois le projet accepté, copier **exactement** le bouton/URL et le code réellement délivrés par Hostinger, puis déclarer l’affiliation dans le README. Aucun lien ni code de parrainage n’est inventé dans ce dépôt. Le [guide indépendant de l’hébergeur](DEPLOYMENT.md) reste disponible.

## English quick guide

Submit the public repository using [HOSTINGER-SUBMISSION.md](HOSTINGER-SUBMISSION.md). The beta targets Linux VPS + Docker Compose, with a distinct database and worker. Generate private settings with `node scripts/setup-hostinger.mjs --domain visibility.your-domain.com`, then import the versioned `deploy/compose.hostinger.yaml` URL in Docker Manager and supply those variables privately, or run the Compose command above. The template builds the exact beta tag and includes its HTTPS proxy; no local bind mount is required. Existing installations should keep their current project/volume names and follow the upgrade guide. GitHub CI verifies a disposable TLS stack; an actual Hostinger/DNS/ACME acceptance test and official partner approval remain separate. Never upload `.env.hostinger` or customer data with the submission.
