# Copyright (c) "Neo4j"
# Neo4j Sweden AB [http://neo4j.com]
# Build with the repository root as the context: docker build -f store/Dockerfile .
FROM node:24.22.1-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY store/package.json store/
COPY aura/package.json aura/
COPY mock-aura/package.json mock-aura/
RUN npm ci --workspace store --include-workspace-root
COPY store ./store
RUN npm run build -w store && npm prune --omit=dev --workspace store --include-workspace-root

FROM node:24.22.1-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
ENV NODE_ENV=production
WORKDIR /app/store
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/store/dist ./dist
COPY store/package.json ./
COPY store/schema ./schema
COPY store/setup ./setup
USER node
EXPOSE 4001
CMD ["node", "dist/index.js"]
