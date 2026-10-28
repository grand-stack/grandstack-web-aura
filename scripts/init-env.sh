#!/usr/bin/env bash
# Copyright (c) "Neo4j"
# Neo4j Sweden AB [http://neo4j.com]
# Makes everything the stack needs before its first start, and nothing it already has:
#   .env             the key that seals secrets, the database password and the token between the two subgraphs
#   edge/secrets/    who may sign in (htpasswd, one user, bcrypt hash) and a self-signed certificate for localhost, to be replaced by
#                    a real one anywhere else. The directory is private to you; the files are readable so the container's user can read
#                    the mounted copies.
# Run it again to fill in what is missing. It never replaces an existing secret, because a new SECRET_KEY cannot open what the old one sealed.
#   scripts/init-env.sh                    first time
#   scripts/init-env.sh --new-password     choose a new sign-in password (prints it once)
set -euo pipefail
cd "$(dirname "$0")/.."

new_password=false
[ "${1:-}" = "--new-password" ] && new_password=true
user="${EDGE_USER:-admin}"

random() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-"$1"; }

touch .env
chmod 600 .env
ensure() { # name, value-generator
  if ! grep -q "^$1=" .env; then
    printf '%s=%s\n' "$1" "$($2)" >> .env
    echo "wrote $1 to .env"
  fi
}
ensure SECRET_KEY "openssl rand -base64 32"
ensure NEO4J_PASSWORD "random 32"
ensure INTERNAL_TOKEN "random 40"

mkdir -p edge/secrets
chmod 700 edge/secrets
if [ ! -s edge/secrets/tls.crt ] || [ ! -s edge/secrets/tls.key ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
    -keyout edge/secrets/tls.key -out edge/secrets/tls.crt 2>/dev/null
  chmod 644 edge/secrets/tls.key edge/secrets/tls.crt
  echo "wrote a self-signed certificate for localhost to edge/secrets (valid 365 days; browsers will warn)"
fi

if [ ! -s edge/secrets/htpasswd ] || [ "$new_password" = true ]; then
  password="$(random 32)"
  htpasswd -nbB "$user" "$password" | sed '/^$/d' > edge/secrets/htpasswd
  chmod 644 edge/secrets/htpasswd
  echo
  echo "Sign in at https://localhost:8443 as:  $user"
  echo "Password (shown once, not stored anywhere):  $password"
fi
