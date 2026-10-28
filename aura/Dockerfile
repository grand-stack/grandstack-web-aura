# Copyright (c) "Neo4j"
# Neo4j Sweden AB [http://neo4j.com]
# Build with the repository root as the context: docker build -f aura/Dockerfile .
FROM node:24.22.1-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY store/package.json store/
COPY aura/package.json aura/
COPY mock-aura/package.json mock-aura/
COPY gateway/package.json gateway/
COPY web/package.json web/
RUN npm ci --workspace aura --include-workspace-root
COPY aura ./aura
RUN npm run build -w aura && npm prune --omit=dev --workspace aura --include-workspace-root

FROM node:24.22.1-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
ENV NODE_ENV=production
WORKDIR /app/aura
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/aura/dist ./dist
COPY aura/package.json ./
USER node
EXPOSE 4010
CMD ["node", "dist/index.js"]
