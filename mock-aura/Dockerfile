# Copyright (c) "Neo4j"
# Neo4j Sweden AB [http://neo4j.com]
# Build with the repository root as the context: docker build -f mock-aura/Dockerfile .
FROM node:24.22.2-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY aura/package.json aura/
COPY mock-aura/package.json mock-aura/
COPY gateway/package.json gateway/
COPY web/package.json web/
RUN npm ci --workspace mock-aura --include-workspace-root
COPY mock-aura ./mock-aura
RUN npm run build -w mock-aura

FROM node:24.22.2-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c
ENV NODE_ENV=production
WORKDIR /app/mock-aura
COPY --from=build /app/mock-aura/dist ./dist
COPY mock-aura/package.json ./
USER node
EXPOSE 4020
CMD ["node", "dist/main.js"]
