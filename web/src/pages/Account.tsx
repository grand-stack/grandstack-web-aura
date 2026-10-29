// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { useState } from "react";
import { useMutation, useQuery } from "urql";
import { AccountQuery, DisconnectMutation, ResetStoreMutation } from "../graphql/documents";
import { errorMessage, useApp, useNow, useRefreshOnSync, useTitle } from "../hooks";
import { formatDate, plural, relativeTime } from "../lib/format";
import { Banner, Button, Skeleton, StatusChip } from "../ui";
import { Icon } from "../ui/Icon";
import { ConfirmDialog } from "../ui/Modal";
import { ConnectForm } from "./Setup";

const RUN_VIEW = {
  RUNNING: { label: "Running", tone: "info" },
  SUCCEEDED: { label: "Succeeded", tone: "ok" },
  SLOWED: { label: "Slowed down", tone: "warn" },
  FAILED: { label: "Failed", tone: "danger" },
} as const;

/** The connection to Aura, the size of the stored copy, what each tenant can create, and the recent syncs. */
export function Account() {
  useTitle("Aura account");
  const { setup, refetchSetup, syncNow, syncing } = useApp();
  const now = useNow();
  const [{ data, fetching }, refetch] = useQuery({ query: AccountQuery });
  useRefreshOnSync(() => refetch({ requestPolicy: "network-only" }), setup.lastSyncAt);
  const [replacing, setReplacing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string>();
  const [{ fetching: disconnecting }, disconnect] = useMutation(DisconnectMutation);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string>();
  const [{ fetching: resetBusy }, resetStore] = useMutation(ResetStoreMutation);

  const account = data?.auraAccounts[0];

  /** Empties what came from Aura and reads it again. The app then shows the first-sync screen until the new read finishes. */
  async function confirmReset() {
    setResetError(undefined);
    const result = await resetStore({});
    setResetting(false);
    if (result.error) {
      setResetError(errorMessage(result.error));
      return;
    }
    refetchSetup();
  }

  async function confirmDisconnect() {
    const result = await disconnect({});
    if (result.error) {
      setDisconnectError(errorMessage(result.error));
      setConfirming(false);
      return;
    }
    setConfirming(false);
    refetchSetup();
  }

  return (
    <div className="page">
      <div className="hero"><h1>Aura account</h1><p className="sub">The connection this app uses to read your Aura instances.</p></div>
      {!data && fetching && <Skeleton className="skeleton-line" />}

      <div className="grid2">
        <div className="stackgap">
          <section className="panel" aria-labelledby="conn-title">
            <h2 id="conn-title">Connection</h2>
            <div className="prow"><span className="k">Status</span><span className="v"><StatusChip label="Connected" tone="ok" /></span></div>
            <div className="prow"><span className="k">Client ID</span><span className="v mono">{setup.clientIdHint ?? account?.clientIdHint ?? "…"}</span></div>
            <div className="prow"><span className="k">Client secret</span><span className="v">Stored encrypted, never shown</span></div>
            {account?.connectedAt && <div className="prow"><span className="k">Connected since</span><span className="v">{formatDate(account.connectedAt)}</span></div>}
            <div style={{ padding: 12 }}>
              {replacing ? (
                <ConnectForm submitLabel="Replace credentials" onConnected={() => { setReplacing(false); refetchSetup(); }} onCancel={() => setReplacing(false)} />
              ) : (
                <Button onClick={() => setReplacing(true)}>Replace credentials</Button>
              )}
            </div>
          </section>

          <section className="panel" aria-labelledby="options-title">
            <h2 id="options-title">Instance options by tenant</h2>
            <p className="note" style={{ paddingTop: 10 }}>The sizes, regions and tiers each tenant can create. They will fill the create and edit forms.</p>
            {(data?.tenants ?? []).map((t) => (
              <div className="listrow" key={t.auraId}>
                <div className="main">
                  <div className="title">{t.name}</div>
                  <div className="sub">{plural(t.configurationsConnection.totalCount, "option")} · {plural(t.instancesConnection.totalCount, "instance")} · read {relativeTime(t.configsSyncedAt, now) || "never"}</div>
                </div>
              </div>
            ))}
          </section>
        </div>

        <div className="stackgap">
          <section className="panel" aria-labelledby="copy-title">
            <h2 id="copy-title">Stored copy of your account</h2>
            <div className="prow"><span className="k">Tenants</span><span className="v">{data?.tenants.length ?? "…"}</span></div>
            <div className="prow"><span className="k">Instances</span><span className="v">{data?.instancesConnection.totalCount ?? "…"}</span></div>
            <div className="prow"><span className="k">Instance options</span><span className="v">{data?.instanceConfigurationsConnection.totalCount ?? "…"}</span></div>
            <div className="prow"><span className="k">Last sync</span><span className="v">{setup.lastSyncAt ? relativeTime(setup.lastSyncAt, now) : "Not yet"}</span></div>
            <div style={{ padding: 12 }}>
              <Button variant="primary" block onClick={() => void syncNow()} disabled={syncing}>
                <Icon name="sync" size={18} className={syncing ? "spinner" : undefined} />{syncing ? "Syncing…" : "Sync now"}
              </Button>
            </div>
            <div style={{ padding: "0 12px 12px" }}>
              <Button block onClick={() => setResetting(true)} disabled={syncing}>Reset the stored copy…</Button>
              <p className="note" style={{ padding: "8px 0 0" }}>Removes what came from Aura and reads it in again. Keeps your credentials, past changes and stored passwords.</p>
              {resetError && <div style={{ marginTop: 8 }}><Banner tone="danger">{resetError}</Banner></div>}
            </div>
          </section>

          <section className="panel" aria-labelledby="runs-title">
            <h2 id="runs-title">Recent syncs</h2>
            {data && data.syncRuns.length === 0 && <p className="empty">No syncs yet.</p>}
            {(data?.syncRuns ?? []).map((run) => {
              const view = RUN_VIEW[run.status as keyof typeof RUN_VIEW] ?? RUN_VIEW.RUNNING;
              return (
                <div className="listrow" key={run.id}>
                  <div className="main">
                    <div className="title">{relativeTime(run.startedAt, now)}</div>
                    <div className="sub">
                      {run.status === "FAILED" && run.error
                        ? run.error
                        : `${plural(run.tenants ?? 0, "tenant")}, ${plural(run.instances ?? 0, "instance")}, ${plural(run.requests ?? 0, "request")}${run.retries ? `, ${plural(run.retries, "retry", "retries")}` : ""}`}
                    </div>
                  </div>
                  <StatusChip label={view.label} tone={view.tone} />
                </div>
              );
            })}
          </section>

          <section className="panel dangerzone" aria-labelledby="disc-title">
            <h2 id="disc-title">Disconnect</h2>
            <div className="body">
              <p>Deletes the stored client secret and stops syncing. Instances, stored passwords and history stay here, and nothing changes in Aura. Connect again to resume.</p>
              {disconnectError && <Banner tone="danger">{disconnectError}</Banner>}
              <Button variant="danger" onClick={() => setConfirming(true)}>Disconnect from Aura</Button>
            </div>
          </section>
        </div>
      </div>

      <ConfirmDialog open={resetting} title="Reset the stored copy?" confirmLabel="Reset and read again" busy={resetBusy} onCancel={() => setResetting(false)} onConfirm={() => void confirmReset()}>
        <p>This removes the tenants, instance options and instances that this app copied from Aura, then reads them in again. It takes a few seconds, and the app shows its first-read screen meanwhile.</p>
        <p style={{ marginTop: 8 }}><strong>Kept:</strong> your Aura credentials, every past change and its steps, the passwords stored for instances made here, and the sync history. Nothing changes in Aura.</p>
        <p className="muted" style={{ marginTop: 8 }}>It is refused while a sync or a change is under way.</p>
      </ConfirmDialog>

      <ConfirmDialog open={confirming} title="Disconnect from Aura?" confirmLabel="Disconnect" busy={disconnecting} onCancel={() => setConfirming(false)} onConfirm={() => void confirmDisconnect()}>
        <p>The stored client secret will be deleted and syncing will stop. Your instances, stored passwords and history stay. Nothing changes in Aura.</p>
        <p className="muted" style={{ marginTop: 8 }}>You can connect again at any time with the client ID and secret.</p>
      </ConfirmDialog>
    </div>
  );
}
