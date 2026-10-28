// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation } from "urql";
import { ConnectMutation } from "../graphql/documents";
import { errorMessage, useApp, useTitle } from "../hooks";
import { Banner, Button } from "../ui";

/** The client id and secret form. Used for the first connection and for replacing credentials. */
export function ConnectForm({ submitLabel, onConnected, onCancel }: { submitLabel: string; onConnected: () => void; onCancel?: () => void }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState<string>();
  const [{ fetching }, connect] = useMutation(ConnectMutation);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    const result = await connect({ clientId, clientSecret });
    // The secret is not kept a moment longer than the request needs, whatever the outcome
    setClientSecret("");
    if (result.error) {
      setError(errorMessage(result.error));
      return;
    }
    setClientId("");
    onConnected();
  }

  return (
    <form className="formstack" onSubmit={submit}>
      <div className="field">
        <label htmlFor="client-id">Client ID</label>
        <input id="client-id" className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} required />
      </div>
      <div className="field">
        <label htmlFor="client-secret">Client secret</label>
        <input id="client-secret" className="input" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} required />
        <span className="hint">Stored encrypted. It is never shown again after you connect.</span>
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      <Button type="submit" variant="primary" block disabled={fetching || !clientId.trim() || !clientSecret.trim()}>
        {fetching ? "Checking with Aura…" : submitLabel}
      </Button>
      {onCancel && <Button type="button" block onClick={onCancel}>Cancel</Button>}
    </form>
  );
}

/** The first thing anyone sees: connect an Aura account. */
export function SetupPage({ onConnected }: { onConnected: () => void }) {
  useTitle("Connect your Aura account");
  const navigate = useNavigate();
  return (
    <div className="page narrow">
      <div className="hero">
        <h1>Connect your Aura account</h1>
        <p className="sub">
          Enter the API client ID and secret from the Aura Console. We check them with Aura, then copy your existing instances into the local store.{" "}
          <a href="https://neo4j.com/docs/aura/api/authentication/" target="_blank" rel="noreferrer">Where do I find these?</a>
        </p>
      </div>
      {/* After connecting, start at the home page, not wherever the address bar was (for example /account before a disconnect) */}
      <ConnectForm submitLabel="Connect and sync" onConnected={() => { navigate("/", { replace: true }); onConnected(); }} />
    </div>
  );
}

/** Shown from the moment credentials are stored until the first sync has finished. */
export function FirstSync() {
  const { setup, syncNow } = useApp();
  useTitle("Reading your Aura account");
  const failed = !setup.syncing && setup.lastSyncStatus === "FAILED";
  return (
    <div className="page narrow">
      <div className="hero">
        <h1>{failed ? "The first sync did not finish" : "Reading your Aura account"}</h1>
        {!failed && <p className="sub">Copying your tenants, instances and the options each tenant can create. This usually takes a few seconds.</p>}
      </div>
      {failed ? (
        <>
          <Banner tone="danger">{setup.lastSyncError ?? "The sync stopped."}</Banner>
          <Button variant="primary" block onClick={() => void syncNow()}>Try again</Button>
          <Link to="/account" className="btn btn-secondary btn-block">Replace the credentials</Link>
        </>
      ) : (
        <div className="progresspanel" role="status" aria-live="polite">
          <strong>Syncing…</strong>
          <div className="progressbar"><div /></div>
          <span className="muted">Credentials accepted. Your client secret is stored encrypted.</span>
        </div>
      )}
    </div>
  );
}
