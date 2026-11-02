#!/usr/bin/env bash
set -euo pipefail
umask 077
mkdir -p backups
destination="backups/visibility-$(date -u +%Y%m%dT%H%M%SZ).dump"
temporary="$(mktemp backups/pending.XXXXXX)"
trap 'rm -f "$temporary"' EXIT
docker compose "$@" exec -T db pg_dump -U visibility -d visibility -Fc > "$temporary"
mv "$temporary" "$destination"
printf 'Backup saved: %s\n' "$destination"
