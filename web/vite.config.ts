// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // 3100, not 3000: grandstack's own web app uses 3000
  // `npm run dev` talks to the gateway that compose.aura.yaml publishes on 4000
  server: { port: 3100, host: true, proxy: { "/graphql": process.env.DEV_GATEWAY ?? "http://localhost:4000" } },
});
