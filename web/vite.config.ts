// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // 3100, not 3000: grandstack's own web app uses 3000
  server: { port: 3100, host: true },
});
