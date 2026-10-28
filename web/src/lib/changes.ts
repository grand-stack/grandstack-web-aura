// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import type { InstanceChange, OperationKind, StepStatus } from "../graphql/generated/graphql";
import { gigabytes } from "./format";

/** One thing a plan changes, as the aura subgraph wrote it for the review screen. */
export interface PlanItem {
  field: string;
  label: string;
  before: string;
  after: string;
}

export interface PlanView {
  items: PlanItem[];
  warnings: string[];
}

/** The plan is stored as JSON text. Read it without ever throwing: a bad or missing value is an empty plan, not a broken page. */
export function parsePlan(json: string | null | undefined): PlanView {
  try {
    const raw = JSON.parse(json ?? "") as { items?: unknown; warnings?: unknown };
    const items = Array.isArray(raw.items)
      ? raw.items.filter((i): i is PlanItem => !!i && typeof i === "object" && ["label", "before", "after"].every((k) => typeof (i as Record<string, unknown>)[k] === "string"))
      : [];
    const warnings = Array.isArray(raw.warnings) ? raw.warnings.filter((w): w is string => typeof w === "string") : [];
    return { items, warnings };
  } catch {
    return { items: [], warnings: [] };
  }
}

export const MAX_NAME = 30;

/** Characters, not bytes: "é" is one. The store trims the name, so this does too. */
export const nameLength = (name: string): number => [...name.trim()].length;

export function nameError(name: string): string | undefined {
  const length = nameLength(name);
  if (length === 0) return "The name cannot be empty.";
  if (length > MAX_NAME) return `The name can be at most ${MAX_NAME} characters.`;
  return undefined;
}

export interface SizeOption {
  memory: string;
  storage: string;
}

export const sizeKey = (o: SizeOption): string => `${o.memory}|${o.storage}`;

/** The offered pairs, each once, smallest first. */
export function sizeOptions(raw: readonly SizeOption[]): SizeOption[] {
  const seen = new Map(raw.map((o) => [sizeKey(o), o]));
  return [...seen.values()].sort((a, b) => gigabytes(a.memory) - gigabytes(b.memory) || gigabytes(a.storage) - gigabytes(b.storage));
}

export interface EditOriginal {
  name: string;
  memory: string | null;
  storage: string | null;
  vectorOptimized: boolean | null;
  graphAnalyticsPlugin: boolean | null;
}

export interface EditForm {
  name: string;
  /** sizeKey of the chosen pair, or "" when the instance has none (a free instance). */
  size: string;
  vectorOptimized: boolean | null;
  graphAnalyticsPlugin: boolean | null;
}

export function formFromInstance(i: EditOriginal): EditForm {
  return {
    name: i.name,
    size: i.memory && i.storage ? sizeKey({ memory: i.memory, storage: i.storage }) : "",
    vectorOptimized: i.vectorOptimized,
    graphAnalyticsPlugin: i.graphAnalyticsPlugin,
  };
}

/**
 * What to send for the plan: only what the person changed. Memory and storage always go together. `changed` says whether there is
 * anything to review at all, so the button can stay off until there is.
 */
export function buildChange(original: EditOriginal, form: EditForm): { input: InstanceChange; changed: boolean } {
  const input: InstanceChange = {};
  const name = form.name.trim();
  if (name !== original.name) input.name = name;
  const current = original.memory && original.storage ? sizeKey({ memory: original.memory, storage: original.storage }) : "";
  if (form.size && form.size !== current) {
    const [memory, storage] = form.size.split("|");
    input.memory = memory;
    input.storage = storage;
  }
  if (form.vectorOptimized !== null && form.vectorOptimized !== original.vectorOptimized) input.vectorOptimized = form.vectorOptimized;
  if (form.graphAnalyticsPlugin !== null && form.graphAnalyticsPlugin !== original.graphAnalyticsPlugin) input.graphAnalyticsPlugin = form.graphAnalyticsPlugin;
  return { input, changed: Object.keys(input).length > 0 };
}

/** "Resize", "Rename" or "Edit" for an update, from what it changes; "Pause" and "Resume" for those. */
export function operationVerb(kind: OperationKind, items: readonly PlanItem[]): string {
  if (kind === "PAUSE") return "Pause";
  if (kind === "RESUME") return "Resume";
  if (kind === "CREATE") return "Create";
  if (kind === "DELETE") return "Delete";
  if (items.some((i) => i.field === "memory" || i.field === "storage")) return "Resize";
  if (items.length === 1 && items[0]!.field === "name") return "Rename";
  return "Edit";
}

export interface StepLike {
  seq: number;
  label: string;
  status: StepStatus;
  detail?: string | null;
  at?: string | null;
}

export interface Progress {
  total: number;
  /** Steps finished. */
  done: number;
  /** The step in progress, or the first that has not started. Undefined when all are done. */
  current: StepLike | undefined;
  /** The step that failed, if one did. */
  failed: StepLike | undefined;
}

export function progressOf(steps: readonly StepLike[]): Progress {
  const ordered = [...steps].sort((a, b) => a.seq - b.seq);
  const done = ordered.filter((s) => s.status === "DONE").length;
  const failed = ordered.find((s) => s.status === "FAILED");
  const current = ordered.find((s) => s.status === "ACTIVE") ?? ordered.find((s) => s.status === "PENDING");
  return { total: ordered.length, done, current, failed };
}

/** "03:12", or "1:05:09" past an hour. An unfinished operation counts up to `now`. */
export function elapsed(startIso: string | null | undefined, endIso: string | null | undefined, now: number): string {
  const start = startIso ? Date.parse(startIso) : Number.NaN;
  if (Number.isNaN(start)) return "";
  const end = endIso ? Date.parse(endIso) : now;
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  const [h, m, s] = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60];
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}
