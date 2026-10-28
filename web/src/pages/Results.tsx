// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "urql";
import { FilterPanel, type Facets } from "../FilterPanel";
import { ResultsQuery } from "../graphql/documents";
import { useApp, useDebounced, useRefreshOnSync, useTitle } from "../hooks";
import { SORTS, activeCount, baseWhere, buildWhere, emptyFilters, parseFilters, serializeFilters, sortInstances, statusCountWhere, type Filters, type SortKey } from "../lib/filters";
import { cloudLabel, plural } from "../lib/format";
import { STATUS_GROUPS } from "../lib/status";
import { Banner, Button, EmptyState, RemovableTag, Skeleton } from "../ui";
import { Icon } from "../ui/Icon";
import { InstanceCard } from "../ui/InstanceCard";
import { Modal } from "../ui/Modal";

/** The card grid with filters: a sidebar on a wide screen, a sheet on a phone. The filters live in the URL, so a view can be shared. */
export function Results() {
  useTitle("Instances");
  const { setup } = useApp();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  const [sheet, setSheet] = useState(false);

  const setFilters = (next: Partial<Filters>) => setParams(serializeFilters({ ...filters, ...next }), { replace: true });

  // The search box keeps its own text and writes the URL after a short pause, so typing does not query on every key
  const [text, setText] = useState(filters.q);
  const debounced = useDebounced(text, 250);
  useEffect(() => {
    if (debounced !== filters.q) setFilters({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  useEffect(() => setText(filters.q), [filters.q]);

  const variables = useMemo(
    () => ({
      where: buildWhere(filters),
      base: baseWhere(filters),
      noTenant: buildWhere(filters, "tenants"),
      noCloud: buildWhere(filters, "clouds"),
      noTier: buildWhere(filters, "tiers"),
      ready: statusCountWhere(filters, "READY"),
      stopped: statusCountWhere(filters, "STOPPED"),
      inProgress: statusCountWhere(filters, "IN_PROGRESS"),
      failed: statusCountWhere(filters, "FAILED"),
    }),
    [filters],
  );
  const [{ data, fetching, error }, refetch] = useQuery({ query: ResultsQuery, variables });
  useRefreshOnSync(() => refetch({ requestPolicy: "network-only" }), setup.lastSyncAt);

  const facets: Facets = useMemo(
    () => ({
      tenants: (data?.tenants ?? []).map((t) => ({ value: t.auraId, label: t.name, count: t.instancesConnection.totalCount })),
      clouds: (data?.cloudProviders ?? []).map((c) => ({ value: c.name, label: cloudLabel(c.name), count: c.instancesConnection.totalCount })),
      tiers: (data?.tiers ?? []).map((t) => ({ value: t.type, label: t.label, count: t.instancesConnection.totalCount })),
      statuses: data
        ? STATUS_GROUPS.map((g) => ({
            value: g.key,
            label: g.label,
            count: { READY: data.ready, STOPPED: data.stopped, IN_PROGRESS: data.inProgress, FAILED: data.failed }[g.key].totalCount,
          }))
        : [],
    }),
    [data],
  );

  const items = useMemo(() => sortInstances(data?.items ?? [], filters.sort), [data, filters.sort]);
  const matching = data?.matching.totalCount ?? 0;
  const all = data?.all.totalCount ?? 0;
  const count = activeCount(filters);

  // What is on, as removable chips, labelled with names (not ids)
  const nameOf = (list: { value: string; label: string }[], value: string) => list.find((o) => o.value === value)?.label ?? value;
  const chips: { key: string; label: string; remove: () => void }[] = [
    ...(filters.q.trim() ? [{ key: "q", label: `“${filters.q.trim()}”`, remove: () => setFilters({ q: "" }) }] : []),
    ...filters.tenants.map((v) => ({ key: `t-${v}`, label: nameOf(facets.tenants, v), remove: () => setFilters({ tenants: filters.tenants.filter((x) => x !== v) }) })),
    ...filters.clouds.map((v) => ({ key: `c-${v}`, label: cloudLabel(v), remove: () => setFilters({ clouds: filters.clouds.filter((x) => x !== v) }) })),
    ...filters.tiers.map((v) => ({ key: `tier-${v}`, label: nameOf(facets.tiers, v), remove: () => setFilters({ tiers: filters.tiers.filter((x) => x !== v) }) })),
    ...filters.statuses.map((v) => ({ key: `st-${v}`, label: nameOf(facets.statuses, v), remove: () => setFilters({ statuses: filters.statuses.filter((x) => x !== v) }) })),
    ...(filters.showRemoved ? [{ key: "rm", label: "Including removed", remove: () => setFilters({ showRemoved: false }) }] : []),
  ];

  return (
    <div className="page">
      <div className="results">
        <h1 className="visually-hidden">Instances</h1>
        <div className="toolbar">
          <div className="grow">
            <label htmlFor="results-search" className="visually-hidden">Search instances by name</label>
            <input id="results-search" className="input" type="search" placeholder="Search by name" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <Button className="filtersbutton" onClick={() => setSheet(true)} aria-haspopup="dialog">
            <Icon name="filter" size={18} />Filters{count > 0 && <span className="badge" aria-label={`${count} on`}>{count}</span>}
          </Button>
          <label className="right">
            <span>Sort</span>
            <select className="input" style={{ width: "auto", minHeight: 44 }} value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value as SortKey })}>
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
        </div>

        {chips.length > 0 && (
          <div className="tagrow" style={{ flexWrap: "wrap" }} aria-label="Filters that are on">
            {chips.map((c) => <RemovableTag key={c.key} label={c.label} onRemove={c.remove}>{c.label}</RemovableTag>)}
            <Button variant="ghost" onClick={() => setParams(serializeFilters({ ...emptyFilters, sort: filters.sort }), { replace: true })}>Clear all</Button>
          </div>
        )}

        <div className="layout">
          <aside className="sidebar" aria-label="Filters">
            <FilterPanel filters={filters} facets={facets} onChange={setFilters} />
          </aside>
          <main>
            <p className="countline" role="status" aria-live="polite">
              {data ? (matching === all ? plural(matching, "instance") : `${matching} of ${plural(all, "instance")}`) : "Loading…"}
            </p>
            {error && <Banner tone="danger">Could not read the stored instances. Check that the server is running.</Banner>}
            {!data && fetching && <div className="cards">{[0, 1, 2].map((i) => <Skeleton key={i} className="skeleton-line" />)}</div>}
            {data && items.length > 0 && <div className="cards">{items.map((i) => <InstanceCard key={i.auraId} instance={i} />)}</div>}
            {data && items.length === 0 && (
              <EmptyState title={all === 0 ? "No instances yet" : "Nothing matches"}>
                <p className="muted">{all === 0 ? "Instances appear here after a sync." : "No instance fits all of those filters."}</p>
                {count > 0 && <Button onClick={() => setParams(serializeFilters({ ...emptyFilters, sort: filters.sort }), { replace: true })}>Clear all filters</Button>}
              </EmptyState>
            )}
          </main>
        </div>
      </div>

      <Modal
        open={sheet}
        onClose={() => setSheet(false)}
        title="Filters"
        footer={
          <>
            {count > 0 && <Button onClick={() => setParams(serializeFilters({ ...emptyFilters, sort: filters.sort }), { replace: true })}>Clear all</Button>}
            <Button variant="primary" onClick={() => setSheet(false)}>Show {plural(matching, "instance")}</Button>
          </>
        }
      >
        <FilterPanel filters={filters} facets={facets} onChange={setFilters} />
      </Modal>
    </div>
  );
}
