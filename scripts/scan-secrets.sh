#!/usr/bin/env bash
set -euo pipefail
# Official binary, pinned version and checksum. No account or data upload.
version=8.30.1
checksum=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb
if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  printf 'This CI installer supports Linux x86_64. Use Gitleaks %s on other systems.\n' "$version" >&2
  exit 1
fi
temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT
curl --fail --silent --show-error --location --proto '=https' \
  "https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_linux_x64.tar.gz" \
  --output "$temporary/gitleaks.tar.gz"
printf '%s  %s\n' "$checksum" "$temporary/gitleaks.tar.gz" | sha256sum --check --status
tar -xzf "$temporary/gitleaks.tar.gz" -C "$temporary" gitleaks
"$temporary/gitleaks" git --redact=100 --no-banner --log-opts=--all .
