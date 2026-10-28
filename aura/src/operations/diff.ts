// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import type { PlannableKind } from "./state.js";

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
  field: "name" | "memory" | "storage" | "vectorOptimized" | "graphAnalyticsPlugin" | "state";
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
