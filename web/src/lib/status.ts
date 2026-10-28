// Copyright (c) "Neo4j"
// Neo4j Sweden AB [http://neo4j.com]
import type { InstanceStatusGroup } from "../graphql/generated/graphql";

export type Tone = "ok" | "info" | "neutral" | "danger" | "warn";
export type StatusIcon = "dot" | "pause" | "stop" | "spinner" | "alert";

export interface StatusView {
  label: string;
  tone: Tone;
  /** Every status has an icon and a word, so colour is never the only signal. */
  icon: StatusIcon;
}

/** The 13 statuses the Aura API reports, as shown to people. */
const VIEWS: Record<string, StatusView> = {
  running: { label: "Running", tone: "ok", icon: "dot" },
  paused: { label: "Paused", tone: "neutral", icon: "pause" },
  suspended: { label: "Suspended", tone: "neutral", icon: "stop" },
  creating: { label: "Creating", tone: "info", icon: "spinner" },
  updating: { label: "Updating", tone: "info", icon: "spinner" },
  pausing: { label: "Pausing", tone: "info", icon: "spinner" },
  resuming: { label: "Resuming", tone: "info", icon: "spinner" },
  suspending: { label: "Suspending", tone: "info", icon: "spinner" },
  loading: { label: "Loading", tone: "info", icon: "spinner" },
  restoring: { label: "Restoring", tone: "info", icon: "spinner" },
  overwriting: { label: "Overwriting", tone: "info", icon: "spinner" },
  destroying: { label: "Deleting", tone: "danger", icon: "spinner" },
  "loading failed": { label: "Loading failed", tone: "danger", icon: "alert" },
};

export const KNOWN_STATUSES = Object.keys(VIEWS);

/** A status this app does not know is shown as in progress, in its own words, never hidden. */
export function statusView(status: string): StatusView {
  return VIEWS[status] ?? { label: status.charAt(0).toUpperCase() + status.slice(1), tone: "info", icon: "spinner" };
}

export const STATUS_GROUPS: { key: InstanceStatusGroup; label: string }[] = [
  { key: "READY", label: "Ready" },
  { key: "STOPPED", label: "Stopped" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "FAILED", label: "Failed" },
];

/** While an instance is in progress Aura answers 409 to another operation, so Edit, Pause and Delete are not offered. */
export function actionsLocked(group: InstanceStatusGroup): boolean {
  return group === "IN_PROGRESS";
}
