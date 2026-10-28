// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import "@fontsource-variable/public-sans";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { Client, Provider, cacheExchange, fetchExchange } from "urql";
import { App } from "./App";
import { applyTheme, loadTheme } from "./lib/theme";
import "./theme/tokens.css";
import "./styles.css";

// Apply the saved theme before the first paint, so a dark-mode visitor never sees a flash of light
applyTheme(loadTheme());

const client = new Client({
  // The browser talks to the gateway only. It never sees the store's internal endpoint or the Aura API.
  url: import.meta.env.VITE_GRAPHQL_URL ?? "http://localhost:4100/graphql",
  exchanges: [cacheExchange, fetchExchange],
  // Show what is cached straight away, but always check, so lists and counts follow the store
  requestPolicy: "cache-and-network",
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider value={client}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Provider>
  </StrictMode>,
);
