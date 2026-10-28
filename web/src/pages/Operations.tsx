// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "urql";
import { OperationsQuery } from "../graphql/documents";
import { useApp, useRefreshOnSync, useTitle } from "../hooks";
import { formatDate, relativeTime } from "../lib/format";
import { duration, kindLabel, matchesOperationFilter, operationView, type OperationFilter } from "../lib/operations";
import { Banner, EmptyState, Skeleton, StatusChip, TagButton } from "../ui";

const FILTERS: { key: OperationFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "planned", label: "Planned" },
  { key: "failed", label: "Failed" },
];

/** Every change made through this app, newest first. Empty until changes can be planned, which arrives in a later phase. */
export function Operations() {
  useTitle("Operations");
  const { setup } = useApp();
  const [filter, setFilter] = useState<OperationFilter>("all");
  const [{ data, fetching, error }, refetch] = useQuery({ query: OperationsQuery });
  useRefreshOnSync(() => refetch({ requestPolicy: "network-only" }), setup.lastSyncAt);

  const operations = data?.operations ?? [];
  const shown = useMemo(() => operations.filter((o) => matchesOperationFilter(o.status, filter)), [operations, filter]);
  const countFor = (f: OperationFilter) => operations.filter((o) => matchesOperationFilter(o.status, f)).length;

  return (
    <div className="page">
      <div className="hero">
        <h1>Operations</h1>
        <p className="sub">Every change made through this app. Nothing is sent to Aura until it is confirmed.</p>
      </div>
      {error && <Banner tone="danger">Could not read the operations. Check that the server is running.</Banner>}
      {!data && fetching && <Skeleton className="skeleton-line" />}
      {data && operations.length === 0 && (
        <EmptyState title="No changes yet">
          <p className="muted">When you plan a change to an instance, review it and confirm it, it appears here with its progress. Nothing has been planned yet.</p>
          <Link to="/instances" className="btn btn-secondary">See instances</Link>
        </EmptyState>
      )}
      {operations.length > 0 && (
        <>
          <div className="tagrow" role="group" aria-label="Filter by state">
            {FILTERS.map((f) => (
              <TagButton key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>{f.label} · {countFor(f.key)}</TagButton>
            ))}
          </div>
          <div className="panel">
            {shown.length === 0 && <p className="empty">Nothing in that state.</p>}
            {shown.map((op) => {
              const view = operationView(op.status);
              const target = op.target[0];
              const took = duration(op.createdAt, op.finishedAt);
              return (
                <div className="listrow" key={op.id}>
                  <div className="main">
                    <div className="title">
                      <Link to={`/operations/${encodeURIComponent(op.id)}`}>{kindLabel(op.kind)} {target ? target.name : "a new instance"}</Link>
                    </div>
                    <div className="sub" title={formatDate(op.createdAt)}>
                      {relativeTime(op.createdAt)}{took ? ` · took ${took}` : ""}{op.requestedBy ? ` · ${op.requestedBy}` : ""}{op.error ? ` · ${op.error}` : ""}
                    </div>
                  </div>
                  <StatusChip label={view.label} tone={view.tone} />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
