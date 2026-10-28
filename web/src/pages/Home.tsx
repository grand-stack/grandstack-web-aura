// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "urql";
import { HomeQuery } from "../graphql/documents";
import type { InstanceCardFieldsFragment } from "../graphql/generated/graphql";
import { useApp, useRefreshOnSync, useTitle } from "../hooks";
import { cloudLabel, plural } from "../lib/format";
import { Button, EmptyState, Skeleton, TagLink } from "../ui";
import { Icon } from "../ui/Icon";
import { InstanceCard } from "../ui/InstanceCard";

function TagGroup({ label, tags }: { label: string; tags: { to: string; text: string }[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="taggroup">
      <span className="grouplabel">{label}</span>
      <div className="tagrow">{tags.map((t) => <TagLink key={t.to} to={t.to}>{t.text}</TagLink>)}</div>
    </div>
  );
}

function Row({ title, to, items }: { title: string; to: string; items: InstanceCardFieldsFragment[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title}>
      <div className="rowhead"><h2>{title}</h2><Link to={to}>See all</Link></div>
      <div className="cardrow">{items.map((i) => <InstanceCard key={i.auraId} instance={i} layout="tile" />)}</div>
    </section>
  );
}

/** Hero with search and tags, then rows of cards, like the movie app's home page. */
export function Home() {
  useTitle("");
  const navigate = useNavigate();
  const { setup, syncNow, syncing } = useApp();
  const [{ data }, refetch] = useQuery({ query: HomeQuery });
  useRefreshOnSync(() => refetch({ requestPolicy: "network-only" }), setup.lastSyncAt);
  const [q, setQ] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(q.trim() ? `/instances?q=${encodeURIComponent(q.trim())}` : "/instances");
  };

  const total = data?.total.totalCount ?? 0;
  const tenants = data?.tenants.filter((t) => t.instancesConnection.totalCount > 0) ?? [];
  const noInstances = data !== undefined && total === 0;

  return (
    <div className="page">
      <section className="hero">
        <span className="eyebrow">Neo4j Aura</span>
        <h1>Find an instance</h1>
        <p className="sub">{data ? `${plural(total, "instance")} across ${plural(tenants.length, "tenant")}` : "Reading the stored copy of your account…"}</p>
        <form className="searchbar" onSubmit={submit} role="search">
          <label htmlFor="home-search" className="visually-hidden">Search instances by name</label>
          <input id="home-search" className="input" type="search" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button type="submit" variant="primary">Search</Button>
        </form>
        <div className="tagsections">
          <TagGroup label="Tenant" tags={tenants.map((t) => ({ to: `/instances?t=${encodeURIComponent(t.auraId)}`, text: `${t.name} · ${t.instancesConnection.totalCount}` }))} />
          <TagGroup
            label="Cloud"
            tags={(data?.cloudProviders ?? []).filter((c) => c.instancesConnection.totalCount > 0).map((c) => ({ to: `/instances?c=${encodeURIComponent(c.name)}`, text: `${cloudLabel(c.name)} · ${c.instancesConnection.totalCount}` }))}
          />
          <TagGroup
            label="Tier"
            tags={(data?.tiers ?? []).filter((t) => t.instancesConnection.totalCount > 0).map((t) => ({ to: `/instances?tier=${encodeURIComponent(t.type)}`, text: `${t.label} · ${t.instancesConnection.totalCount}` }))}
          />
        </div>
      </section>

      {!data && <div className="cardrow">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="skeleton-card" />)}</div>}
      {data && (
        <>
          <Row title="Needs attention" to="/instances?st=FAILED,IN_PROGRESS,STOPPED" items={data.attention} />
          <Row title="Running" to="/instances?st=READY" items={data.running} />
        </>
      )}
      {noInstances && (
        <EmptyState title="No instances yet">
          <p className="muted">Instances in your Aura account appear here after a sync. If you have none in Aura, there is nothing to show.</p>
          <Button variant="primary" onClick={() => void syncNow()} disabled={syncing}><Icon name="sync" size={18} />Sync now</Button>
        </EmptyState>
      )}
    </div>
  );
}
