// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import type { InstanceStatusGroup, InstanceWhere } from "../graphql/generated/graphql";
import { gigabytes } from "./format";

export type SortKey = "name" | "newest" | "status" | "memory";

export const SORTS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name A to Z" },
  { key: "newest", label: "Newest first" },
  { key: "status", label: "Needs attention first" },
  { key: "memory", label: "Largest first" },
];

const GROUPS: InstanceStatusGroup[] = ["READY", "STOPPED", "IN_PROGRESS", "FAILED"];

export interface Filters {
  q: string;
  /** Tenant ids. */
  tenants: string[];
  /** gcp, aws, azure. */
  clouds: string[];
  /** Aura instance types, for example professional-db. */
  tiers: string[];
  statuses: InstanceStatusGroup[];
  /** Include instances that Aura no longer lists. */
  showRemoved: boolean;
  sort: SortKey;
}

export const emptyFilters: Filters = { q: "", tenants: [], clouds: [], tiers: [], statuses: [], showRemoved: false, sort: "name" };

const list = (v: string | null) => v?.split(",").map((x) => x.trim()).filter(Boolean) ?? [];

export function parseFilters(params: URLSearchParams): Filters {
  const sort = params.get("s") as SortKey | null;
  return {
    q: params.get("q") ?? "",
    tenants: list(params.get("t")),
    clouds: list(params.get("c")),
    tiers: list(params.get("tier")),
    statuses: list(params.get("st")).filter((s): s is InstanceStatusGroup => GROUPS.includes(s as InstanceStatusGroup)),
    showRemoved: params.get("rm") === "1",
    sort: SORTS.some((s) => s.key === sort) ? (sort as SortKey) : "name",
  };
}

export function serializeFilters(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.tenants.length) p.set("t", f.tenants.join(","));
  if (f.clouds.length) p.set("c", f.clouds.join(","));
  if (f.tiers.length) p.set("tier", f.tiers.join(","));
  if (f.statuses.length) p.set("st", f.statuses.join(","));
  if (f.showRemoved) p.set("rm", "1");
  if (f.sort !== "name") p.set("s", f.sort);
  return p;
}

/** How many filters are on, for the badge on the Filters button. The sort is not a filter. */
export function activeCount(f: Filters): number {
  return (f.q.trim() ? 1 : 0) + f.tenants.length + f.clouds.length + f.tiers.length + f.statuses.length + (f.showRemoved ? 1 : 0);
}

/** Name search is case-sensitive in the store, so match as typed, in lower case and in Title Case. */
export function nameVariants(q: string): string[] {
  const titled = q.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  return [...new Set([q, q.toLowerCase(), titled])];
}

export type Facet = "tenants" | "clouds" | "tiers" | "statuses";

const NOT_REMOVED: InstanceWhere = { deletedInAuraAt: { eq: null } };

/** Instances that count at all: everything, except those Aura no longer lists unless asked. */
export function baseWhere(f: Filters): InstanceWhere {
  return f.showRemoved ? {} : NOT_REMOVED;
}

/**
 * The where for the filters. `omit` leaves one facet's own filter out, so that facet's counts say what picking each option would
 * give, keeping all the other filters. Ticking one cloud then still shows how many instances each other cloud would give.
 */
export function buildWhere(f: Filters, omit?: Facet): InstanceWhere {
  const and: InstanceWhere[] = [];
  if (!f.showRemoved) and.push(NOT_REMOVED);
  if (f.q.trim()) and.push({ OR: nameVariants(f.q.trim()).map((v) => ({ name: { contains: v } })) });
  if (omit !== "tenants" && f.tenants.length) and.push({ tenant: { some: { auraId: { in: f.tenants } } } });
  if (omit !== "clouds" && f.clouds.length) and.push({ cloud: { some: { name: { in: f.clouds } } } });
  if (omit !== "tiers" && f.tiers.length) and.push({ tier: { some: { type: { in: f.tiers } } } });
  if (omit !== "statuses" && f.statuses.length) and.push({ statusGroup: { in: f.statuses } });
  return and.length ? { AND: and } : {};
}

/** The where for counting one status group, keeping every other filter. */
export function statusCountWhere(f: Filters, group: InstanceStatusGroup): InstanceWhere {
  return { AND: [buildWhere(f, "statuses"), { statusGroup: { eq: group } }] };
}

const ATTENTION_RANK: Record<InstanceStatusGroup, number> = { FAILED: 0, IN_PROGRESS: 1, STOPPED: 2, READY: 3 };

interface Sortable {
  name: string;
  createdAt?: string | null;
  statusGroup: InstanceStatusGroup;
  memory?: string | null;
}

const byName = (a: Sortable, b: Sortable) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

/**
 * Sorting happens here, not in the store: memory is text there ("16GB" sorts before "2GB"), and the list is small.
 * Ties and missing values fall back to the name, so the order is always the same.
 */
export function sortInstances<T extends Sortable>(items: readonly T[], key: SortKey): T[] {
  const copy = [...items];
  switch (key) {
    case "name":
      return copy.sort(byName);
    case "newest":
      return copy.sort((a, b) => (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0) || byName(a, b));
    case "status":
      return copy.sort((a, b) => ATTENTION_RANK[a.statusGroup] - ATTENTION_RANK[b.statusGroup] || byName(a, b));
    case "memory":
      return copy.sort((a, b) => {
        const [x, y] = [gigabytes(a.memory), gigabytes(b.memory)];
        if (Number.isNaN(x) !== Number.isNaN(y)) return Number.isNaN(x) ? 1 : -1;
        return (Number.isNaN(x) ? 0 : y - x) || byName(a, b);
      });
  }
}
