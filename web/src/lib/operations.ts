// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import type { OperationKind, OperationStatus } from "../graphql/generated/graphql";
import type { Tone } from "./status";

export interface OperationView {
  label: string;
  tone: Tone;
  spinner: boolean;
}

const VIEWS: Record<OperationStatus, OperationView> = {
  PLANNED: { label: "Planned, not sent", tone: "warn", spinner: false },
  CONFIRMED: { label: "Confirmed", tone: "info", spinner: true },
  RUNNING: { label: "In progress", tone: "info", spinner: true },
  SUCCEEDED: { label: "Succeeded", tone: "ok", spinner: false },
  FAILED: { label: "Failed", tone: "danger", spinner: false },
  CANCELLED: { label: "Cancelled", tone: "neutral", spinner: false },
};

export const operationView = (status: OperationStatus): OperationView => VIEWS[status];

const KINDS: Record<OperationKind, string> = { CREATE: "Create", UPDATE: "Update", DELETE: "Delete", PAUSE: "Pause", RESUME: "Resume" };
export const kindLabel = (kind: OperationKind): string => KINDS[kind];

/** Which filter chip an operation belongs under on the Operations page. */
export type OperationFilter = "all" | "active" | "planned" | "failed";

export function matchesOperationFilter(status: OperationStatus, filter: OperationFilter): boolean {
  switch (filter) {
    case "all": return true;
    case "active": return status === "CONFIRMED" || status === "RUNNING";
    case "planned": return status === "PLANNED";
    case "failed": return status === "FAILED";
  }
}

/** "4 min", "8 s", "1 h 05 min". Empty when it has not finished. */
export function duration(startIso?: string | null, endIso?: string | null): string {
  const start = startIso ? Date.parse(startIso) : Number.NaN;
  const end = endIso ? Date.parse(endIso) : Number.NaN;
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "";
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

/**
 * What to call the instance an operation was about. Normally that is the instance it points at. After the stored copy is reset, an
 * operation on an instance Aura no longer has points at nothing, so the name is read from the operation itself: the instance as it was
 * when the change was planned, or, for a create, the name that was asked for.
 */
export function operationSubject(op: { target: readonly { name: string }[]; before?: string | null; diff?: string | null }): string {
  const linked = op.target[0]?.name;
  if (linked) return linked;
  const named = (json: string | null | undefined, pick: (v: any) => unknown): string | undefined => {
    try {
      const value = pick(JSON.parse(json ?? ""));
      return typeof value === "string" && value !== "" ? value : undefined;
    } catch {
      return undefined;
    }
  };
  return named(op.before, (b) => b?.name) ?? named(op.diff, (d) => d?.items?.find((i: { field?: string }) => i?.field === "name")?.after) ?? "an instance";
}
