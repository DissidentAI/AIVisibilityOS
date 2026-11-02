#!/usr/bin/env bash
set -euo pipefail
trap 'printf "Hostinger CI check failed at line %s (secret values are not logged).\n" "$LINENO" >&2' ERR
if [[ "${CI:-}" != true ]]; then
  printf 'This destructive disposable-stack test is restricted to CI.\n' >&2
  exit 1
fi
umask 077
mkdir -p .local
node scripts/setup-hostinger.mjs --domain visibility.example.com
export AI_VISIBILITY_SOURCE=..
compose=(docker compose --env-file .env.hostinger -p aivisibility-hostinger-ci -f deploy/compose.hostinger.yaml -f tests/docker/hostinger-ci.yaml)
cleanup() { "${compose[@]}" down -v; }
trap cleanup EXIT
# Use the production proxy config with a local test CA instead of calling a public ACME service.
sed '/encode zstd gzip/a\
    tls internal
' deploy/Caddyfile > .local/hostinger-ci-Caddyfile
printf '127.0.0.1 visibility.example.com\n' | sudo tee -a /etc/hosts > /dev/null
"${compose[@]}" config --quiet
"${compose[@]}" build
"${compose[@]}" run --rm --no-deps proxy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
"${compose[@]}" up -d --wait
for attempt in $(seq 1 30); do
  if "${compose[@]}" cp proxy:/data/caddy/pki/authorities/local/root.crt .local/hostinger-ci-ca.crt 2>/dev/null; then break; fi
  sleep 1
done
export NODE_EXTRA_CA_CERTS="$PWD/.local/hostinger-ci-ca.crt"
export SMOKE_ORIGIN=https://visibility.example.com
curl --fail --silent --show-error --cacert "$NODE_EXTRA_CA_CERTS" "$SMOKE_ORIGIN/api/health" > /dev/null
test "$(curl --silent --output /dev/null --write-out '%{http_code}' http://visibility.example.com/)" = 308
node --env-file=.env.hostinger --import tsx scripts/docker-smoke.ts
"${compose[@]}" exec -T web test -f /app/LICENSE
"${compose[@]}" exec -T web test -f /app/third-party/index.json
"${compose[@]}" exec -T worker test -f /app/third-party/index.json
printf 'Application and dependency notices are present.\n'
# Inspect actual host bindings, not the formatting of `compose port` for an EXPOSE-only port.
# Only read this safe field: a full inspect would include private environment values.
for service in web db; do
  container_id="$("${compose[@]}" ps -q "$service")"
  test -n "$container_id"
  docker inspect --format '{{json .HostConfig.PortBindings}}' "$container_id" | node --input-type=module -e '
    let input=""; for await (const chunk of process.stdin) input+=chunk;
    const bindings=JSON.parse(input) ?? {};
    if(Object.values(bindings).some(value=>Array.isArray(value) && value.length))
      throw new Error("Application or database has a host port binding");
  '
done
printf 'Application and database ports are private.\n'
backup_output="$(bash scripts/backup.sh --env-file .env.hostinger -p aivisibility-hostinger-ci -f deploy/compose.hostinger.yaml -f tests/docker/hostinger-ci.yaml)"
backup_path="${backup_output#Backup saved: }"
test -f "$backup_path"
"${compose[@]}" exec -T db createdb -U visibility hostinger_restore
"${compose[@]}" exec -T db pg_restore -U visibility -d hostinger_restore --no-owner --exit-on-error < "$backup_path"
test "$("${compose[@]}" exec -T db psql -U visibility -d hostinger_restore -tAc 'select count(*) from projects;')" = 1
# Recreate containers without deleting volumes; stored projects and credentials must remain.
"${compose[@]}" down
"${compose[@]}" up -d --wait
test "$("${compose[@]}" exec -T db psql -U visibility -d visibility -tAc 'select count(*) from projects;')" = 1
curl --fail --silent --show-error --cacert "$NODE_EXTRA_CA_CERTS" "$SMOKE_ORIGIN/api/health" > /dev/null
printf 'Hostinger candidate passed: TLS, redirect, bootstrap, protected API, worker, persistence and backup restore. No provider calls or public ACME requests.\n'
