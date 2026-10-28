// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { Link, useParams } from "react-router";
import { useMutation, useQuery } from "urql";
import { CancelMutation, ConfirmMutation, OperationQuery } from "../graphql/documents";
import { errorMessage, useApp, useNow, usePoll, useTitle } from "../hooks";
import { elapsed, operationVerb, parsePlan, progressOf } from "../lib/changes";
import { formatDate } from "../lib/format";
import { operationView } from "../lib/operations";
import { Banner, Button, EmptyState, Skeleton, StatusChip } from "../ui";
import { Icon } from "../ui/Icon";

/** One change: reviewed while planned, followed while it runs, and read back once it has finished. */
export function OperationPage() {
  const { id = "" } = useParams();
  const { syncNow, refetchSetup } = useApp();
  const now = useNow(1000);
  const [{ data, fetching }, refetch] = useQuery({ query: OperationQuery, variables: { id }, requestPolicy: "cache-and-network" });
  const [{ fetching: confirming, error: confirmError }, confirm] = useMutation(ConfirmMutation);
  const [{ fetching: cancelling, error: cancelError }, cancel] = useMutation(CancelMutation);
  const op = data?.operations[0];
  const live = op?.status === "CONFIRMED" || op?.status === "RUNNING";
  usePoll(() => refetch({ requestPolicy: "network-only" }), 1500, live);
  const plan = parsePlan(op?.diff);
  const target = op?.target[0];
  const verb = op ? operationVerb(op.kind, plan.items) : "";
  useTitle(op ? `${verb} ${target?.name ?? "instance"}` : "Change");

  if (!data && fetching) return <div className="page narrow"><Skeleton className="skeleton-card" /></div>;
  if (!op) {
    return (
      <div className="page narrow">
        <EmptyState title="No change with that id"><p className="muted">The link may be wrong.</p><Link to="/operations" className="btn btn-secondary">See all changes</Link></EmptyState>
      </div>
    );
  }

  const view = operationView(op.status);
  const back = target ? `/instances/${encodeURIComponent(target.auraId)}` : "/instances";
  const progress = progressOf(op.steps);
  const error = errorMessage(confirmError) ?? errorMessage(cancelError);
  // A refused confirm because the instance moved on: the way out is a fresh plan
  const stale = !!error && /plan the change again/i.test(error);
  const finished = op.status === "SUCCEEDED" || op.status === "FAILED" || op.status === "CANCELLED";

  const onConfirm = async () => {
    const r = await confirm({ id: op.id });
    if (!r.error) refetch({ requestPolicy: "network-only" });
  };
  const onCancel = async () => {
    const r = await cancel({ id: op.id });
    if (!r.error) refetch({ requestPolicy: "network-only" });
  };

  return (
    <div className="page narrow">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/operations">Changes</Link> / {verb} {target?.name}</nav>
      <div className="hero">
        <h1>{verb} {target ? <Link to={back}>{target.name}</Link> : "instance"}</h1>
        <div className="meta"><StatusChip label={view.label} tone={view.tone} /></div>
      </div>

      {error && <Banner tone="danger">{error}{stale && <> <Link to={back}>Back to the instance</Link></>}</Banner>}

      {(op.status === "PLANNED" || plan.items.length > 0) && (
        <section className="panel" aria-labelledby="diff-title">
          <h2 id="diff-title">{op.status === "PLANNED" ? "What will change" : op.status === "SUCCEEDED" ? "What changed" : "What was asked"}</h2>
          {plan.items.length === 0 && <p className="empty">Nothing to show.</p>}
          {plan.items.map((item) => (
            <div className="diffrow" key={item.field}>
              <span className="k">{item.label}</span>
              <span className="v"><span className="before">{item.before}</span><Icon name="arrow" size={16} aria-label="becomes" /><span className="after">{item.after}</span></span>
            </div>
          ))}
        </section>
      )}

      {op.status === "PLANNED" && plan.warnings.map((w) => <Banner key={w} tone="warn">{w}</Banner>)}

      {op.steps.length > 0 && op.status !== "PLANNED" && (
        <section className="panel" aria-labelledby="progress-title">
          <h2 id="progress-title">Progress</h2>
          {live && (
            <div className="progresshead">
              <div className="progressbar" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label="Steps done"><div style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%`, animation: "none" }} /></div>
              <span className="muted">Step {Math.min(progress.done + 1, progress.total)} of {progress.total} · {elapsed(op.confirmedAt ?? op.createdAt, null, now)}</span>
            </div>
          )}
          <ol className="timeline">
            {op.steps.map((s) => (
              <li key={s.seq} className={`step step-${s.status.toLowerCase()}`}>
                <span className="mark" aria-hidden="true"><Icon name={s.status === "DONE" ? "check" : s.status === "FAILED" ? "alert" : s.status === "ACTIVE" ? "spinner" : "dot"} size={14} className={s.status === "ACTIVE" ? "spinner" : undefined} /></span>
                <span className="main"><span className="title">{s.label}</span>{s.detail && <span className="sub">{s.detail}</span>}</span>
                <span className="visually-hidden">{s.status.toLowerCase()}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {op.status === "SUCCEEDED" && <Banner>Done{op.finishedAt ? ` in ${elapsed(op.confirmedAt ?? op.createdAt, op.finishedAt, now)}` : ""}. The stored copy of the instance has been updated.</Banner>}
      {op.status === "FAILED" && (
        <>
          <Banner tone="danger">{op.error ?? "This change failed."}</Banner>
          <p className="muted">Not sure what state the instance is in? Sync reads it from Aura again.</p>
        </>
      )}
      {op.status === "CANCELLED" && <Banner>This change was cancelled. Nothing was sent to Aura.</Banner>}

      <p className="muted" style={{ fontSize: 13 }}>Planned {formatDate(op.createdAt)}{op.requestedBy && op.requestedBy !== "local" ? ` by ${op.requestedBy}` : ""}.</p>

      {op.status === "PLANNED" && (
        <div className="actionbar">
          <Button variant="secondary" onClick={onCancel} disabled={confirming || cancelling}>{cancelling ? "Cancelling…" : "Cancel"}</Button>
          <Button variant="primary" onClick={onConfirm} disabled={confirming || cancelling}>{confirming ? "Confirming…" : "Confirm and apply"}</Button>
        </div>
      )}
      {live && <p className="muted">You can leave this page. The change carries on, and this page picks it up again.</p>}
      {finished && (
        <div className="actionbar">
          {op.status === "FAILED" && <Button variant="secondary" onClick={() => { void syncNow(); refetchSetup(); }}>Sync now</Button>}
          <Link to={back} className="btn btn-primary">Back to the instance</Link>
        </div>
      )}
    </div>
  );
}
