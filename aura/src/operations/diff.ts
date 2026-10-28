// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import { tierLabel } from "../status.js";
import type { CreateRequest, PlannableKind } from "./state.js";

/** The fields of an instance that a plan can change, or that it must find unchanged when it is confirmed. */
export interface Snapshot {
  name: string;
  status: string;
  memory: string | null;
  storage: string | null;
  vectorOptimized: boolean | null;
  graphAnalyticsPlugin: boolean | null;
}

export interface Changes {
  name?: string;
  memory?: string;
  storage?: string;
  vectorOptimized?: boolean;
  graphAnalyticsPlugin?: boolean;
}

export interface DiffItem {
  field: "name" | "memory" | "storage" | "vectorOptimized" | "graphAnalyticsPlugin" | "state" | "tenant" | "cloud" | "region" | "tier";
  label: string;
  before: string;
  after: string;
}

/** What the review screen shows: each thing that changes, and anything the person should know first. */
export interface Plan {
  items: DiffItem[];
  warnings: string[];
}

const onOff = (v: boolean | null) => (v === null ? "Unknown" : v ? "On" : "Off");

/** "8GB" becomes "8 GB". */
export function spaced(size: string | null): string {
  if (!size) return "None";
  const m = /^(\d+(?:\.\d+)?)\s*GB$/i.exec(size.trim());
  return m ? `${m[1]} GB` : size;
}

export function gigabytes(size: string | null): number {
  const m = size ? /^(\d+(?:\.\d+)?)\s*GB$/i.exec(size.trim()) : null;
  return m ? Number(m[1]) : Number.NaN;
}

const STATE_LABEL: Record<string, string> = { running: "Running", paused: "Paused" };

/**
 * The difference between an instance and what a change would make it. Only fields that really differ are listed, so "Nothing would
 * change" can be told apart from a change. Warnings say only what is known: nothing here claims what Aura will charge or allow.
 */
export function describe(kind: PlannableKind, before: Snapshot, changes: Changes): Plan {
  const items: DiffItem[] = [];
  const warnings: string[] = [];

  if (kind === "PAUSE") {
    items.push({ field: "state", label: "State", before: STATE_LABEL[before.status] ?? before.status, after: "Paused" });
    warnings.push("While it is paused the instance cannot be used, and connections to it will fail.");
    return { items, warnings };
  }
  if (kind === "RESUME") {
    items.push({ field: "state", label: "State", before: STATE_LABEL[before.status] ?? before.status, after: "Running" });
    return { items, warnings };
  }

  if (changes.name !== undefined && changes.name !== before.name) items.push({ field: "name", label: "Name", before: before.name, after: changes.name });
  if (changes.memory !== undefined && changes.memory !== before.memory) items.push({ field: "memory", label: "Memory", before: spaced(before.memory), after: spaced(changes.memory) });
  if (changes.storage !== undefined && changes.storage !== before.storage) items.push({ field: "storage", label: "Storage", before: spaced(before.storage), after: spaced(changes.storage) });
  if (changes.vectorOptimized !== undefined && changes.vectorOptimized !== before.vectorOptimized) {
    items.push({ field: "vectorOptimized", label: "Vector optimized", before: onOff(before.vectorOptimized), after: onOff(changes.vectorOptimized) });
  }
  if (changes.graphAnalyticsPlugin !== undefined && changes.graphAnalyticsPlugin !== before.graphAnalyticsPlugin) {
    items.push({ field: "graphAnalyticsPlugin", label: "Graph analytics plugin", before: onOff(before.graphAnalyticsPlugin), after: onOff(changes.graphAnalyticsPlugin) });
  }

  const [from, to] = [gigabytes(before.memory), gigabytes(changes.memory ?? null)];
  if (items.some((i) => i.field === "memory") && !Number.isNaN(from) && !Number.isNaN(to)) {
    if (to > from) warnings.push("A larger size may change what you are billed. Aura keeps the instance available while it resizes.");
    else if (to < from) warnings.push("Aura decides whether a smaller size is allowed. If it refuses, nothing changes.");
  }
  return { items, warnings };
}

/** Whether `current` already shows everything `changes` asks for. */
export function showsChanges(current: Snapshot, changes: Changes): boolean {
  return (
    (changes.name === undefined || current.name === changes.name) &&
    (changes.memory === undefined || current.memory === changes.memory) &&
    (changes.storage === undefined || current.storage === changes.storage) &&
    (changes.vectorOptimized === undefined || current.vectorOptimized === changes.vectorOptimized) &&
    (changes.graphAnalyticsPlugin === undefined || current.graphAnalyticsPlugin === changes.graphAnalyticsPlugin)
  );
}

/** True when the fields a plan depends on are the same now as when it was planned. */
export function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return a.name === b.name && a.status === b.status && a.memory === b.memory && a.storage === b.storage && a.vectorOptimized === b.vectorOptimized && a.graphAnalyticsPlugin === b.graphAnalyticsPlugin;
}

const CLOUD_LABEL: Record<string, string> = { gcp: "GCP", aws: "AWS", azure: "Azure" };

/** What a create would make. There is no "before", so it is left empty and the review shows only the new value. */
export function describeCreate(r: CreateRequest): Plan {
  const items: DiffItem[] = [
    { field: "name", label: "Name", before: "", after: r.name },
    { field: "tenant", label: "Tenant", before: "", after: r.tenantName },
    { field: "cloud", label: "Cloud", before: "", after: CLOUD_LABEL[r.cloudProvider] ?? r.cloudProvider },
    { field: "region", label: "Region", before: "", after: r.regionName },
    { field: "tier", label: "Tier", before: "", after: tierLabel(r.type) },
    { field: "memory", label: "Memory", before: "", after: spaced(r.memory) },
    { field: "storage", label: "Storage", before: "", after: spaced(r.storage) },
  ];
  if (r.vectorOptimized) items.push({ field: "vectorOptimized", label: "Vector optimized", before: "", after: "On" });
  if (r.graphAnalyticsPlugin) items.push({ field: "graphAnalyticsPlugin", label: "Graph analytics plugin", before: "", after: "On" });
  return {
    items,
    warnings: [
      "Creating an instance can change what you are billed. Aura decides, and this app does not know your plan.",
      "Aura shows the password once. This app stores it encrypted so you can show it later on the instance page.",
    ],
  };
}

/** What a delete would do. It cannot be undone, and the review says so before it asks for the name. */
export function describeDelete(before: Snapshot): Plan {
  return {
    items: [{ field: "state", label: "Instance", before: before.name, after: "Deleted" }],
    warnings: [
      "Deleting an instance cannot be undone. Aura cannot recover its data.",
      "The password this app stored for it is deleted too. Take a snapshot or an export first if you may need the data.",
    ],
  };
}
