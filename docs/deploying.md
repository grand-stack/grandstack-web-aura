# Deploying

This tool can delete databases from a phone. Read this before it is reachable by anyone but you.

## What the sign-in is, and is not

The edge (`edge/`) asks for a username and password with HTTP Basic, over TLS, before it serves anything: the app, the GraphQL endpoint, even the app's own files. The gateway, subgraphs, web container and database are on the compose network and are not published.

- **One user, one level of access.** Anyone who can sign in can create, change and delete instances and show stored passwords. There is no view-only role yet.
- **Basic auth has no sign-out.** The browser keeps the credentials until it is closed. On a shared device, close the browser.
- **The password is the whole defence against guessing.** The edge limits each address to 20 requests a second and the hash is bcrypt, but that only slows a guesser. Use the long random password `scripts/init-env.sh` makes, and do not reuse it.
- **No lockout, no second factor, no audit of sign-ins** beyond nginx's access log. If that is not enough, put the edge behind your own identity-aware proxy or VPN and keep this sign-in as a second gate.
- **It is only safe over TLS.** Basic sends the password with every request. The edge only speaks TLS and does not answer on plain HTTP.

## A real hostname

1. Get a certificate for the name (Let's Encrypt, or your own CA). Put the certificate chain in `edge/secrets/tls.crt` and the key in `edge/secrets/tls.key`, then restart the edge. Renewal is yours to arrange: the edge reads the files at start.
2. Set in `.env`: `PUBLIC_ORIGIN=https://your.host`, `EDGE_BIND=0.0.0.0` (or an address), `EDGE_PORT=443` if you want it. Binding below 1024 may need the container runtime to allow it, or put a port forward in front.
3. Set `EDGE_HSTS=max-age=31536000` once the certificate is real. It tells browsers to use only HTTPS for the whole host, whatever the port, so do not set it for `localhost`.
4. Open only that one port in the firewall. Nothing else is published unless you add `compose.dev.yaml`, which you must not.

## Secrets and backups

- `.env` holds `SECRET_KEY`, which seals the Aura client secret and every stored instance password. **Lose it and those cannot be opened.** Back it up apart from the database.
- The Neo4j volume (`neo4j-data`) is the store. It is a cache of Aura plus history and the sealed passwords. Back it up if the history or the stored passwords matter. Everything else can be rebuilt by connecting again and syncing.
- Key rotation: values record the key version that sealed them, and `SECRET_KEY_VERSION` selects the current one, but there is no tool yet to re-seal old values under a new key.
- `edge/secrets/` is ignored by git. Keep it that way.

## Running it

- Rate limits are set by `EDGE_REQUEST_RATE` (default `20r/s` per address, with a burst of 60) and `EDGE_MUTATION_RATE` (default `60r/m` per address for POSTs, which are the changes, with a burst of 30). Reads are GETs and are not held to the second.
- The gateway has no browser query editor.
- The edge looks the gateway and web container up again every ten seconds, so restarting either does not break it.
- The aura subgraph syncs every 15 minutes (`SYNC_INTERVAL_MS`) and Aura limits the API's request rate, so a large account syncs slowly rather than fast.
- The gateway image is pinned by digest. Update the digest on purpose, and recompose the supergraph if the schema changes.

## What is not here

- Roles (view only, may change).
- Sign-in events in an audit log. Password reveals are recorded in the store (`AuditEvent`), with who is "local" until there is more than one user.
- Re-sealing secrets under a new key.
- Tuning the sync rate against a real account: see `real-account-checklist.md`.
