# Copyright (c) "Neo4j"
# Neo4j Sweden AB [http://neo4j.com]
# The only thing that faces the network: TLS, sign-in, rate limits and security headers in front of the web app and the gateway.
FROM nginxinc/nginx-unprivileged:1.31.7-alpine@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e
# The image fills in ${NAME} placeholders in templates from the environment, and leaves nginx's own $variables alone
COPY default.conf.template /etc/nginx/templates/default.conf.template
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY 10-require-secrets.sh /docker-entrypoint.d/10-require-secrets.sh
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    EDGE_MUTATION_RATE=60r/m \
    EDGE_REQUEST_RATE=20r/s \
    EDGE_HSTS=""
EXPOSE 8443
