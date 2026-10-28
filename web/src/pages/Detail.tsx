// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { Link, useParams } from "react-router";
import { useQuery } from "urql";
import { DetailQuery } from "../graphql/documents";
import { useApp, useNow, useRefreshOnSync, useTitle } from "../hooks";
import { cloudLabel, formatDate, memoryAndStorage, plural, relativeTime } from "../lib/format";
import { kindLabel, operationView } from "../lib/operations";
import { actionsLocked } from "../lib/status";
import { Banner, CopyButton, EmptyState, Skeleton, StatusChip, TagLink } from "../ui";
import { initials } from "../lib/format";
import { posterStyle } from "../lib/poster";

function Row({ k, children, mono }: { k: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="prow">
      <span className="k">{k}</span>
      <span className={`v${mono ? " mono" : ""}`}>{children}</span>
    </div>
  );
}

/** One instance, read from the stored copy. Changing it comes in a later phase; for now this page shows and explains. */
export function Detail() {
  const { id = "" } = useParams();
  const { setup } = useApp();
  const now = useNow();
  const [{ data, fetching }, refetch] = useQuery({ query: DetailQuery, variables: { id } });
  useRefreshOnSync(() => refetch({ requestPolicy: "network-only" }), setup.lastSyncAt);
  const instance = data?.instances[0];
  useTitle(instance?.name ?? "Instance");

  if (!data && fetching) {
    return (
      <div className="page">
        <Skeleton className="skeleton-line" />
        <Skeleton className="skeleton-card" />
      </div>
    );
  }
  if (!instance) {
    return (
      <div className="page">
        <EmptyState title="No instance with that id">
          <p className="muted">It may have been removed, or the link may be wrong.</p>
          <Link to="/instances" className="btn btn-secondary">See all instances</Link>
        </EmptyState>
      </div>
    );
  }

  const cloud = instance.cloud[0]?.name;
  const tier = instance.tier[0];
  const tenant = instance.tenant[0];
  const removed = instance.deletedInAuraAt !== null;
  const locked = actionsLocked(instance.statusGroup);

  return (
    <div className="page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/instances">Instances</Link>
        {tenant && <> / <Link to={`/instances?t=${encodeURIComponent(tenant.auraId)}`}>{tenant.name}</Link></>} / {instance.name}
      </nav>

      <header className="detailhead">
        <div className="poster" style={posterStyle(cloud, instance.name)} aria-hidden="true"><span className="letters">{initials(instance.name)}</span></div>
        <div>
          <h1>{instance.name}</h1>
          <div className="meta">
            {removed ? <StatusChip label="Removed from Aura" tone="neutral" /> : <StatusChip status={instance.status} />}
            {tenant && <TagLink small to={`/instances?t=${encodeURIComponent(tenant.auraId)}`}>{tenant.name}</TagLink>}
            {cloud && <TagLink small to={`/instances?c=${encodeURIComponent(cloud)}`}>{cloudLabel(cloud)}</TagLink>}
            {tier && <TagLink small to={`/instances?tier=${encodeURIComponent(tier.type)}`}>{tier.label}</TagLink>}
          </div>
        </div>
      </header>

      {removed && <Banner tone="warn">This instance is no longer in Aura. It was noticed missing {relativeTime(instance.deletedInAuraAt, now)}. The record is kept for history.</Banner>}
      {locked && !removed && <Banner>Aura is working on this instance ({instance.status}). Nothing can be changed until it finishes.</Banner>}

      <div className="grid2">
        <div className="stackgap">
          <section className="panel" aria-labelledby="connection-title">
            <h2 id="connection-title">Connection</h2>
            {instance.connectionUrl ? (
              <div className="copyrow">
                <div className="main"><div className="k">Connection URL</div><div className="v">{instance.connectionUrl}</div></div>
                <CopyButton text={instance.connectionUrl} label="connection URL" />
              </div>
            ) : (
              <div className="prow"><span className="k">Connection URL</span><span className="v muted">Not available yet</span></div>
            )}
            {instance.hasStoredPassword ? (
              <>
                {instance.credentialUsername && (
                  <div className="copyrow">
                    <div className="main"><div className="k">Username</div><div className="v">{instance.credentialUsername}</div></div>
                    <CopyButton text={instance.credentialUsername} label="username" />
                  </div>
                )}
                <div className="prow stack">
                  <span className="k">Password</span>
                  <span className="v">Stored encrypted{instance.passwordRevealCount > 0 ? ` · shown ${plural(instance.passwordRevealCount, "time")}` : ""}</span>
                </div>
                <p className="note">The password Aura gave when this instance was created. Showing it is not available yet.</p>
              </>
            ) : (
              <>
                <div className="prow stack">
                  <span className="k">Username and password</span>
                  <span className="v">Not stored</span>
                </div>
                <p className="note">This instance was found by a sync, not created here, so Aura never gave this app its password.</p>
              </>
            )}
          </section>

          <section className="panel" aria-labelledby="properties-title">
            <h2 id="properties-title">Properties</h2>
            {tenant && <Row k="Tenant">{tenant.name}</Row>}
            {tier && <Row k="Tier">{tier.label}</Row>}
            <Row k="Cloud and region">{[cloudLabel(cloud), instance.region].filter(Boolean).join(" ") || "Unknown"}</Row>
            <Row k="Memory and storage">{memoryAndStorage(instance.memory, instance.storage) || "Unknown"}</Row>
            {instance.version && <Row k="Neo4j version">{instance.version}</Row>}
            {instance.createdAt && <Row k="Created">{formatDate(instance.createdAt)}</Row>}
            {instance.vectorOptimized !== null && <Row k="Vector optimized">{instance.vectorOptimized ? "On" : "Off"}</Row>}
            {instance.graphAnalyticsPlugin !== null && <Row k="Graph analytics plugin">{instance.graphAnalyticsPlugin ? "On" : "Off"}</Row>}
            {instance.secondariesCount !== null && <Row k="Secondaries">{instance.secondariesCount}</Row>}
            {instance.cdcEnrichmentMode && <Row k="CDC enrichment">{instance.cdcEnrichmentMode}</Row>}
            {instance.graphNodes && <Row k="Nodes">{instance.graphNodes}</Row>}
            {instance.graphRelationships && <Row k="Relationships">{instance.graphRelationships}</Row>}
            <Row k="Instance id" mono>{instance.auraId}</Row>
          </section>
          <p className="muted" style={{ fontSize: 13 }}>Stored copy read from Aura {relativeTime(instance.syncedAt, now) || "at an unknown time"}.</p>
        </div>

        <section className="panel" aria-labelledby="ops-title">
          <h2 id="ops-title">Changes made here</h2>
          {instance.operations.length === 0 ? (
            <p className="empty">Nothing has been changed on this instance through this app.</p>
          ) : (
            instance.operations.map((op) => {
              const view = operationView(op.status);
              return (
                <div className="listrow" key={op.id}>
                  <div className="main">
                    <div className="title">{kindLabel(op.kind)}</div>
                    <div className="sub">{formatDate(op.createdAt)}{op.error ? ` · ${op.error}` : ""}</div>
                  </div>
                  <StatusChip label={view.label} tone={view.tone} />
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
