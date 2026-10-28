// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { CombinedError } from "urql";
import type { SetupQuery } from "./graphql/generated/graphql";

type Setup = SetupQuery["auraSetup"];

export interface AppState {
  setup: Setup;
  /** Read the connection state again now. */
  refetchSetup: () => void;
  /** Ask for a sync, then keep an eye on it. */
  syncNow: () => Promise<void>;
  syncing: boolean;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const state = useContext(AppContext);
  if (!state) throw new Error("useApp must be used inside the app shell");
  return state;
}

/** Calls `fn` every `ms` while `enabled`. */
export function usePoll(fn: () => void, ms: number, enabled: boolean): void {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => latest.current(), ms);
    return () => window.clearInterval(id);
  }, [ms, enabled]);
}

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** The current time, refreshed every `ms`, so "2 minutes ago" stays true while a page is open. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/** Runs `refetch` when a sync finishes, so what a page shows follows the store. Not on the first render. */
export function useRefreshOnSync(refetch: () => void, lastSyncAt: string | null): void {
  const first = useRef(true);
  const latest = useRef(refetch);
  latest.current = refetch;
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    latest.current();
  }, [lastSyncAt]);
}

export function useTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} · Aura console` : "Aura console";
  }, [title]);
}

/** What to tell the person: a message the server chose to show, or a plain sentence when the server could not be reached. */
export function errorMessage(error: CombinedError | undefined): string | undefined {
  if (!error) return undefined;
  const fromServer = error.graphQLErrors[0]?.message;
  if (fromServer && fromServer !== "Unexpected error.") return fromServer;
  if (error.networkError) return "Could not reach the server. Check that it is running, then try again.";
  return "Something went wrong. Try again.";
}
