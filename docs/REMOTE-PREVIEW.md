# Essai distant temporaire / Temporary remote preview

Un [Quick Tunnel Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) fournit une URL HTTPS temporaire vers le serveur web local. Il ne nécessite pas de domaine ni de compte Cloudflare. Il est destiné aux essais, sans garantie de disponibilité, et son adresse change à chaque nouveau tunnel.

## Sur le Mac

1. Préparer l’installation et la base suivant le README. Laisser PostgreSQL et le worker actifs.
2. Construire l’application avec `npm run build`. Utiliser le serveur de production pour le partage.
3. Installer le client officiel : `brew install cloudflared`.
4. Lancer `cloudflared tunnel --url http://127.0.0.1:3000 --no-autoupdate` et relever **l’URL réellement affichée**.
5. Arrêter uniquement le processus web de cette installation, puis le relancer avec l’origine HTTPS exacte :

```sh
APP_URL='URL_HTTPS_AFFICHEE_PAR_CLOUDFLARED' npm start
```

Le placeholder doit être remplacé. Garder le web et PostgreSQL liés à leur interface locale ; aucun port de base de données ne doit être partagé. Ne pas désactiver le contrôle `Origin` pour résoudre un problème d’accès : vérifier que `APP_URL` correspond exactement à l’URL ouverte sur le téléphone. Les cookies de session deviennent `Secure` avec une origine HTTPS.

Pour une installation sans propriétaire, transmettre le code `BOOTSTRAP_TOKEN` uniquement à la personne qui crée le premier compte, par un canal privé. Ne pas l’inclure dans l’URL, les captures ou Git. La création du premier propriétaire ferme les inscriptions. Une configuration de prévisualisation peut être gardée dans `.local/preview.env` (ignoré par Git, permissions `0600`), sans modifier le `.env` principal.

Vérifier depuis l’URL HTTPS que `/api/health` répond et que `/api/state` refuse une session absente. Créer ensuite son propre compte, connecter ses clés et utiliser un budget explicite pour les mesures réelles.

## Fin de l’essai

Arrêter le processus `cloudflared` ferme le lien. Arrêter le serveur web de prévisualisation, puis relancer `npm start` avec l’origine locale habituelle si nécessaire. Le Mac doit rester allumé et connecté pendant l’essai ; une commande `caffeinate -i -w PID_DU_TUNNEL` peut empêcher la veille d’inactivité uniquement pendant la durée du tunnel. Elle ne garantit pas l’accès si le Mac est éteint ou si son réseau est interrompu.

Une installation permanente utilise un domaine, un reverse proxy HTTPS et des sauvegardes : voir [DEPLOYMENT.md](DEPLOYMENT.md).

## English

Install the official `cloudflared` client, build the application, keep the local database/worker running, and start a Quick Tunnel to `http://127.0.0.1:3000`. Restart only the web process with `APP_URL` set to the exact HTTPS URL printed by the tunnel. Keep authentication and origin checks enabled. Share a first-owner setup code privately, never in the URL or repository. The hostname is temporary and ends when the tunnel stops; the Mac and network must remain available. Use the VPS deployment guide for a permanent installation.
