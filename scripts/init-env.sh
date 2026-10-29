#!/usr/bin/env bash
# Copyright (c) "Neo4j"
# Neo4j Sweden AB [http://neo4j.com]
# Makes everything the Aura setup needs before its first start, and nothing it already has:
#   .env             in the grandstack repository (beside this one), where compose reads it: the key that seals secrets (SECRET_KEY)
#                    (the database password is left at the grandstack default). Set ENV_FILE to write somewhere else.
# With --edge (needed for compose.edge.yaml, which puts TLS and a sign-in in front of the app):
#   edge/secrets/    who may sign in (htpasswd, one user, bcrypt hash) and a self-signed certificate for localhost, to be replaced by
#                    a real one anywhere else. The directory is private to you; the files are readable so the container's user can read
#                    the mounted copies.
# Run it again to fill in what is missing. It never replaces an existing secret, because a new SECRET_KEY cannot open what the old one sealed.
#   scripts/init-env.sh                    first time, for the app on plain HTTP on this machine
#   scripts/init-env.sh --edge             first time, and for the edge too (prints the sign-in password once)
#   scripts/init-env.sh --new-password     choose a new sign-in password (prints it once)
#   EDGE_PASSWORD=... scripts/init-env.sh --new-password   set the password yourself instead of a random one
#   EDGE_SAN="IP:192.168.0.5,DNS:mylaptop.local" scripts/init-env.sh --new-cert
#                                          reissue the certificate for those names too, so a phone on the same network reaches it by them
set -euo pipefail
cd "$(dirname "$0")/.."

new_password=false
new_cert=false
edge=false
for arg in "$@"; do
  [ "$arg" = "--edge" ] && edge=true
  # Asking for a new password or certificate means the edge
  [ "$arg" = "--new-password" ] && new_password=true && edge=true
  [ "$arg" = "--new-cert" ] && new_cert=true && edge=true
done
user="${EDGE_USER:-admin}"

random() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-"$1"; }

# compose reads .env from the grandstack repository, which sits beside this one
if [ -z "${ENV_FILE:-}" ]; then
  if [ -d ../grandstack ]; then ENV_FILE=../grandstack/.env; else ENV_FILE=.env; fi
fi
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"
# A line that exists but has no value (as in .env.example) counts as missing
ensure() { # name, value-generator
  if ! grep -qE "^$1=.+" "$ENV_FILE"; then
    grep -vE "^$1=" "$ENV_FILE" > "$ENV_FILE.tmp" || true
    mv "$ENV_FILE.tmp" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    printf '%s=%s\n' "$1" "$($2)" >> "$ENV_FILE"
    echo "wrote $1 to $ENV_FILE"
  fi
}
ensure SECRET_KEY "openssl rand -base64 32"
# The database password is left alone: the grandstack compose file's Neo4j health check only knows the default (grandstack-dev), so a
# different NEO4J_PASSWORD would make Neo4j look unhealthy. Set one yourself only if you also change that health check.

if [ "$edge" = false ]; then
  echo "ready: $ENV_FILE. Start with, in the grandstack folder: docker compose -f compose.yaml -f compose.aura.yaml up --build   (run this again with --edge first to put TLS and a sign-in in front)"
  exit 0
fi
mkdir -p edge/secrets
chmod 700 edge/secrets
if [ ! -s edge/secrets/tls.crt ] || [ ! -s edge/secrets/tls.key ] || [ "$new_cert" = true ]; then
  san="DNS:localhost,IP:127.0.0.1${EDGE_SAN:+,$EDGE_SAN}"
  openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=localhost" \
    -addext "subjectAltName=$san" \
    -keyout edge/secrets/tls.key -out edge/secrets/tls.crt 2>/dev/null
  chmod 644 edge/secrets/tls.key edge/secrets/tls.crt
  echo "wrote a self-signed certificate for $san to edge/secrets (valid 365 days; browsers will warn)"
fi

if [ ! -s edge/secrets/htpasswd ] || [ "$new_password" = true ]; then
  # A password of your own choosing is possible, and as weak as you make it
  password="${EDGE_PASSWORD:-$(random 32)}"
  htpasswd -nbB "$user" "$password" | sed '/^$/d' > edge/secrets/htpasswd
  chmod 644 edge/secrets/htpasswd
  echo
  echo "Sign in at https://localhost:8443 as:  $user"
  echo "Password (shown once, not stored anywhere):  $password"
fi
