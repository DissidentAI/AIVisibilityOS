# Exploitation Docker / VPS

Ces instructions conviennent à un VPS Hostinger ou à un autre serveur Linux disposant de Docker Engine + Compose v2, DNS et ports 80/443. Aucun déploiement public n’est effectué par la génération de ces fichiers. Le minimum matériel dépend des volumes ; commencer par une machine disposant d’environ 2 Go RAM pour l’exécution et 4 Go pour un build local constitue une hypothèse à vérifier par mesure, pas une garantie.

## Installation

1. Cloner le dépôt avec un accès autorisé. Ne pas changer sa visibilité sans décision du propriétaire.
2. Générer `.env` : `npm run setup` après `npm ci`, ou avec le conteneur Node indiqué dans le README. Le script préserve un fichier existant.
3. Sauvegarder `ENCRYPTION_KEY` et `BOOTSTRAP_TOKEN` dans un gestionnaire de secrets. `.env` est créé avec le mode 0600. Le mot de passe PostgreSQL Docker est aléatoire. Ne jamais utiliser le mot de passe du helper de développement sur un VPS.
4. Configurer `APP_DOMAIN=visibility.votre-domaine.fr` et `APP_URL=https://visibility.votre-domaine.fr`. Les enregistrements DNS A/AAAA doivent cibler ce VPS ; retirer un AAAA incorrect. Ouvrir uniquement SSH administré, 80 et 443. Ne pas exposer 5432.
5. Lancer :

```sh
docker compose --profile https up --build -d
docker compose ps
docker compose logs --tail=100 web worker migrate
```

Caddy gère HTTPS et la redirection HTTP, selon sa [documentation officielle](https://caddyserver.com/docs/automatic-https). Le web écoute uniquement sur 127.0.0.1:3000 côté hôte, accessible par le proxy sur le réseau interne. PostgreSQL n’a pas de port publié. Les services web/worker s’exécutent comme utilisateur non-root.

Le service `migrate` doit terminer avec succès avant le démarrage du web/worker. Aucun secret n’entre dans le contexte Docker (`.dockerignore`). Le build utilise `npm ci` et le lockfile ; les dépendances de développement ne sont pas présentes dans le worker final. Le serveur web utilise la sortie Next.js standalone.

Créer le premier compte dans le navigateur avec le code d’installation. Les inscriptions suivantes sont fermées. Une instance privée par agence est le périmètre Community actuel. Ne pas transformer cette version en cloud public multi-tenant sans revue des points de SECURITY.md.

## Budget, worker et conservation

`MAX_MONTHLY_BUDGET_USD` fixe le plafond de l’installation (20 $ par défaut, maximum de configuration actuellement 1 000 $). Le propriétaire peut fixer son plafond d’organisation dans l’interface dans cette limite. La valeur par défaut d’organisation est 10 $. Les plafonds concernent les appels de cette installation, pas les autres usages d’une même clé.

Le worker démarre au lancement Compose, revendique les tâches avec `FOR UPDATE SKIP LOCKED`, enregistre un heartbeat et marque une exécution abandonnée comme incertaine après deux minutes. Ne pas ajouter de retry aveugle après un timeout fournisseur. L’arrêt gracieux accorde 90 secondes au conteneur. Les plafonds des fournisseurs restent à configurer chez eux.

`RETENTION_DAYS` accepte 1–3650 jours (365 par défaut). Nettoyage des campagnes terminées par le worker chaque minute ; sessions et compteurs expirés sont aussi purgés. Les enregistrements d’usage gardent au moins 62 jours et au moins la rétention choisie. Adapter également la rétention des sauvegardes et des logs. Pas de télémétrie commerciale sortante.

## Sauvegarde

```sh
bash scripts/backup.sh
```

Le dump PostgreSQL est écrit en mode privé dans `backups/`, ignoré par Git. Le copier dans un stockage hors serveur avec chiffrement, contrôle d’accès et une durée adaptée (par exemple 7 journalières + 4 hebdomadaires, à valider selon les données). Sauvegarder séparément la clé de chiffrement et la configuration : le dump seul ne permet pas de retrouver les clés API. Ne jamais envoyer un dump par issue GitHub.

## Tester une restauration sans écraser la base active

Utiliser d’abord une base distincte et un dump dont l’origine est connue :

```sh
docker compose exec -T db createdb -U visibility visibility_restore
docker compose exec -T db pg_restore -U visibility -d visibility_restore --no-owner --exit-on-error < backups/VOTRE_DUMP.dump
docker compose exec -T db psql -U visibility -d visibility_restore -c 'select count(*) from projects;'
```

Comparer les comptes, campagnes et réponses au relevé de sauvegarde. Vérifier le déchiffrement dans une instance de restauration privée avec la même `ENCRYPTION_KEY`, **worker arrêté** pour éviter des appels inattendus. Avant toute bascule de production : arrêter les écritures/worker, effectuer une dernière sauvegarde, faire approuver le plan de bascule et sa réversibilité. Ne pas exécuter `docker compose down -v` en production : cela supprimerait les volumes.

## Mise à jour

Lire les notes/migrations, sauvegarder, attendre la fin des campagnes puis arrêter le worker. Rebuilder et exécuter les migrations une seule fois, sans autre opérateur de migration simultané :

```sh
docker compose stop worker
docker compose build
docker compose run --rm migrate
docker compose up -d web worker
```

Le retour à une ancienne image n’annule pas une migration. Une restauration nécessite un plan explicite. Ne pas changer le catalogue de modèles tant que des réponses sont en file : le worker refuse une configuration de modèle devenue différente au lieu d’interroger silencieusement un autre modèle.

## Récupération du propriétaire

Accès serveur administrateur requis. En installation Node :

```sh
npm run account:reset -- owner@example.com
```

Un nouveau mot de passe aléatoire est enregistré dans un fichier `.local/recovery-….txt` de mode 0600 ; toutes les sessions existantes sont révoquées. Lire ce fichier localement, conserver le mot de passe dans un gestionnaire, puis supprimer le fichier. En Docker, exécuter la même commande dans le conteneur worker et récupérer le fichier privé via `docker compose cp`, sans publier son contenu dans les logs ou dans Git. Aucun email de récupération n’est envoyé.

## Diagnostic

- `GET /api/health` : disponibilité du serveur/base, aucun détail sensible.
- Worker arrêté : vérifier `docker compose logs worker`, le secret de chiffrement et la connexion PostgreSQL ; l’indicateur UI se met à jour toutes les huit secondes.
- `invalid_origin` : `APP_URL` doit correspondre exactement au schéma+hôte+port utilisés par le navigateur.
- `provider_http_401/403` : vérifier clé, projet fournisseur et accès au modèle ; `429` : quota fournisseur. Le corps d’erreur upstream est volontairement non journalisé.
- `invalid_provider_payload` : inspecter une réponse via un environnement de test autorisé et mettre à jour le schéma selon la documentation officielle. Ne pas inventer une réponse de secours.
- `worker_interrupted_no_automatic_retry` : vérifier la facture/console fournisseur avant une nouvelle campagne. La réservation est conservée prudemment.

## English operations summary

Generate `.env`, set an exact `APP_URL` and a real `APP_DOMAIN`, configure DNS, then start `docker compose --profile https up --build -d`. Database migrations gate web/worker startup. Never publish database ports or development passwords. Run `bash scripts/backup.sh`, encrypt and copy backups off-host, preserve the encryption key separately, and restore into a separate database before a production switch. Do not run `down -v` on production. Worker interruptions retain conservative spending reservations and are never silently replayed.
