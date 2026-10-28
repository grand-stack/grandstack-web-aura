// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { useCallback, useEffect, useState } from "react";
import { useMutation } from "urql";
import { RevealMutation } from "../graphql/documents";
import { errorMessage } from "../hooks";
import { CopyButton } from ".";
import { Icon } from "./Icon";

/** How long a shown password stays on screen. */
export const HIDE_AFTER_MS = 30_000;

/**
 * The stored password, hidden until the eye is clicked. Showing it asks the server, which records that it was shown; the password is
 * held only in this component, hidden again after a while or when the tab is hidden, and never written to storage or the URL.
 */
export function PasswordField({ instanceId, onShown }: { instanceId: string; onShown: () => void }) {
  const [{ fetching, error }, reveal] = useMutation(RevealMutation);
  const [shown, setShown] = useState<string>();

  const hide = useCallback(() => setShown(undefined), []);
  useEffect(() => {
    if (shown === undefined) return;
    const timer = window.setTimeout(hide, HIDE_AFTER_MS);
    const onVisibility = () => document.hidden && hide();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [shown, hide]);

  const toggle = async () => {
    if (shown !== undefined) return hide();
    const result = await reveal({ instanceId });
    if (result.data) {
      setShown(result.data.revealInstancePassword.password);
      onShown();
    }
  };

  return (
    <>
      <div className="copyrow">
        <div className="main">
          <div className="k">Password</div>
          <div className={`v${shown === undefined ? "" : " mono revealed"}`} aria-live="polite" data-state={shown === undefined ? "hidden" : "shown"}>
            {shown === undefined ? <span aria-label="Hidden">••••••••••••</span> : shown}
          </div>
        </div>
        {shown !== undefined && <CopyButton text={shown} label="password" />}
        <button type="button" className="iconbtn" onClick={() => void toggle()} disabled={fetching} aria-pressed={shown !== undefined} aria-label={shown === undefined ? "Show password" : "Hide password"} title={shown === undefined ? "Show password" : "Hide password"}>
          <Icon name={shown === undefined ? "eye" : "eyeoff"} />
        </button>
      </div>
      {error && <p className="note" role="alert">{errorMessage(error)}</p>}
      {shown !== undefined && <p className="note">Hidden again after {HIDE_AFTER_MS / 1000} seconds. Showing it is recorded.</p>}
    </>
  );
}
