#!/bin/sh
# Copyright (c) "Neo4j"
# Neo4j Sweden AB [http://neo4j.com]
# Refuse to start without a sign-in list and a certificate. An edge that cannot check anyone must not let everyone in.
set -eu
fail() { echo "edge: $1" >&2; exit 1; }
[ -s /etc/nginx/secrets/htpasswd ] || fail "no sign-in list at /etc/nginx/secrets/htpasswd. Run scripts/init-env.sh"
[ -s /etc/nginx/secrets/tls.crt ] || fail "no certificate at /etc/nginx/secrets/tls.crt. Run scripts/init-env.sh or mount your own"
[ -s /etc/nginx/secrets/tls.key ] || fail "no private key at /etc/nginx/secrets/tls.key"
grep -qE '^[^#:][^:]*:.{20,}$' /etc/nginx/secrets/htpasswd || fail "the sign-in list has no user with a hashed password"
# A plain-text password is not a hash. Accept only bcrypt, apr1 and ssha.
if grep -vE '^(#|$)' /etc/nginx/secrets/htpasswd | grep -qvE '^[^:]*:(\$2[aby]\$|\$apr1\$|\{SSHA\})'; then
  fail "the sign-in list has a password that is not hashed (use htpasswd -B)"
fi
