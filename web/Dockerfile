# Copyright (c) "Neo4j"
# Neo4j Sweden AB [http://neo4j.com]
# Build with the repository root as the context: docker build -f web/Dockerfile .
FROM node:24.22.1-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY aura/package.json aura/
COPY mock-aura/package.json mock-aura/
COPY gateway/package.json gateway/
COPY web/package.json web/
RUN npm ci --workspace web --include-workspace-root
COPY docs ./docs
COPY web ./web
# The app calls /graphql on its own origin, where the edge forwards it to the gateway. Set this only to point it somewhere else.
ARG VITE_GRAPHQL_URL=
ENV VITE_GRAPHQL_URL=$VITE_GRAPHQL_URL
RUN npm run build -w web

FROM nginxinc/nginx-unprivileged:1.30.6-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03
COPY --from=build /app/web/dist /usr/share/nginx/html
# The image fills in ${NAME} placeholders in templates from the environment, and leaves nginx's own $variables alone
COPY web/default.conf.template /etc/nginx/templates/default.conf.template
COPY edge/security-headers.conf /etc/nginx/snippets/security-headers.conf
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
EXPOSE 8080
