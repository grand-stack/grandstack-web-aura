// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes } from "react-router";
import { useMutation, useQuery } from "urql";
import { SetupQuery, SyncNowMutation } from "./graphql/documents";
import { AppContext, errorMessage, useApp, useNow, usePoll } from "./hooks";
import { relativeTime } from "./lib/format";
import { applyTheme, loadTheme, nextTheme, saveTheme, type Theme } from "./lib/theme";
import { Account } from "./pages/Account";
import { Detail } from "./pages/Detail";
import { Edit } from "./pages/Edit";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";
import { OperationPage } from "./pages/OperationPage";
import { Operations } from "./pages/Operations";
import { Results } from "./pages/Results";
import { FirstSync, SetupPage } from "./pages/Setup";
import { Banner, Button } from "./ui";
import { Icon } from "./ui/Icon";

const THEME_LABEL: Record<Theme, string> = { auto: "Theme: follows your system", light: "Theme: light", dark: "Theme: dark" };

function ThemeButton() {
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  useEffect(() => applyTheme(theme), [theme]);
  return (
    <button
      type="button"
      className="iconbtn"
      aria-label={`${THEME_LABEL[theme]}. Change theme`}
      title={THEME_LABEL[theme]}
      onClick={() => {
        const next = nextTheme(theme);
        saveTheme(next);
        setTheme(next);
      }}
    >
      <Icon name={theme === "auto" ? "auto" : theme === "light" ? "sun" : "moon"} />
    </button>
  );
}

function TopBar({ connected }: { connected: boolean }) {
  const { setup, syncNow, syncing } = useApp();
  const now = useNow();
  return (
    <header className="topbar">
      <Link to="/" className="brand"><Icon name="logo" size={24} />Aura console</Link>
      {connected && (
        <nav className="topnav" aria-label="Main">
          <NavLink to="/instances" className="navlink instances" aria-label="Instances"><Icon name="grid" /><span className="label">Instances</span></NavLink>
          <NavLink to="/operations" className="navlink" aria-label="Operations"><Icon name="history" /><span className="label">Operations</span></NavLink>
          <NavLink to="/account" className="navlink" aria-label="Aura account"><Icon name="person" /><span className="label">Aura account</span></NavLink>
        </nav>
      )}
      <div className="topright">
        {connected && setup.lastSyncAt && <span className="synced">Synced {relativeTime(setup.lastSyncAt, now)}</span>}
        {connected && (
          <button type="button" className={`iconbtn${syncing ? " spin" : ""}`} onClick={() => void syncNow()} disabled={syncing} aria-label={syncing ? "Syncing with Aura" : "Sync with Aura now"} title="Sync with Aura now">
            <Icon name="sync" />
          </button>
        )}
        <ThemeButton />
      </div>
    </header>
  );
}

/** Asks the gateway where the connection stands, and keeps asking: often while a sync runs, now and then otherwise. */
export function App() {
  const [{ data, error, fetching }, refetch] = useQuery({ query: SetupQuery, requestPolicy: "network-only" });
  const [, runSync] = useMutation(SyncNowMutation);
  const [syncError, setSyncError] = useState<string>();

  const refetchSetup = useCallback(() => refetch({ requestPolicy: "network-only" }), [refetch]);
  const syncing = data?.auraSetup.syncing ?? false;
  usePoll(refetchSetup, syncing ? 1000 : 30_000, data !== undefined);

  const syncNow = useCallback(async () => {
    setSyncError(undefined);
    const result = await runSync({});
    if (result.error) setSyncError(errorMessage(result.error));
    refetchSetup();
  }, [runSync, refetchSetup]);

  const state = useMemo(() => (data ? { setup: data.auraSetup, refetchSetup, syncNow, syncing } : null), [data, refetchSetup, syncNow, syncing]);

  if (!state) {
    return (
      <>
        <header className="topbar"><Link to="/" className="brand"><Icon name="logo" size={24} />Aura console</Link><div className="topright"><ThemeButton /></div></header>
        <div className="page narrow">
          {error ? (
            <>
              <Banner tone="danger">{errorMessage(error)}</Banner>
              <Button variant="primary" onClick={refetchSetup}>Try again</Button>
            </>
          ) : (
            fetching && <p className="muted" role="status">Loading…</p>
          )}
        </div>
      </>
    );
  }

  const { setup } = state;
  // Credentials stored but no sync has ever finished: show the first sync, not an empty app
  const firstSync = !setup.required && !setup.lastSyncAt;

  return (
    <AppContext.Provider value={state}>
      <TopBar connected={!setup.required && !firstSync} />
      {syncError && <div className="page" style={{ paddingBottom: 0 }}><Banner tone="danger">{syncError}</Banner></div>}
      {setup.required ? (
        <SetupPage onConnected={refetchSetup} />
      ) : firstSync ? (
        <FirstSync />
      ) : (
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/instances" element={<Results />} />
          <Route path="/instances/:id" element={<Detail />} />
          <Route path="/instances/:id/edit" element={<Edit />} />
          <Route path="/operations" element={<Operations />} />
          <Route path="/operations/:id" element={<OperationPage />} />
          <Route path="/account" element={<Account />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      )}
    </AppContext.Provider>
  );
}
